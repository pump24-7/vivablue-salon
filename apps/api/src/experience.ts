import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {pool,queryOne,transaction} from './db.js';
import {DateTime} from 'luxon';
import {managerOnly} from './auth.js';
const uuid=z.string().uuid();
const siteUrl=z.string().url().max(1500).refine(x=>new URL(x).protocol==='https:',{message:'HTTPS URL required'});
const fail=(message:string,statusCode:number)=>Object.assign(new Error(message),{statusCode});
const actor=(req:FastifyRequest)=>(req as any).identity.userId as string;
const manager={preHandler:managerOnly};
async function audit(user:string,action:string,resource:string|null,details:unknown={}){
 await pool.query('INSERT INTO audit_logs(actor_id,action,resource_id,details) VALUES($1,$2,$3,$4)',[user,action,resource,JSON.stringify(details)]);
}
export async function publicExperience(app:FastifyInstance){
 app.get('/api/lookbook',async()=>({looks:(await pool.query(`SELECT l.id,l.image_url,l.caption_en,l.caption_es,l.service_id,s.name_en AS service_name
   FROM lookbook_images l LEFT JOIN services s ON s.id=l.service_id
   WHERE l.is_published=true AND l.rights_confirmed=true ORDER BY l.display_order,l.created_at DESC LIMIT 100`)).rows}));
 app.get('/api/booking-options',async req=>{
  const {serviceId}=z.object({serviceId:uuid}).parse(req.query);
  return {modifiers:(await pool.query(`SELECT id,label_en,label_es,additional_minutes,additional_price_cents
    FROM service_modifiers WHERE service_id=$1 AND is_enabled=true ORDER BY sort_order,label_en`,[serviceId])).rows};
 });
 app.get('/api/events',async()=>({events:(await pool.query(`SELECT id,title_en,title_es,description_en,description_es,starts_at,ends_at,capacity,price_cents
   FROM salon_events WHERE status='published' AND starts_at>now() ORDER BY starts_at LIMIT 80`)).rows}));
 app.get('/api/shop',async()=>({products:(await pool.query(`SELECT id,name,description,image_url,ingredients_note,allergy_caution,stock_on_hand,unit_price_cents
   FROM retail_products WHERE available_for_sale=true AND stock_on_hand>0 ORDER BY name`)).rows}));
 app.get('/api/policies',async()=>({policies:await queryOne(`SELECT cancellation_en,cancellation_es,privacy_url,
   service_consent_en,service_consent_es,effective_at FROM salon_policies WHERE approved_by IS NOT NULL AND effective_at<=now() LIMIT 1`)}));
}
export async function secureExperience(app:FastifyInstance){
 app.get('/api/me/favorites',async req=>({looks:(await pool.query(`SELECT l.id,l.image_url,l.caption_en,l.caption_es,l.service_id
  FROM client_favorites f JOIN lookbook_images l ON l.id=f.image_id
  WHERE f.user_id=$1 AND l.is_published=true AND l.rights_confirmed=true ORDER BY f.created_at DESC`,[actor(req)])).rows}));
 app.put('/api/me/favorites/:id',async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const r=await pool.query(`INSERT INTO client_favorites(user_id,image_id)
   SELECT $1,id FROM lookbook_images WHERE id=$2 AND is_published=true AND rights_confirmed=true
   ON CONFLICT DO NOTHING RETURNING image_id`,[actor(req),id]);
  if(!r.rowCount){const existing=await queryOne('SELECT image_id FROM client_favorites WHERE user_id=$1 AND image_id=$2',[actor(req),id]);if(!existing)throw fail('Look not available',404)}
  return {saved:true};
 });
 app.delete('/api/me/favorites/:id',async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  await pool.query('DELETE FROM client_favorites WHERE user_id=$1 AND image_id=$2',[actor(req),id]);return {saved:false};
 });
 app.get('/api/me/events',async req=>({registrations:(await pool.query(`SELECT r.id,r.seats,r.status,e.title_en,e.title_es,e.starts_at
  FROM event_registrations r JOIN salon_events e ON e.id=r.event_id WHERE r.user_id=$1 ORDER BY e.starts_at DESC`,[actor(req)])).rows}));
 app.post('/api/events/:id/register',async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const {seats}=z.object({seats:z.number().int().min(1).max(10).default(1)}).parse(req.body??{});
  const registration=await transaction(async c=>{
   const event=await c.query(`SELECT id,capacity,price_cents,status FROM salon_events WHERE id=$1 FOR UPDATE`,[id]);
   if(!event.rowCount||event.rows[0].status!=='published')throw fail('Event unavailable',404);
   if(event.rows[0].price_cents!==0)throw fail('Paid event registrations are not activated; contact salon.',409);
   const prior=await c.query(`SELECT id,status FROM event_registrations WHERE event_id=$1 AND user_id=$2`,[id,actor(req)]);
   if(prior.rowCount&&prior.rows[0].status==='registered')return prior.rows[0];
   const sum=await c.query(`SELECT COALESCE(SUM(seats),0)::int AS taken FROM event_registrations WHERE event_id=$1 AND status='registered'`,[id]);
   if(sum.rows[0].taken+seats>event.rows[0].capacity)throw fail('Event is full',409);
   const r=await c.query(`INSERT INTO event_registrations(event_id,user_id,seats,status) VALUES($1,$2,$3,'registered')
    ON CONFLICT(event_id,user_id) DO UPDATE SET seats=EXCLUDED.seats,status='registered' RETURNING id,status,seats`,[id,actor(req),seats]);return r.rows[0];
  });
  await audit(actor(req),'event.registered',registration.id);return {registration};
 });
 app.get('/api/admin/overview',manager,async()=>{
  const [counts,upcoming,alerts]=await Promise.all([
   pool.query(`SELECT status,count(*)::int AS total FROM appointments GROUP BY status`),
   pool.query(`SELECT a.id,a.start_at,a.status,s.name_en,st.display_name AS stylist_name,u.display_name AS customer_name
    FROM appointments a JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id
    JOIN users u ON u.id=a.customer_id WHERE a.start_at>now()-interval '1 day' ORDER BY a.start_at LIMIT 80`),
   pool.query(`SELECT (SELECT count(*)::int FROM media_uploads WHERE status='pending_review') media_pending,
    (SELECT count(*)::int FROM payment_webhook_events WHERE processing_status='needs_review') finance_pending`)
  ]);
  return {counts:counts.rows,upcoming:upcoming.rows,alerts:alerts.rows[0]};
 });
 app.get('/api/admin/lookbook',manager,async()=>({looks:(await pool.query(`SELECT * FROM lookbook_images ORDER BY created_at DESC LIMIT 200`)).rows}));
 app.post('/api/admin/lookbook',manager,async req=>{
  const v=z.object({serviceId:uuid.nullable().optional(),imageUrl:siteUrl,
   captionEn:z.string().max(300).default(''),captionEs:z.string().max(300).default(''),
   sourceUrl:siteUrl.nullable().optional(),rightsConfirmed:z.boolean().default(false),publish:z.boolean().default(false)}).parse(req.body);
  if(v.publish&&!v.rightsConfirmed)throw fail('Publishing requires confirmed image rights.',409);
  const r=await queryOne<any>(`INSERT INTO lookbook_images(salon_id,service_id,image_url,caption_en,caption_es,source_url,rights_confirmed,is_published)
   SELECT id,$1,$2,$3,$4,$5,$6,$7 FROM salons WHERE is_active=true LIMIT 1 RETURNING *`,
   [v.serviceId??null,v.imageUrl,v.captionEn,v.captionEs,v.sourceUrl??null,v.rightsConfirmed,v.publish]);
  await audit(actor(req),'lookbook.create',r.id);return {look:r};
 });
 app.post('/api/admin/lookbook/:id/review',manager,async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const {rightsConfirmed,publish}=z.object({rightsConfirmed:z.boolean(),publish:z.boolean()}).parse(req.body);
  if(publish&&!rightsConfirmed)throw fail('Image rights must be confirmed to publish',409);
  const l=await queryOne<any>(`UPDATE lookbook_images SET rights_confirmed=$2,is_published=$3 WHERE id=$1 RETURNING *`,[id,rightsConfirmed,publish]);
  if(!l)throw fail('Look not found',404);await audit(actor(req),'lookbook.review',id);return {look:l};
 });
 app.get('/api/admin/modifiers',manager,async()=>({modifiers:(await pool.query(`SELECT m.*,s.name_en FROM service_modifiers m JOIN services s ON s.id=m.service_id ORDER BY s.name_en,m.sort_order`)).rows}));
 app.post('/api/admin/modifiers',manager,async req=>{
  const v=z.object({serviceId:uuid,labelEn:z.string().min(2).max(120),labelEs:z.string().min(2).max(120),
   additionalMinutes:z.number().int().min(0).max(240),additionalPriceCents:z.number().int().nonnegative(),
   isEnabled:z.boolean().default(false)}).parse(req.body);
  const m=await queryOne<any>(`INSERT INTO service_modifiers(service_id,label_en,label_es,additional_minutes,additional_price_cents,is_enabled)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[v.serviceId,v.labelEn,v.labelEs,v.additionalMinutes,v.additionalPriceCents,v.isEnabled]);
  await audit(actor(req),'modifier.create',m.id);return {modifier:m};
 });
 app.get('/api/admin/inventory',manager,async()=>({products:(await pool.query('SELECT * FROM retail_products ORDER BY name')).rows}));
 app.post('/api/admin/inventory',manager,async req=>{
  const v=z.object({name:z.string().min(2).max(150),description:z.string().max(1500).default(''),
   ingredientsNote:z.string().max(1500).nullable().optional(),allergyCaution:z.string().max(1500).nullable().optional(),
   stockOnHand:z.number().int().min(0),unitPriceCents:z.number().int().nonnegative().nullable().optional(),
   availableForSale:z.boolean().default(false)}).parse(req.body);
  const r=await queryOne<any>(`INSERT INTO retail_products(salon_id,name,description,ingredients_note,allergy_caution,stock_on_hand,unit_price_cents,available_for_sale)
   SELECT id,$1,$2,$3,$4,$5,$6,$7 FROM salons WHERE is_active=true LIMIT 1 RETURNING *`,
   [v.name,v.description,v.ingredientsNote??null,v.allergyCaution??null,v.stockOnHand,v.unitPriceCents??null,v.availableForSale]);
  await audit(actor(req),'inventory.create',r.id);return {product:r};
 });
 app.post('/api/admin/inventory/:id/publish',manager,async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const {publish}=z.object({publish:z.boolean()}).parse(req.body);
  const r=await queryOne<any>(`UPDATE retail_products SET available_for_sale=$2 WHERE id=$1 AND
   ($2=false OR (stock_on_hand>0 AND unit_price_cents IS NOT NULL)) RETURNING *`,[id,publish]);
  if(!r)throw fail('Stock and approved price required before listing product',409);
  await audit(actor(req),'inventory.publish',id);return {product:r};
 });
 app.get('/api/admin/events',manager,async()=>({events:(await pool.query('SELECT * FROM salon_events ORDER BY starts_at DESC')).rows}));
 app.post('/api/admin/events',manager,async req=>{
  const v=z.object({titleEn:z.string().min(3).max(150),titleEs:z.string().min(3).max(150),
   startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),
   capacity:z.number().int().min(1).max(10000),priceCents:z.number().int().nonnegative().nullable()}).parse(req.body);
  if(DateTime.fromISO(v.endsAt).toMillis()<=DateTime.fromISO(v.startsAt).toMillis())throw fail('Event end must be after start',400);
  const r=await queryOne<any>(`INSERT INTO salon_events(salon_id,title_en,title_es,starts_at,ends_at,capacity,price_cents)
   SELECT id,$1,$2,$3,$4,$5,$6 FROM salons WHERE is_active=true LIMIT 1 RETURNING *`,
   [v.titleEn,v.titleEs,v.startsAt,v.endsAt,v.capacity,v.priceCents]);
  await audit(actor(req),'event.create',r.id);return {event:r};
 });
 app.post('/api/admin/events/:id/publish',manager,async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const {publish}=z.object({publish:z.boolean()}).parse(req.body);
  const e=await queryOne<any>(`UPDATE salon_events SET status=$2 WHERE id=$1 AND starts_at>now() RETURNING *`,[id,publish?'published':'draft']);
  if(!e)throw fail('Event unavailable or in past',409);await audit(actor(req),'event.publish',id);return {event:e};
 });
 // Historical exception data is read-only; no membership/reward or payment checkout routes are active.
 app.get('/api/admin/finance',manager,async()=>({webhooks:(await pool.query(`SELECT * FROM payment_webhook_events ORDER BY received_at DESC LIMIT 100`)).rows}));
 app.post('/api/admin/peak-rules/:id/activate',manager,async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const {activate}=z.object({activate:z.boolean()}).parse(req.body);
  const r=await queryOne<any>(`UPDATE peak_pricing_rules SET is_active=$2,approved_by=$3 WHERE id=$1 RETURNING *`,
   [id,activate,activate?actor(req):null]);
  if(!r)throw fail('Peak rule not found',404);
  await audit(actor(req),'peak_rule.approve',id);return {rule:r};
 });
 app.get('/api/admin/closures',manager,async()=>({closures:(await pool.query('SELECT * FROM salon_closures ORDER BY start_at DESC LIMIT 100')).rows}));
 app.post('/api/admin/closures',manager,async req=>{
  const v=z.object({startAt:z.string().datetime({offset:true}),endAt:z.string().datetime({offset:true}),reason:z.string().max(500).default('')}).parse(req.body);
  if(DateTime.fromISO(v.endAt).toMillis()<=DateTime.fromISO(v.startAt).toMillis())throw fail('Closure end must follow start',400);
  const r=await queryOne<any>(`INSERT INTO salon_closures(salon_id,start_at,end_at,reason)
   SELECT id,$1,$2,$3 FROM salons WHERE is_active=true LIMIT 1 RETURNING *`,[v.startAt,v.endAt,v.reason]);
  await audit(actor(req),'closure.create',r.id);return {closure:r};
 });
 app.get('/api/admin/peak-rules',manager,async()=>({rules:(await pool.query('SELECT * FROM peak_pricing_rules ORDER BY weekday,start_local')).rows}));
 app.post('/api/admin/peak-rules',manager,async req=>{
  const v=z.object({weekday:z.number().int().min(1).max(7),startLocal:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
   endLocal:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),surchargeBps:z.number().int().min(0).max(5000),
   activate:z.boolean().default(false)}).parse(req.body);
  if(v.endLocal<=v.startLocal)throw fail('Peak window end must follow start',400);
  const r=await queryOne<any>(`INSERT INTO peak_pricing_rules(salon_id,weekday,start_local,end_local,surcharge_bps,is_active,approved_by)
   SELECT id,$1,$2,$3,$4,$5,$6 FROM salons WHERE is_active=true LIMIT 1 RETURNING *`,
   [v.weekday,v.startLocal,v.endLocal,v.surchargeBps,v.activate,v.activate?actor(req):null]);
  await audit(actor(req),'peak_rule.create',r.id);return {rule:r};
 });
 app.post('/api/admin/policies',manager,async req=>{
  const v=z.object({cancellationEn:z.string().min(10).max(4000),cancellationEs:z.string().min(10).max(4000),
   serviceConsentEn:z.string().min(10).max(4000),serviceConsentEs:z.string().min(10).max(4000),
   privacyUrl:siteUrl}).parse(req.body);
  const row=await queryOne<any>(`INSERT INTO salon_policies(salon_id,cancellation_en,cancellation_es,service_consent_en,
   service_consent_es,privacy_url,approved_by,effective_at)
   SELECT id,$1,$2,$3,$4,$5,$6,now() FROM salons WHERE is_active=true LIMIT 1
   ON CONFLICT(salon_id) DO UPDATE SET cancellation_en=excluded.cancellation_en,cancellation_es=excluded.cancellation_es,
   service_consent_en=excluded.service_consent_en,service_consent_es=excluded.service_consent_es,
   privacy_url=excluded.privacy_url,approved_by=excluded.approved_by,effective_at=excluded.effective_at RETURNING *`,
   [v.cancellationEn,v.cancellationEs,v.serviceConsentEn,v.serviceConsentEs,v.privacyUrl,actor(req)]);
  await audit(actor(req),'policies.approve',row.salon_id);return {policies:row};
 });

}
