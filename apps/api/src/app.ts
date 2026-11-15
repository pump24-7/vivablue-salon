import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {z} from 'zod';
import {DateTime} from 'luxon';
import {pool,queryOne,transaction} from './db.js';
import {authentication,managerOnly} from './auth.js';
import {availableSlots,type Shift,type Block} from './scheduling.js';
import type {Config} from './config.js';
import {publicExperience,secureExperience} from './experience.js';
import {mediaRoutes} from './media.js';
import {quoteSalonService,type Modifier,type PeakRule} from './salon_pricing.js';

const uuid=z.string().uuid();
const localDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
function err(message:string,statusCode:number){return Object.assign(new Error(message),{statusCode})}
function pgError(e:any){if(e?.code==='23P01')return err('That time was just booked. Choose another slot.',409);
 if(e?.code==='23505')return err('Duplicate request.',409);return e}
async function audit(userId:string,action:string,id:string,details:unknown={}){
 await pool.query('INSERT INTO audit_logs(actor_id,action,resource_id,details) VALUES($1,$2,$3,$4)',[userId,action,id,JSON.stringify(details)]);
}
type ServiceRow={id:string,slug:string,name_en:string,name_es:string,duration_minutes:number|null,
 starting_price_cents:number|null,requires_consultation:boolean,is_bookable:boolean,buffer_minutes:number};
