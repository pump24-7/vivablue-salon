import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {pool,queryOne,transaction} from './db.js';
import {managerOnly} from './auth.js';
const uuid=z.string().uuid();
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
  if(!r.rowCount){const existing=await queryOne(`SELECT f.image_id FROM client_favorites f JOIN lookbook_images l ON l.id=f.image_id
   WHERE f.user_id=$1 AND f.image_id=$2 AND l.is_published=true AND l.rights_confirmed=true`,[actor(req),id]);if(!existing)throw fail('Look not available',404)}
  return {saved:true};
 });
 app.delete('/api/me/favorites/:id',async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  await pool.query('DELETE FROM client_favorites WHERE user_id=$1 AND image_id=$2',[actor(req),id]);return {saved:false};
 });
 app.get('/api/me/events',async req=>({registrations:(await pool.query(`SELECT r.id,r.event_id,r.seats,r.status,e.title_en,e.title_es,e.starts_at
  FROM event_registrations r JOIN salon_events e ON e.id=r.event_id WHERE r.user_id=$1 ORDER BY e.starts_at DESC`,[actor(req)])).rows}));
 app.post('/api/events/:id/register',async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const {seats}=z.object({seats:z.number().int().min(1).max(10).default(1)}).parse(req.body??{});
  const registration=await transaction(async c=>{
   const event=await c.query(`SELECT id,capacity,price_cents,status FROM salon_events WHERE id=$1 AND starts_at>now() FOR UPDATE`,[id]);
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
 app.get('/api/admin/overview',manager,async req=>{
  const [counts,upcoming,alerts]=await Promise.all([
   pool.query(`SELECT status,count(*)::int AS total FROM appointments GROUP BY status`),
   pool.query(`SELECT a.id,a.start_at,a.status,s.name_en,st.display_name AS stylist_name,u.display_name AS customer_name
    FROM appointments a JOIN services s ON s.id=a.service_id JOIN stylists st ON st.id=a.stylist_id
    JOIN users u ON u.id=a.customer_id WHERE a.start_at>now()-interval '1 day' ORDER BY a.start_at LIMIT 80`),
   pool.query(`SELECT (SELECT count(*)::int FROM media_uploads WHERE status='pending_review') media_pending,
    (SELECT count(*)::int FROM payment_webhook_events WHERE processing_status='needs_review') finance_pending`)
  ]);
  return {role:req.identity!.role,counts:counts.rows,upcoming:upcoming.rows,alerts:alerts.rows[0]};
 });
 // Historical exception data remains read-only.
 app.get('/api/admin/finance',manager,async()=>({webhooks:(await pool.query(`SELECT * FROM payment_webhook_events ORDER BY received_at DESC LIMIT 100`)).rows}));
}
