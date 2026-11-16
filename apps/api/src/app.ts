import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {z} from 'zod';
import {DateTime} from 'luxon';
import {pool,queryOne,transaction,schedulingLock,type Database} from './db.js';
import {authentication,managerOnly} from './auth.js';
import {availableSlots,type Shift,type Block} from './scheduling.js';
import type {Config} from './config.js';
import {publicExperience,secureExperience} from './experience.js';
import {managementRoutes,requireManagerWrite} from './management.js';
import {mediaRoutes} from './media.js';
import {quoteSalonService,type Modifier,type PeakRule} from './salon_pricing.js';
import {appointmentEvent,customerRoutes} from './customer.js';

const uuid=z.string().uuid();
const localDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
function err(message:string,statusCode:number){return Object.assign(new Error(message),{statusCode})}
function pgError(e:any){if(e?.code==='23P01')return err('That time was just booked. Choose another slot.',409);
 if(e?.code==='23505')return err('Duplicate request.',409);return e}
type ServiceRow={id:string,slug:string,name_en:string,name_es:string,duration_minutes:number|null,
 starting_price_cents:number|null,requires_consultation:boolean,is_bookable:boolean,buffer_minutes:number};
type AvailableStylist={id:string,salon_id:string,timezone:string};
type AvailabilityResult=
 | {slots:string[],reason:string,service?:never,stylist?:never,selected?:never}
 | {slots:string[],reason:null,service:ServiceRow,stylist:AvailableStylist,selected:Modifier[]};
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
 async function loadModifiers(serviceId:string,modifierIds:string[],db:Database=pool):Promise<Modifier[]>{
  if(modifierIds.length>8||new Set(modifierIds).size!==modifierIds.length)throw err('Invalid modifier selection',400);
  if(!modifierIds.length)return [];
  const rows=(await db.query<Modifier>(`SELECT id,label_en,label_es,additional_minutes,additional_price_cents
    FROM service_modifiers WHERE service_id=$1 AND is_enabled=true AND id=ANY($2::uuid[])`,[serviceId,modifierIds])).rows;
  if(rows.length!==modifierIds.length)throw err('Invalid or unavailable modifier',409);
  return modifierIds.map(id=>rows.find(m=>m.id===id)!);
 }
 async function peakRules(salonId:string,db:Database=pool):Promise<PeakRule[]>{
  return (await db.query<PeakRule>(`SELECT weekday,start_local::text,end_local::text,surcharge_bps
    FROM peak_pricing_rules WHERE salon_id=$1 AND is_active=true AND approved_by IS NOT NULL`,[salonId])).rows;
 }
 async function slotsFor(serviceId:string,stylistId:string,date:string,modifierIds:string[]=[],db:Database=pool):Promise<AvailabilityResult>{
  const s=await queryOne<ServiceRow>('SELECT * FROM services WHERE id=$1 AND is_visible=true',[serviceId],db);
  if(!s)throw err('Service unavailable',404);
  if(!s.is_bookable||!s.duration_minutes)return {slots:[],reason:'Service requires salon approval before online booking.'};
  const selected=await loadModifiers(serviceId,modifierIds,db);
  const st=await queryOne<AvailableStylist>(`SELECT st.id,st.salon_id,sa.timezone FROM stylists st
   JOIN salons sa ON sa.id=st.salon_id AND sa.is_active=true
   JOIN stylist_services ss ON ss.stylist_id=st.id AND ss.service_id=$2
   WHERE st.id=$1 AND st.is_active=true`,[stylistId,serviceId],db);
  if(!st)throw err('Stylist not available for this service',404);
  const day=DateTime.fromISO(date,{zone:st.timezone});
  if(!day.isValid||day.toISODate()!==date)throw err('Invalid local date',400);
  if(day.startOf('day')>DateTime.now().setZone(st.timezone).plus({days:120}).endOf('day'))throw err('Date too far in future',400);
  const low=day.startOf('day').toUTC().toISO()!, high=day.plus({days:1}).startOf('day').toUTC().toISO()!;
  const shifts=(await db.query<Shift>('SELECT weekday,start_local::text,end_local::text FROM stylist_shifts WHERE stylist_id=$1',[stylistId])).rows;
  const conflicts=(await db.query<Block>(`SELECT start_at,end_at FROM appointments
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
 app.get('/api/booking-quote',async req=>{
  const v=z.object({serviceId:uuid,stylistId:uuid,startAt:z.string().datetime({offset:true}),modifierIds:z.string().max(450).optional()}).parse(req.query);
  const ids=v.modifierIds?v.modifierIds.split(',').map(x=>uuid.parse(x)):[];
  const st=await queryOne<{timezone:string}>(`SELECT sa.timezone FROM stylists st JOIN salons sa ON sa.id=st.salon_id WHERE st.id=$1`,[v.stylistId]);
  if(!st)throw err('Stylist unavailable',404);
  const start=DateTime.fromISO(v.startAt).toUTC();
  if(!start.isValid)throw err('Invalid time',400);
  const normalized=start.toISO({suppressMilliseconds:true})!;
  const avail=await slotsFor(v.serviceId,v.stylistId,start.setZone(st.timezone).toISODate()!,ids);
  if(avail.reason!==null||!avail.slots.includes(normalized))throw err('Selected slot is unavailable. Refresh and choose another.',409);
  return {quote:quoteSalonService({baseMinutes:avail.service.duration_minutes!,bufferMinutes:avail.service.buffer_minutes,
   basePriceCents:avail.service.starting_price_cents,selected:avail.selected,startsAt:normalized,
   timezone:st.timezone,peakRules:await peakRules(avail.stylist.salon_id)})};
 });
 await publicExperience(app);
 app.register(async protectedRoutes=>{
  protectedRoutes.addHook('preHandler',auth);
  protectedRoutes.get('/api/me',async req=>({user:await queryOne('SELECT id,display_name,role,preferred_language FROM users WHERE id=$1',[actor(req)])}));
  await customerRoutes(protectedRoutes);
  protectedRoutes.post('/api/bookings',async req=>{
   const v=z.object({serviceId:uuid,stylistId:uuid,startAt:z.string().datetime({offset:true}),
    idempotencyKey:uuid,customerNote:z.string().max(1000).optional(),modifierIds:z.array(uuid).max(8).default([]),consultationAck:z.boolean().default(false),policyAccepted:z.boolean().default(false),
    expectedTotalCents:z.number().int().nonnegative().nullable().optional(),policyEffectiveAt:z.string().datetime({offset:true}).optional()}).parse(req.body);
   const start=DateTime.fromISO(v.startAt).toUTC();
   if(!start.isValid)throw err('Invalid time',400);
   try{
    const result=await transaction(async c=>{
     await schedulingLock(c);
     const previous=await queryOne<any>('SELECT * FROM appointments WHERE customer_id=$1 AND idempotency_key=$2',[actor(req),v.idempotencyKey],c);
     if(previous)return {appointment:previous,alreadyCreated:true};
     const st=await queryOne<{timezone:string}>(`SELECT sa.timezone FROM stylists st JOIN salons sa ON sa.id=st.salon_id WHERE st.id=$1`,[v.stylistId],c);
     if(!st)throw err('Stylist unavailable',404);
     const date=start.setZone(st.timezone).toISODate()!;
     const avail=await slotsFor(v.serviceId,v.stylistId,date,v.modifierIds,c);
     const normalized=start.toISO({suppressMilliseconds:true})!;
     if(avail.reason!==null||!avail.slots.includes(normalized))throw err('Selected slot is unavailable. Refresh and choose another.',409);
     if(avail.service.requires_consultation&&!v.consultationAck)throw err('Consultation acknowledgement required',400);
     const policy=await queryOne<{effective_at:string}>(`SELECT effective_at FROM salon_policies WHERE salon_id=$1 AND approved_by IS NOT NULL AND effective_at<=now()`,[avail.stylist.salon_id],c);
     if(!policy||!v.policyAccepted)throw err('Approved salon policy acknowledgement is required',409);
     if(v.policyEffectiveAt&&Date.parse(v.policyEffectiveAt)!==new Date(policy.effective_at).getTime())throw err('Salon policies changed. Review the current policies before booking.',409);
     const stylist=avail.stylist;
     const ruleSet=await peakRules(stylist.salon_id,c);
     const quote=quoteSalonService({baseMinutes:avail.service.duration_minutes!,bufferMinutes:avail.service.buffer_minutes,
       basePriceCents:avail.service.starting_price_cents,selected:avail.selected,startsAt:normalized,
       timezone:stylist.timezone,peakRules:ruleSet});
     if(v.expectedTotalCents!==undefined&&v.expectedTotalCents!==quote.totalCents)throw err('The estimate changed. Review the current quote before booking.',409);
     const end=start.plus({minutes:quote.occupiedMinutes});
     // Database exclusion constraint rejects concurrent overlapping reservations.
     const r=await c.query(`INSERT INTO appointments
      (customer_id,salon_id,stylist_id,service_id,start_at,end_at,idempotency_key,quoted_price_cents,customer_note,
       selected_modifiers,price_breakdown,consultation_ack,policy_ack_at,policy_effective_at)
      SELECT $1,st.salon_id,st.id,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,now(),$12
      FROM stylists st JOIN services s ON s.id=$2 WHERE st.id=$11 AND st.is_active=true AND s.is_bookable=true
      RETURNING *`,[actor(req),v.serviceId,normalized,end.toISO(),v.idempotencyKey,quote.totalCents,
         v.customerNote??null,JSON.stringify(avail.selected),JSON.stringify(quote),v.consultationAck,v.stylistId,policy.effective_at]);
     if(!r.rowCount)throw err('Service or stylist no longer available',409);
     await appointmentEvent(c,actor(req),r.rows[0]);
     return {appointment:r.rows[0],alreadyCreated:false};
    });
    return {...result,message:'Request received. Salon confirmation is required.'};
   }catch(e:any){
    if(e.code==='23505'){
     const prior=await queryOne('SELECT * FROM appointments WHERE customer_id=$1 AND idempotency_key=$2',[actor(req),v.idempotencyKey]);
     if(prior)return {appointment:prior,alreadyCreated:true};
    }
    throw pgError(e);
   }
  });
  protectedRoutes.get('/api/bookings',async req=>({appointments:(await pool.query(`SELECT a.id,a.start_at,a.end_at,a.status,a.quoted_price_cents,
   a.selected_modifiers,a.price_breakdown,sa.timezone,s.name_en,s.name_es,st.display_name AS stylist_name FROM appointments a
   JOIN salons sa ON sa.id=a.salon_id
   JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id
   WHERE a.customer_id=$1 ORDER BY a.start_at DESC LIMIT 100`,[actor(req)])).rows}));
  protectedRoutes.post('/api/bookings/:id/cancel-request',async req=>{
   const {id}=z.object({id:uuid}).parse(req.params);
   const appointment=await transaction(async c=>{
    const result=await c.query(`UPDATE appointments SET status='cancel_requested',updated_at=now()
     WHERE id=$1 AND customer_id=$2 AND status IN ('requested','confirmed') RETURNING id,status,customer_id`,[id,actor(req)]);
    if(result.rowCount){await appointmentEvent(c,actor(req),result.rows[0]);return result.rows[0]}
    const existing=await c.query(`SELECT id,status FROM appointments WHERE id=$1 AND customer_id=$2 AND status='cancel_requested'`,[id,actor(req)]);
    if(!existing.rowCount)throw err('Booking cannot be changed automatically. Contact salon.',409);
    return existing.rows[0];
   });
   return {appointment,message:'Cancellation requested. Salon will review.'};
  });
  protectedRoutes.get('/api/admin/bookings',{preHandler:managerOnly},async()=>({appointments:(await pool.query(`
   SELECT a.*,s.name_en,s.requires_consultation,sa.timezone,st.display_name AS stylist_name,u.display_name AS customer_name
   FROM appointments a JOIN salons sa ON sa.id=a.salon_id JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id
   JOIN users u ON u.id=a.customer_id ORDER BY a.start_at DESC LIMIT 200`)).rows}));
  protectedRoutes.post('/api/admin/bookings/:id/status',{preHandler:managerOnly},async req=>{
   const {id}=z.object({id:uuid}).parse(req.params);
   const {status}=z.object({status:z.enum(['confirmed','declined','cancelled','completed'])}).parse(req.body);
   const allowed:Record<string,string[]>={confirmed:['requested'],declined:['requested'],cancelled:['requested','confirmed','cancel_requested'],completed:['confirmed','in_progress']};
   const appointment=await transaction(async c=>{
    await requireManagerWrite(c,req);
    const r=await c.query(`UPDATE appointments SET status=$1,updated_at=now()
     WHERE id=$2 AND status=ANY($3::text[]) RETURNING id,status,customer_id`,[status,id,allowed[status]]);
    if(!r.rowCount)throw err('Status transition not allowed',409);
    await appointmentEvent(c,actor(req),r.rows[0]);return r.rows[0];
   });
   return {appointment};
  });
  protectedRoutes.get('/api/admin/slots',{preHandler:managerOnly},async req=>{
   const v=z.object({serviceId:uuid,stylistId:uuid,date:localDate,modifierIds:z.string().max(450).optional()}).parse(req.query);
   const ids=v.modifierIds?v.modifierIds.split(',').map(x=>uuid.parse(x)):[];
   return await slotsFor(v.serviceId,v.stylistId,v.date,ids);
  });
  await secureExperience(protectedRoutes);
  await managementRoutes(protectedRoutes);
  await mediaRoutes(protectedRoutes,config);
 });
 return app;
}