export async function buildApp(config:Config){
 const app=Fastify({logger:{redact:['req.headers.authorization','req.body.password','req.body.token']},bodyLimit:128*1024,trustProxy:false});
 await app.register(cors,{origin:config.CORS_ORIGINS.split(',').map(x=>x.trim())});
 await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
 const auth=authentication(config);
 const actor=(req:any)=>req.identity!.userId as string;
 app.setErrorHandler((error,req,reply)=>{
  req.log.error({err:error},'Request failed');
  if(error instanceof z.ZodError)return reply.code(400).send({message:'Invalid input',issues:error.issues});
  const known=pgError(error);const status=(known as any).statusCode??500;
  return reply.code(status).send({message:status>=500?'Internal error':known.message});
 });
 app.get('/health',async()=>({ok:true,app:'Viva Blue Salon'}));
 app.get('/api/catalog',async()=>({services:(await pool.query(
  'SELECT id,slug,name_en,name_es,description_en,description_es,duration_minutes,starting_price_cents,requires_consultation,is_bookable,buffer_minutes FROM services WHERE is_visible=true ORDER BY name_en')).rows}));
 app.get('/api/stylists',async req=>{
  const {serviceId}=z.object({serviceId:uuid.optional()}).parse(req.query);
  return {stylists:(await pool.query(`SELECT st.id,st.display_name,st.bio,st.salon_id,
   COALESCE(array_agg(ss.service_id) FILTER(WHERE ss.service_id IS NOT NULL),'{}') AS service_ids
   FROM stylists st LEFT JOIN stylist_services ss ON ss.stylist_id=st.id
   WHERE st.is_active=true AND ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM stylist_services s2
   WHERE s2.stylist_id=st.id AND s2.service_id=$1))
   GROUP BY st.id ORDER BY st.display_name`,[serviceId??null])).rows};
 });
 async function loadModifiers(serviceId:string,modifierIds:string[]):Promise<Modifier[]>{
  if(modifierIds.length>8||new Set(modifierIds).size!==modifierIds.length)throw err('Invalid modifier selection',400);
  if(!modifierIds.length)return [];
  const rows=(await pool.query<Modifier>(`SELECT id,label_en,label_es,additional_minutes,additional_price_cents
    FROM service_modifiers WHERE service_id=$1 AND is_enabled=true AND id=ANY($2::uuid[])`,[serviceId,modifierIds])).rows;
  if(rows.length!==modifierIds.length)throw err('Invalid or unavailable modifier',409);
  return modifierIds.map(id=>rows.find(m=>m.id===id)!);
 }
 async function peakRules(salonId:string):Promise<PeakRule[]>{
  return (await pool.query<PeakRule>(`SELECT weekday,start_local::text,end_local::text,surcharge_bps
    FROM peak_pricing_rules WHERE salon_id=$1 AND is_active=true AND approved_by IS NOT NULL`,[salonId])).rows;
 }
 async function slotsFor(serviceId:string,stylistId:string,date:string,modifierIds:string[]=[]){
  const s=await queryOne<ServiceRow>('SELECT * FROM services WHERE id=$1 AND is_visible=true',[serviceId]);
  if(!s)throw err('Service unavailable',404);
  if(!s.is_bookable||!s.duration_minutes)return {slots:[],reason:'Service requires salon approval before online booking.'};
  const selected=await loadModifiers(serviceId,modifierIds);
  const st=await queryOne<{id:string,salon_id:string,timezone:string}>(`SELECT st.id,st.salon_id,sa.timezone FROM stylists st
   JOIN salons sa ON sa.id=st.salon_id AND sa.is_active=true
   JOIN stylist_services ss ON ss.stylist_id=st.id AND ss.service_id=$2
   WHERE st.id=$1 AND st.is_active=true`,[stylistId,serviceId]);
  if(!st)throw err('Stylist not available for this service',404);
  const day=DateTime.fromISO(date,{zone:st.timezone});
  if(!day.isValid||day.toISODate()!==date)throw err('Invalid local date',400);
  if(day.startOf('day')>DateTime.now().setZone(st.timezone).plus({days:120}).endOf('day'))throw err('Date too far in future',400);
  const low=day.startOf('day').toUTC().toISO()!, high=day.plus({days:1}).startOf('day').toUTC().toISO()!;
  const shifts=(await pool.query<Shift>('SELECT weekday,start_local::text,end_local::text FROM stylist_shifts WHERE stylist_id=$1',[stylistId])).rows;
  const conflicts=(await pool.query<Block>(`SELECT start_at,end_at FROM appointments
   WHERE stylist_id=$1 AND status IN ('requested','confirmed','in_progress','cancel_requested')
   AND start_at < $3 AND end_at > $2
   UNION ALL SELECT start_at,end_at FROM stylist_time_off
   WHERE stylist_id=$1 AND start_at < $3 AND end_at > $2
   UNION ALL SELECT start_at,end_at FROM salon_closures
   WHERE salon_id=$4 AND start_at < $3 AND end_at > $2`,[stylistId,low,high,st.salon_id])).rows;
  return {slots:availableSlots({date,timezone:st.timezone,durationMinutes:s.duration_minutes+s.buffer_minutes+selected.reduce((n,m)=>n+m.additional_minutes,0),shifts,busy:conflicts}),
   service:s,stylist:st,selected,reason:null};
 }
 app.get('/api/availability',async req=>{
  const p=z.object({serviceId:uuid,stylistId:uuid,date:localDate,modifierIds:z.string().max(450).optional()}).parse(req.query);
  const ids=p.modifierIds?p.modifierIds.split(',').map(x=>uuid.parse(x)):[];
  const r=await slotsFor(p.serviceId,p.stylistId,p.date,ids);
  return {slots:r.slots,timezone:r.stylist?.timezone??'America/New_York',reason:r.reason};
 });
 await publicExperience(app);
 app.register(async protectedRoutes=>{
  protectedRoutes.addHook('preHandler',auth);
  protectedRoutes.get('/api/me',async req=>({user:await queryOne('SELECT id,display_name,role,preferred_language FROM users WHERE id=$1',[actor(req)])}));
  protectedRoutes.post('/api/bookings',async req=>{
   const v=z.object({serviceId:uuid,stylistId:uuid,startAt:z.string().datetime({offset:true}),
    idempotencyKey:uuid,customerNote:z.string().max(1000).optional(),modifierIds:z.array(uuid).max(8).default([]),consultationAck:z.boolean().default(false),policyAccepted:z.boolean().default(false)}).parse(req.body);
   const start=DateTime.fromISO(v.startAt).toUTC();
   if(!start.isValid)throw err('Invalid time',400);
   const previous=await queryOne<any>('SELECT * FROM appointments WHERE customer_id=$1 AND idempotency_key=$2',[actor(req),v.idempotencyKey]);
   if(previous)return {appointment:previous,alreadyCreated:true};
   const st=await queryOne<{timezone:string}>(`SELECT sa.timezone FROM stylists st JOIN salons sa ON sa.id=st.salon_id WHERE st.id=$1`,[v.stylistId]);
   if(!st)throw err('Stylist unavailable',404);
   const date=start.setZone(st.timezone).toISODate()!;
   const avail=await slotsFor(v.serviceId,v.stylistId,date,v.modifierIds);
   const normalized=start.toISO({suppressMilliseconds:true})!;
   if(!avail.slots.includes(normalized))throw err('Selected slot is unavailable. Refresh and choose another.',409);
   if(avail.service!.requires_consultation&&!v.consultationAck)throw err('Consultation acknowledgement required',400);
   const policy=await queryOne<{effective_at:string}>(`SELECT effective_at FROM salon_policies WHERE salon_id=$1 AND approved_by IS NOT NULL AND effective_at<=now()`,[avail.stylist!.salon_id]);
   if(!policy||!v.policyAccepted)throw err('Approved salon policy acknowledgement is required',409);
   const stylist=avail.stylist!;
   const ruleSet=await peakRules(stylist.salon_id);
   const quote=quoteSalonService({baseMinutes:avail.service!.duration_minutes!,bufferMinutes:avail.service!.buffer_minutes,
     basePriceCents:avail.service!.starting_price_cents,selected:avail.selected!,startsAt:normalized,
     timezone:stylist.timezone,peakRules:ruleSet});
   const end=start.plus({minutes:quote.occupiedMinutes});
   try{
    const appointment=await transaction(async c=>{
     // Database exclusion constraint rejects concurrent overlapping reservations.
     const r=await c.query(`INSERT INTO appointments
      (customer_id,salon_id,stylist_id,service_id,start_at,end_at,idempotency_key,quoted_price_cents,customer_note,
       selected_modifiers,price_breakdown,consultation_ack,policy_ack_at,policy_effective_at)
      SELECT $1,st.salon_id,st.id,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,now(),$12
      FROM stylists st JOIN services s ON s.id=$2 WHERE st.id=$11 AND st.is_active=true AND s.is_bookable=true
      RETURNING *`,[actor(req),v.serviceId,normalized,end.toISO(),v.idempotencyKey,quote.totalCents,
         v.customerNote??null,JSON.stringify(avail.selected),JSON.stringify(quote),v.consultationAck,v.stylistId,policy.effective_at]);
     if(!r.rowCount)throw err('Service or stylist no longer available',409);
     return r.rows[0];
    });
    await audit(actor(req),'booking.requested',appointment.id);
    return {appointment,alreadyCreated:false,message:'Request received. Salon confirmation is required.'};
   }catch(e:any){
    if(e.code==='23505'){
     const prior=await queryOne('SELECT * FROM appointments WHERE customer_id=$1 AND idempotency_key=$2',[actor(req),v.idempotencyKey]);
     if(prior)return {appointment:prior,alreadyCreated:true};
    }
    throw pgError(e);
   }
  });
  protectedRoutes.get('/api/bookings',async req=>({appointments:(await pool.query(`SELECT a.id,a.start_at,a.end_at,a.status,a.quoted_price_cents,
   s.name_en,s.name_es,st.display_name AS stylist_name FROM appointments a
   JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id
   WHERE a.customer_id=$1 ORDER BY a.start_at DESC LIMIT 100`,[actor(req)])).rows}));
  protectedRoutes.post('/api/bookings/:id/cancel-request',async req=>{
   const {id}=z.object({id:uuid}).parse(req.params);
   const result=await pool.query(`UPDATE appointments SET status='cancel_requested',updated_at=now()
    WHERE id=$1 AND customer_id=$2 AND status IN ('requested','confirmed') RETURNING id,status`,[id,actor(req)]);
   if(!result.rowCount)throw err('Booking cannot be changed automatically. Contact salon.',409);
   await audit(actor(req),'booking.cancel_requested',id);
   return {appointment:result.rows[0],message:'Cancellation requested. Salon will review.'};
  });
  protectedRoutes.get('/api/admin/bookings',{preHandler:managerOnly},async()=>({appointments:(await pool.query(`
   SELECT a.id,a.start_at,a.end_at,a.status,s.name_en,st.display_name AS stylist_name,u.display_name AS customer_name
   FROM appointments a JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id
   JOIN users u ON u.id=a.customer_id ORDER BY a.start_at DESC LIMIT 200`)).rows}));
  protectedRoutes.post('/api/admin/bookings/:id/status',{preHandler:managerOnly},async req=>{
   const {id}=z.object({id:uuid}).parse(req.params);
   const {status}=z.object({status:z.enum(['confirmed','declined','cancelled','completed'])}).parse(req.body);
   const allowed:Record<string,string[]>={confirmed:['requested'],declined:['requested'],cancelled:['requested','confirmed','cancel_requested'],completed:['confirmed','in_progress']};
   const r=await pool.query(`UPDATE appointments SET status=$1,updated_at=now()
    WHERE id=$2 AND status=ANY($3::text[]) RETURNING id,status`,[status,id,allowed[status]]);
   if(!r.rowCount)throw err('Status transition not allowed',409);
   await audit(actor(req),'booking.'+status,id);
   return {appointment:r.rows[0]};
  });
  protectedRoutes.post('/api/admin/stylists',{preHandler:managerOnly},async req=>{
   const v=z.object({displayName:z.string().min(2).max(100)}).parse(req.body);
   const r=await queryOne<any>(`INSERT INTO stylists(salon_id,display_name)
    SELECT id,$1 FROM salons WHERE is_active=true ORDER BY name LIMIT 1 RETURNING *`,[v.displayName]);
   if(!r)throw err('Salon not configured',503);
   await audit(actor(req),'stylist.create',r.id);return {stylist:r};
  });
  protectedRoutes.post('/api/admin/stylists/:id/services',{preHandler:managerOnly},async req=>{
   const {id}=z.object({id:uuid}).parse(req.params);
   const {serviceIds}=z.object({serviceIds:z.array(uuid).max(40)}).parse(req.body);
   await transaction(async c=>{
    const stylist=await c.query('SELECT id FROM stylists WHERE id=$1 FOR UPDATE',[id]);
    if(!stylist.rowCount)throw err('Stylist not found',404);
    await c.query('DELETE FROM stylist_services WHERE stylist_id=$1',[id]);
    for(const sid of serviceIds)await c.query('INSERT INTO stylist_services(stylist_id,service_id) VALUES($1,$2)',[id,sid]);
   });
   await audit(actor(req),'stylist.services.update',id,{serviceIds});return {ok:true};
  });
  protectedRoutes.post('/api/admin/stylists/:id/shifts',{preHandler:managerOnly},async req=>{
   const {id}=z.object({id:uuid}).parse(req.params);
   const v=z.object({weekday:z.number().int().min(1).max(7),startLocal:clock,endLocal:clock})
    .refine(x=>x.startLocal<x.endLocal,{message:'Shift must end after start'}).parse(req.body);
   const r=await queryOne<any>(`INSERT INTO stylist_shifts(stylist_id,weekday,start_local,end_local)
    VALUES($1,$2,$3,$4) RETURNING *`,[id,v.weekday,v.startLocal,v.endLocal]);
   await audit(actor(req),'stylist.shift.create',r.id);return {shift:r};
  });
  protectedRoutes.post('/api/admin/services/:id/publish',{preHandler:managerOnly},async req=>{
   const {id}=z.object({id:uuid}).parse(req.params);
   const v=z.object({durationMinutes:z.number().int().min(15).max(480),
    startingPriceCents:z.number().int().nonnegative().nullable().optional(),
    requiresConsultation:z.boolean(),isBookable:z.boolean()}).parse(req.body);
   const s=await queryOne<any>(`UPDATE services SET duration_minutes=$2,starting_price_cents=$3,
    requires_consultation=$4,is_bookable=$5 WHERE id=$1 RETURNING *`,[id,v.durationMinutes,v.startingPriceCents??null,v.requiresConsultation,v.isBookable]);
   if(!s)throw err('Service not found',404);
   await audit(actor(req),'service.publish',id,v);return {service:s};
  });
  protectedRoutes.get('/api/admin/slots',{preHandler:managerOnly},async req=>{
   const v=z.object({serviceId:uuid,stylistId:uuid,date:localDate,modifierIds:z.string().max(450).optional()}).parse(req.query);
   const ids=v.modifierIds?v.modifierIds.split(',').map(x=>uuid.parse(x)):[];
   return await slotsFor(v.serviceId,v.stylistId,v.date,ids);
  });
  await secureExperience(protectedRoutes);
  await mediaRoutes(protectedRoutes,config);
 });
 return app;
}
