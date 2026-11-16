import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {pool,queryOne,transaction,schedulingLock,type Database} from './db.js';
import {managerOnly} from './auth.js';

const uuid=z.string().uuid(), text=z.string().trim().min(2).max(150);
const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const cents=z.number().int().min(0).max(100000000);
const url=z.string().url().max(1500).refine(x=>new URL(x).protocol==='https:','HTTPS URL required');
const manager={preHandler:managerOnly};
const active="status IN ('requested','confirmed','in_progress','cancel_requested') AND end_at>now()";
const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
const actor=(req:FastifyRequest)=>req.identity!.userId;
const idOf=(req:FastifyRequest)=>z.object({id:uuid}).parse(req.params).id;
async function exists(db:Database,table:string,id:string){
 const row=await queryOne(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id],db);
 if(!row)throw fail('Record not found',404);return row;
}
async function salon(db:Database){
 const row=await queryOne('SELECT id FROM salons WHERE is_active=true ORDER BY name LIMIT 1',[],db);
 if(!row)throw fail('Salon not configured',503);return row.id as string;
}
export async function requireManagerWrite(db:Database,req:FastifyRequest){
 await schedulingLock(db);
 const user=await queryOne('SELECT role FROM users WHERE id=$1',[actor(req)],db);
 if(!user||!['admin','manager'].includes(user.role))throw fail('Manager permissions required',403);
 return user.role as string;
}
function write(action:string,fn:(db:Database,req:FastifyRequest)=>Promise<{id:string,before?:unknown,result:Record<string,unknown>}>){
 return async(req:FastifyRequest)=>transaction(async db=>{
  await requireManagerWrite(db,req);
  const value=await fn(db,req);
  await db.query('INSERT INTO audit_logs(actor_id,action,resource_id,details) VALUES($1,$2,$3,$4)',
   [actor(req),action,value.id,JSON.stringify({before:value.before??null,after:value.result})]);
  return value.result;
 });
}
const shift=z.object({weekday:z.number().int().min(1).max(7),startLocal:clock,endLocal:clock}).strict()
 .refine(v=>v.endLocal>v.startLocal,'Shift must end after start');
const block=z.object({startAt:z.string().datetime({offset:true}),endAt:z.string().datetime({offset:true}),reason:z.string().trim().max(500).default('')}).strict()
 .refine(v=>Date.parse(v.endAt)>Date.parse(v.startAt),'End must follow start');
async function checkShifts(db:Database,stylistId:string){
 const overlapping=await queryOne(`SELECT a.id FROM stylist_shifts a JOIN stylist_shifts b
  ON a.stylist_id=b.stylist_id AND a.weekday=b.weekday AND a.id<>b.id
  AND a.start_local<b.end_local AND a.end_local>b.start_local WHERE a.stylist_id=$1 LIMIT 1`,[stylistId],db);
 if(overlapping)throw fail('Weekly shifts overlap. Edit the existing shift.');
 const displaced=await queryOne(`SELECT a.id FROM appointments a JOIN salons sa ON sa.id=a.salon_id
  WHERE a.stylist_id=$1 AND a.${active} AND NOT EXISTS (SELECT 1 FROM stylist_shifts sh
   WHERE sh.stylist_id=a.stylist_id AND sh.weekday=extract(isodow FROM a.start_at AT TIME ZONE sa.timezone)
   AND (a.start_at AT TIME ZONE sa.timezone)::date=(a.end_at AT TIME ZONE sa.timezone)::date
   AND sh.start_local<=(a.start_at AT TIME ZONE sa.timezone)::time
   AND sh.end_local>=(a.end_at AT TIME ZONE sa.timezone)::time) LIMIT 1`,[stylistId],db);
 if(displaced)throw fail('This shift change would leave an active appointment outside working hours. Resolve that appointment first.');
}
async function checkBlock(db:Database,column:'stylist_id'|'salon_id',id:string,v:z.infer<typeof block>){
 if(await queryOne(`SELECT id FROM appointments WHERE ${column}=$1 AND ${active} AND start_at<$3 AND end_at>$2 LIMIT 1`,[id,v.startAt,v.endAt],db))
  throw fail('This time block overlaps an active appointment. Resolve that appointment first.');
}
const service=z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),nameEn:text,nameEs:text,
 descriptionEn:z.string().max(4000).default(''),descriptionEs:z.string().max(4000).default(''),
 durationMinutes:z.number().int().min(15).max(480).nullable(),bufferMinutes:z.number().int().min(0).max(120),
 startingPriceCents:cents.nullable(),requiresConsultation:z.boolean(),isVisible:z.boolean(),isBookable:z.boolean()}).strict()
 .refine(v=>!v.isBookable||v.durationMinutes!==null,'Bookable services require approved duration');
