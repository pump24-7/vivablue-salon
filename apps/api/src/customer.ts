import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {pool,transaction} from './db.js';

// The transaction prevents a successful appointment change without its inbox/audit event.
export async function appointmentEvent(c:PoolClient,actor:string,appointment:{id:string,customer_id:string,status:string}){
 await c.query(`INSERT INTO customer_notifications(user_id,appointment_id,status)
  VALUES($1,$2,$3) ON CONFLICT(appointment_id,status) DO NOTHING`,
 [appointment.customer_id,appointment.id,appointment.status]);
 await c.query('INSERT INTO audit_logs(actor_id,action,resource_id) VALUES($1,$2,$3)',
  [actor,'booking.'+appointment.status,appointment.id]);
}

export async function customerRoutes(app:FastifyInstance){
 app.patch('/api/me',async req=>{
  // Never accept identity, email, staff role, or another customer's ID here.
  const v=z.object({displayName:z.string().trim().min(1).max(100).optional(),preferredLanguage:z.enum(['en','es']).optional()})
   .strict().refine(x=>x.displayName!==undefined||x.preferredLanguage!==undefined).parse(req.body);
  return transaction(async c=>{
   const result=await c.query(`UPDATE users SET display_name=COALESCE($2,display_name),preferred_language=COALESCE($3,preferred_language)
    WHERE id=$1 RETURNING id,display_name,role,preferred_language`,[req.identity!.userId,v.displayName??null,v.preferredLanguage??null]);
   await c.query(`INSERT INTO audit_logs(actor_id,action,resource_id) VALUES($1,'profile.updated',$1)`,[req.identity!.userId]);
   return {user:result.rows[0]};
  });
 });
 app.get('/api/me/notifications',async req=>{
  const userId=req.identity!.userId;
  const [items,count]=await Promise.all([
   pool.query(`SELECT n.id,n.appointment_id,n.status,n.created_at,n.read_at,a.start_at,
    sa.timezone,s.name_en,s.name_es,st.display_name AS stylist_name
    FROM customer_notifications n JOIN appointments a ON a.id=n.appointment_id
    JOIN salons sa ON sa.id=a.salon_id JOIN services s ON s.id=a.service_id
    JOIN stylists st ON st.id=a.stylist_id
    WHERE n.user_id=$1 ORDER BY n.created_at DESC,n.id DESC LIMIT 100`,[userId]),
   pool.query('SELECT count(*)::int AS count FROM customer_notifications WHERE user_id=$1 AND read_at IS NULL',[userId])
  ]);
  return {notifications:items.rows,unreadCount:count.rows[0].count};
 });
 app.post('/api/me/notifications/:id/read',async(req,reply)=>{
  const {id}=z.object({id:z.string().uuid()}).parse(req.params);
  const result=await pool.query(`UPDATE customer_notifications SET read_at=COALESCE(read_at,now())
   WHERE id=$1 AND user_id=$2 RETURNING id,read_at`,[id,req.identity!.userId]);
  if(!result.rowCount)return reply.code(404).send({message:'Notification not found'});
  return {notification:result.rows[0]};
 });
}