const modifier=z.object({serviceId:uuid,labelEn:text,labelEs:text,additionalMinutes:z.number().int().min(0).max(240),
 additionalPriceCents:cents,isEnabled:z.boolean().default(false)}).strict();
const product=z.object({name:text,description:z.string().max(1500).default(''),imageUrl:url.nullable().default(null),
 ingredientsNote:z.string().max(1500).nullable().default(null),allergyCaution:z.string().max(1500).nullable().default(null),
 stockOnHand:z.number().int().min(0).max(1000000),unitPriceCents:cents.nullable().default(null),availableForSale:z.boolean().default(false),
 expectedStock:z.number().int().nonnegative().optional()}).strict();
const event=z.object({titleEn:text,titleEs:text,descriptionEn:z.string().max(4000).default(''),descriptionEs:z.string().max(4000).default(''),
 startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),capacity:z.number().int().min(1).max(10000),priceCents:cents.nullable()}).strict()
 .refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),'Event end must follow start');
const look=z.object({serviceId:uuid.nullable().default(null),imageUrl:url,captionEn:z.string().max(300).default(''),captionEs:z.string().max(300).default(''),
 sourceUrl:url.nullable().default(null)}).strict();

export async function managementRoutes(app:FastifyInstance){
 // One authorized refresh avoids consuming several rate-limit slots per UI action.
 // These are display snapshots; writes always revalidate in their own transaction.
 app.get('/api/admin/workspace',manager,async req=>{
  const [counts,upcoming,alerts,appointments,services,stylists]=await Promise.all([
   pool.query('SELECT status,count(*)::int AS total FROM appointments GROUP BY status'),
   pool.query(`SELECT a.id,a.start_at,a.status,s.name_en,st.display_name AS stylist_name,u.display_name AS customer_name
    FROM appointments a JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id JOIN users u ON u.id=a.customer_id
    WHERE a.start_at>now()-interval '1 day' ORDER BY a.start_at LIMIT 80`),
   pool.query(`SELECT (SELECT count(*)::int FROM media_uploads WHERE status='pending_review') media_pending,
    (SELECT count(*)::int FROM payment_webhook_events WHERE processing_status='needs_review') finance_pending`),
   pool.query(`SELECT a.*,s.name_en,s.requires_consultation,sa.timezone,st.display_name AS stylist_name,u.display_name AS customer_name
    FROM appointments a JOIN salons sa ON sa.id=a.salon_id JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id
    JOIN users u ON u.id=a.customer_id ORDER BY a.start_at DESC LIMIT 200`),
   pool.query('SELECT * FROM services ORDER BY name_en'),
   pool.query(`SELECT st.*,COALESCE(array_agg(ss.service_id) FILTER(WHERE ss.service_id IS NOT NULL),'{}') AS service_ids
    FROM stylists st LEFT JOIN stylist_services ss ON ss.stylist_id=st.id GROUP BY st.id ORDER BY st.display_name`)
  ]);
  return {role:req.identity!.role,overview:{counts:counts.rows,upcoming:upcoming.rows,alerts:alerts.rows[0]},
   appointments:appointments.rows,services:services.rows,stylists:stylists.rows};
 });
 app.get('/api/admin/session',manager,async req=>({role:req.identity!.role}));
 app.get('/api/admin/stylists',manager,async()=>({stylists:(await pool.query(`SELECT st.*,
  COALESCE(array_agg(ss.service_id) FILTER(WHERE ss.service_id IS NOT NULL),'{}') AS service_ids
  FROM stylists st LEFT JOIN stylist_services ss ON ss.stylist_id=st.id GROUP BY st.id ORDER BY st.display_name`)).rows}));
 app.post('/api/admin/stylists',manager,write('stylist.create',async(db,req)=>{
  const v=z.object({displayName:text}).strict().parse(req.body);
  const r=await queryOne('INSERT INTO stylists(salon_id,display_name) VALUES($1,$2) RETURNING *',[await salon(db),v.displayName],db);
  return {id:r.id,result:{stylist:r}};
 }));
 app.patch('/api/admin/stylists/:id',manager,write('stylist.update',async(db,req)=>{
  const id=idOf(req),before=await exists(db,'stylists',id);
  const v=z.object({displayName:text,bio:z.string().max(2000),isActive:z.boolean(),userId:uuid.nullable().optional()}).strict().parse(req.body);
  if(!v.isActive&&await queryOne(`SELECT id FROM appointments WHERE stylist_id=$1 AND ${active} LIMIT 1`,[id],db))
   throw fail('Resolve active appointments before deactivating this stylist.');
  if(v.userId){const user=await exists(db,'users',v.userId);if(!['stylist','manager','admin'].includes(user.role))throw fail('Link an existing staff account. An administrator grants staff access.');}
  const r=await queryOne('UPDATE stylists SET display_name=$2,bio=$3,is_active=$4,user_id=$5 WHERE id=$1 RETURNING *',
   [id,v.displayName,v.bio,v.isActive,v.userId===undefined?before.user_id:v.userId],db);
  return {id,before,result:{stylist:r}};
 }));
 app.post('/api/admin/stylists/:id/services',manager,write('stylist.services.update',async(db,req)=>{
  const id=idOf(req);await exists(db,'stylists',id);
  const {serviceIds}=z.object({serviceIds:z.array(uuid).max(100)}).strict().parse(req.body);
  if(new Set(serviceIds).size!==serviceIds.length)throw fail('Duplicate qualifications',400);
  if((await db.query('SELECT id FROM services WHERE id=ANY($1::uuid[])',[serviceIds])).rowCount!==serviceIds.length)throw fail('Service not found',404);
  if(await queryOne(`SELECT id FROM appointments WHERE stylist_id=$1 AND ${active} AND NOT(service_id=ANY($2::uuid[])) LIMIT 1`,[id,serviceIds],db))
   throw fail('An active appointment requires a qualification being removed. Resolve it first.');
  const before=(await db.query('SELECT service_id FROM stylist_services WHERE stylist_id=$1',[id])).rows;
  await db.query('DELETE FROM stylist_services WHERE stylist_id=$1',[id]);
  await db.query('INSERT INTO stylist_services(stylist_id,service_id) SELECT $1,unnest($2::uuid[])',[id,serviceIds]);
  return {id,before,result:{ok:true,serviceIds}};
 }));
 app.get('/api/admin/stylists/:id/schedule',manager,async req=>{
  const id=idOf(req);if(!await queryOne('SELECT id FROM stylists WHERE id=$1',[id]))throw fail('Stylist not found',404);
  return {shifts:(await pool.query('SELECT * FROM stylist_shifts WHERE stylist_id=$1 ORDER BY weekday,start_local',[id])).rows,
   timeOff:(await pool.query('SELECT * FROM stylist_time_off WHERE stylist_id=$1 ORDER BY start_at DESC LIMIT 200',[id])).rows};
 });
 app.post('/api/admin/stylists/:id/shifts',manager,write('stylist.shift.create',async(db,req)=>{
  const id=idOf(req);await exists(db,'stylists',id);const v=shift.parse(req.body);
  const r=await queryOne('INSERT INTO stylist_shifts(stylist_id,weekday,start_local,end_local) VALUES($1,$2,$3,$4) RETURNING *',[id,v.weekday,v.startLocal,v.endLocal],db);
  await checkShifts(db,id);return {id:r.id,result:{shift:r}};
 }));
 for(const method of ['PATCH','DELETE'] as const)app.route({method,url:'/api/admin/shifts/:id',...manager,handler:write('stylist.shift.'+method.toLowerCase(),async(db,req)=>{
  const id=idOf(req),before=await exists(db,'stylist_shifts',id);
  let r;
  if(method==='DELETE')await db.query('DELETE FROM stylist_shifts WHERE id=$1',[id]);
  else {const v=shift.parse(req.body);r=await queryOne('UPDATE stylist_shifts SET weekday=$2,start_local=$3,end_local=$4 WHERE id=$1 RETURNING *',[id,v.weekday,v.startLocal,v.endLocal],db);}
  await checkShifts(db,before.stylist_id);return {id,before,result:{ok:true,shift:r??null}};
 })});
 app.post('/api/admin/stylists/:id/time-off',manager,write('stylist.time_off.create',async(db,req)=>{
  const id=idOf(req);await exists(db,'stylists',id);const v=block.parse(req.body);await checkBlock(db,'stylist_id',id,v);
  const r=await queryOne('INSERT INTO stylist_time_off(stylist_id,start_at,end_at,reason) VALUES($1,$2,$3,$4) RETURNING *',[id,v.startAt,v.endAt,v.reason],db);
  return {id:r.id,result:{timeOff:r}};
 }));
 app.get('/api/admin/closures',manager,async()=>({closures:(await pool.query('SELECT * FROM salon_closures ORDER BY start_at DESC LIMIT 200')).rows}));
 app.post('/api/admin/closures',manager,write('closure.create',async(db,req)=>{
  const id=await salon(db),v=block.parse(req.body);await checkBlock(db,'salon_id',id,v);
  const r=await queryOne('INSERT INTO salon_closures(salon_id,start_at,end_at,reason) VALUES($1,$2,$3,$4) RETURNING *',[id,v.startAt,v.endAt,v.reason],db);
  return {id:r.id,result:{closure:r}};
 }));
 for(const [path,table,column] of [['time-off','stylist_time_off','stylist_id'],['closures','salon_closures','salon_id']] as const)
  for(const method of ['PATCH','DELETE'] as const)app.route({method,url:'/api/admin/'+path+'/:id',...manager,handler:write(path+'.'+method.toLowerCase(),async(db,req)=>{
   const id=idOf(req),before=await exists(db,table,id);let r;
   if(method==='DELETE')await db.query(`DELETE FROM ${table} WHERE id=$1`,[id]);
   else {const v=block.parse(req.body);await checkBlock(db,column,before[column],v);
    r=await queryOne(`UPDATE ${table} SET start_at=$2,end_at=$3,reason=$4 WHERE id=$1 RETURNING *`,[id,v.startAt,v.endAt,v.reason],db);}
   return {id,before,result:{ok:true,block:r??null}};
  })});
 app.get('/api/admin/services',manager,async()=>({services:(await pool.query('SELECT * FROM services ORDER BY name_en')).rows}));
 for(const method of ['POST','PATCH'] as const)app.route({method,url:'/api/admin/services'+(method==='PATCH'?'/:id':''),...manager,handler:write('service.'+method.toLowerCase(),async(db,req)=>{
  const v=service.parse(req.body),id=method==='PATCH'?idOf(req):null,before=id?await exists(db,'services',id):null;
  const args=[v.slug,v.nameEn,v.nameEs,v.descriptionEn,v.descriptionEs,v.durationMinutes,v.bufferMinutes,v.startingPriceCents,v.requiresConsultation,v.isVisible,v.isBookable];
  const r=await queryOne(id?`UPDATE services SET slug=$1,name_en=$2,name_es=$3,description_en=$4,description_es=$5,duration_minutes=$6,
   buffer_minutes=$7,starting_price_cents=$8,requires_consultation=$9,is_visible=$10,is_bookable=$11 WHERE id=$12 RETURNING *`:
   `INSERT INTO services(slug,name_en,name_es,description_en,description_es,duration_minutes,buffer_minutes,starting_price_cents,requires_consultation,is_visible,is_bookable)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,id?[...args,id]:args,db);
  return {id:r.id,before,result:{service:r}};
 })});
 // Retain the established publishing contract used by earlier development tooling.
 app.post('/api/admin/services/:id/publish',manager,write('service.publish',async(db,req)=>{
  const id=idOf(req),before=await exists(db,'services',id);
  const v=z.object({durationMinutes:z.number().int().min(15).max(480),startingPriceCents:cents.nullable().optional(),requiresConsultation:z.boolean(),isBookable:z.boolean()}).strict().parse(req.body);
  const r=await queryOne('UPDATE services SET duration_minutes=$2,starting_price_cents=$3,requires_consultation=$4,is_bookable=$5 WHERE id=$1 RETURNING *',
   [id,v.durationMinutes,v.startingPriceCents??null,v.requiresConsultation,v.isBookable],db);
  return {id,before,result:{service:r}};
 }));
 app.get('/api/admin/modifiers',manager,async()=>({modifiers:(await pool.query('SELECT m.*,s.name_en FROM service_modifiers m JOIN services s ON s.id=m.service_id ORDER BY s.name_en,m.sort_order')).rows}));
 for(const method of ['POST','PATCH'] as const)app.route({method,url:'/api/admin/modifiers'+(method==='PATCH'?'/:id':''),...manager,handler:write('modifier.'+method.toLowerCase(),async(db,req)=>{
  const v=modifier.parse(req.body),id=method==='PATCH'?idOf(req):null,before=id?await exists(db,'service_modifiers',id):null;
  await exists(db,'services',v.serviceId);
  const args=[v.serviceId,v.labelEn,v.labelEs,v.additionalMinutes,v.additionalPriceCents,v.isEnabled];
  const r=await queryOne(id?'UPDATE service_modifiers SET service_id=$1,label_en=$2,label_es=$3,additional_minutes=$4,additional_price_cents=$5,is_enabled=$6 WHERE id=$7 RETURNING *':
   'INSERT INTO service_modifiers(service_id,label_en,label_es,additional_minutes,additional_price_cents,is_enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',id?[...args,id]:args,db);
  return {id:r.id,before,result:{modifier:r}};
 })});
 app.get('/api/admin/inventory',manager,async()=>({products:(await pool.query('SELECT * FROM retail_products ORDER BY name')).rows}));
 for(const method of ['POST','PATCH'] as const)app.route({method,url:'/api/admin/inventory'+(method==='PATCH'?'/:id':''),...manager,handler:write('inventory.'+method.toLowerCase(),async(db,req)=>{
  const v=product.parse(req.body),id=method==='PATCH'?idOf(req):null,before=id?await exists(db,'retail_products',id):null;
  if(before&&v.expectedStock!==before.stock_on_hand)throw fail('Stock changed or was not reviewed. Refresh this product before saving.');
  // A zero-stock item is automatically hidden; no sale can bypass the database check.
  const listed=v.availableForSale&&v.stockOnHand>0&&v.unitPriceCents!==null;
  const args=[v.name,v.description,v.imageUrl,v.ingredientsNote,v.allergyCaution,v.stockOnHand,v.unitPriceCents,listed];
  const r=await queryOne(id?`UPDATE retail_products SET name=$1,description=$2,image_url=$3,ingredients_note=$4,allergy_caution=$5,
   stock_on_hand=$6,unit_price_cents=$7,available_for_sale=$8 WHERE id=$9 RETURNING *`:
   `INSERT INTO retail_products(name,description,image_url,ingredients_note,allergy_caution,stock_on_hand,unit_price_cents,available_for_sale,salon_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[...args,id??await salon(db)],db);
  return {id:r.id,before,result:{product:r}};
 })});
 app.post('/api/admin/inventory/:id/publish',manager,write('inventory.publish',async(db,req)=>{
  const id=idOf(req),before=await exists(db,'retail_products',id),{publish}=z.object({publish:z.boolean()}).strict().parse(req.body);
  if(publish&&(!before.stock_on_hand||before.unit_price_cents===null))throw fail('Stock and approved price required before listing product');
  return {id,before,result:{product:await queryOne('UPDATE retail_products SET available_for_sale=$2 WHERE id=$1 RETURNING *',[id,publish],db)}};
 }));
 app.get('/api/admin/events',manager,async()=>({events:(await pool.query(`SELECT e.*,
  COALESCE((SELECT sum(r.seats)::int FROM event_registrations r WHERE r.event_id=e.id AND r.status='registered'),0) AS registered_seats
  FROM salon_events e ORDER BY starts_at DESC`)).rows}));
 for(const method of ['POST','PATCH'] as const)app.route({method,url:'/api/admin/events'+(method==='PATCH'?'/:id':''),...manager,handler:write('event.'+method.toLowerCase(),async(db,req)=>{
  const v=event.parse(req.body),id=method==='PATCH'?idOf(req):null,before=id?await exists(db,'salon_events',id):null;
  if(before){
   const {taken}=await queryOne("SELECT COALESCE(sum(seats),0)::int AS taken FROM event_registrations WHERE event_id=$1 AND status='registered'",[id],db);
   if(v.capacity<taken)throw fail('Capacity cannot be below registered seats.');
   if(taken&&(new Date(before.starts_at).getTime()!==Date.parse(v.startsAt)||new Date(before.ends_at).getTime()!==Date.parse(v.endsAt)||before.price_cents!==v.priceCents))
    throw fail('Registered events cannot change time or price. Contact attendees and cancel before creating a replacement.');
   if(before.status==='published'&&Date.parse(v.startsAt)<=Date.now())throw fail('Published events must start in the future.');
  }
  const args=[v.titleEn,v.titleEs,v.descriptionEn,v.descriptionEs,v.startsAt,v.endsAt,v.capacity,v.priceCents];
  const r=await queryOne(id?`UPDATE salon_events SET title_en=$1,title_es=$2,description_en=$3,description_es=$4,starts_at=$5,ends_at=$6,capacity=$7,price_cents=$8 WHERE id=$9 RETURNING *`:
   `INSERT INTO salon_events(title_en,title_es,description_en,description_es,starts_at,ends_at,capacity,price_cents,salon_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[...args,id??await salon(db)],db);
  return {id:r.id,before,result:{event:r}};
 })});
 app.post('/api/admin/events/:id/publish',manager,write('event.publish',async(db,req)=>{
  const id=idOf(req),before=await exists(db,'salon_events',id),{publish}=z.object({publish:z.boolean()}).strict().parse(req.body);
  if(before.status==='cancelled'||(publish&&new Date(before.starts_at).getTime()<=Date.now()))throw fail('Event unavailable or in past');
  return {id,before,result:{event:await queryOne('UPDATE salon_events SET status=$2 WHERE id=$1 RETURNING *',[id,publish?'published':'draft'],db)}};
 }));
 app.post('/api/admin/events/:id/cancel',manager,write('event.cancel',async(db,req)=>{
  const id=idOf(req),before=await exists(db,'salon_events',id);
  await db.query("UPDATE event_registrations SET status='cancelled' WHERE event_id=$1 AND status='registered'",[id]);
  return {id,before,result:{event:await queryOne("UPDATE salon_events SET status='cancelled' WHERE id=$1 RETURNING *",[id],db)}};
 }));
 app.get('/api/admin/events/:id/registrations',manager,async req=>({registrations:(await pool.query(`SELECT r.id,r.user_id,r.seats,r.status,u.display_name
  FROM event_registrations r JOIN users u ON u.id=r.user_id WHERE event_id=$1 ORDER BY r.created_at`,[idOf(req)])).rows}));
 app.get('/api/admin/lookbook',manager,async()=>({looks:(await pool.query('SELECT * FROM lookbook_images ORDER BY created_at DESC LIMIT 200')).rows}));
 for(const method of ['POST','PATCH'] as const)app.route({method,url:'/api/admin/lookbook'+(method==='PATCH'?'/:id':''),...manager,handler:write('lookbook.'+method.toLowerCase(),async(db,req)=>{
  const v=look.parse(req.body),id=method==='PATCH'?idOf(req):null,before=id?await exists(db,'lookbook_images',id):null;
  if(v.serviceId)await exists(db,'services',v.serviceId);
  const args=[v.serviceId,v.imageUrl,v.captionEn,v.captionEs,v.sourceUrl];
  // Replacing image/source requires a new rights review; captions alone preserve it.
  const reset=before&&(before.image_url!==v.imageUrl||before.source_url!==v.sourceUrl);
  const r=await queryOne(id?`UPDATE lookbook_images SET service_id=$1,image_url=$2,caption_en=$3,caption_es=$4,source_url=$5,
   rights_confirmed=CASE WHEN $7 THEN false ELSE rights_confirmed END,is_published=CASE WHEN $7 THEN false ELSE is_published END,
   rights_note=CASE WHEN $7 THEN '' ELSE rights_note END,reviewed_by=CASE WHEN $7 THEN NULL ELSE reviewed_by END,
   reviewed_at=CASE WHEN $7 THEN NULL ELSE reviewed_at END WHERE id=$6 RETURNING *`:
   'INSERT INTO lookbook_images(service_id,image_url,caption_en,caption_es,source_url,salon_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',id?[...args,id,reset]:[...args,await salon(db)],db);
  return {id:r.id,before,result:{look:r}};
 })});
 app.post('/api/admin/lookbook/:id/review',manager,write('lookbook.review',async(db,req)=>{
  const id=idOf(req),before=await exists(db,'lookbook_images',id);
  const v=z.object({rightsConfirmed:z.boolean(),publish:z.boolean(),rightsNote:z.string().trim().max(1500).default('')}).strict().parse(req.body);
  if(v.publish&&(!v.rightsConfirmed||v.rightsNote.length<10))throw fail('Publishing requires explicit rights confirmation and a release or license reference (at least 10 characters).');
  const r=await queryOne('UPDATE lookbook_images SET rights_confirmed=$2,is_published=$3,rights_note=$4,reviewed_by=$5,reviewed_at=now() WHERE id=$1 RETURNING *',
   [id,v.rightsConfirmed,v.publish,v.rightsNote,actor(req)],db);
  return {id,before,result:{look:r}};
 }));
 app.get('/api/admin/policies',manager,async()=>({policies:await queryOne('SELECT p.* FROM salon_policies p JOIN salons s ON s.id=p.salon_id WHERE s.is_active=true ORDER BY s.name LIMIT 1')}));
 app.post('/api/admin/policies',manager,write('policies.approve',async(db,req)=>{
  const v=z.object({cancellationEn:z.string().min(10).max(4000),cancellationEs:z.string().min(10).max(4000),serviceConsentEn:z.string().min(10).max(4000),
   serviceConsentEs:z.string().min(10).max(4000),privacyUrl:url}).strict().parse(req.body),id=await salon(db);
  const before=await queryOne('SELECT * FROM salon_policies WHERE salon_id=$1',[id],db);
  const r=await queryOne(`INSERT INTO salon_policies(salon_id,cancellation_en,cancellation_es,service_consent_en,service_consent_es,privacy_url,approved_by,effective_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) ON CONFLICT(salon_id) DO UPDATE SET cancellation_en=excluded.cancellation_en,cancellation_es=excluded.cancellation_es,
   service_consent_en=excluded.service_consent_en,service_consent_es=excluded.service_consent_es,privacy_url=excluded.privacy_url,approved_by=excluded.approved_by,effective_at=excluded.effective_at RETURNING *`,
   [id,v.cancellationEn,v.cancellationEs,v.serviceConsentEn,v.serviceConsentEs,v.privacyUrl,actor(req)],db);
  return {id,before,result:{policies:r}};
 }));
 app.get('/api/admin/peak-rules',manager,async()=>({rules:(await pool.query('SELECT * FROM peak_pricing_rules ORDER BY weekday,start_local')).rows}));
 app.post('/api/admin/peak-rules',manager,write('peak_rule.create',async(db,req)=>{
  const v=z.object({weekday:z.number().int().min(1).max(7),startLocal:clock,endLocal:clock,surchargeBps:z.number().int().min(0).max(5000),activate:z.boolean().default(false)}).strict().parse(req.body);
  if(v.endLocal<=v.startLocal)throw fail('Peak window end must follow start',400);
  const r=await queryOne(`INSERT INTO peak_pricing_rules(salon_id,weekday,start_local,end_local,surcharge_bps,is_active,approved_by)
   VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[await salon(db),v.weekday,v.startLocal,v.endLocal,v.surchargeBps,v.activate,v.activate?actor(req):null],db);
  return {id:r.id,result:{rule:r}};
 }));
 app.post('/api/admin/peak-rules/:id/activate',manager,write('peak_rule.approve',async(db,req)=>{
  const id=idOf(req),before=await exists(db,'peak_pricing_rules',id),{activate}=z.object({activate:z.boolean()}).strict().parse(req.body);
  return {id,before,result:{rule:await queryOne('UPDATE peak_pricing_rules SET is_active=$2,approved_by=$3 WHERE id=$1 RETURNING *',[id,activate,activate?actor(req):null],db)}};
 }));
 app.get('/api/admin/audit',manager,async req=>{
  const {before}=z.object({before:z.string().regex(/^\d{1,19}$/).optional()}).parse(req.query);
  const rows=(await pool.query(`SELECT l.*,u.display_name AS actor_name FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id
   WHERE ($1::bigint IS NULL OR l.id<$1) ORDER BY l.id DESC LIMIT 100`,[before??null])).rows;
  return {entries:rows,nextBefore:rows.length===100?String(rows.at(-1).id):null};
 });
 app.get('/api/admin/staff-accounts',manager,async req=>{
  if(req.identity!.role!=='admin')throw fail('Administrator permissions required',403);
  const {search}=z.object({search:z.string().trim().max(100).default('')}).parse(req.query);
  return {accounts:(await pool.query(`SELECT id,display_name,role FROM users WHERE role<>'customer'
   OR ($1<>'' AND (id::text=$1 OR display_name ILIKE '%'||$1||'%')) ORDER BY role,display_name LIMIT 100`,[search])).rows};
 });
 app.patch('/api/admin/staff-accounts/:id',manager,write('staff.role.update',async(db,req)=>{
  const admin=await queryOne('SELECT role FROM users WHERE id=$1',[actor(req)],db);
  if(admin.role!=='admin')throw fail('Administrator permissions required',403);
  const id=idOf(req),before=await exists(db,'users',id),{role}=z.object({role:z.enum(['customer','stylist','manager','admin'])}).strict().parse(req.body);
  if(id===actor(req))throw fail('Use a second administrator to change your own permissions.');
  const account=await queryOne('UPDATE users SET role=$2 WHERE id=$1 RETURNING id,display_name,role',[id,role],db);
  return {id,before:{id,display_name:before.display_name,role:before.role},result:{account}};
 }));
}
