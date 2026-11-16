import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {S3Client,HeadObjectCommand,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {pool,queryOne,transaction} from './db.js';
import {requireManagerWrite} from './management.js';
import {managerOnly} from './auth.js';
import type {Config} from './config.js';
const uuid=z.string().uuid();
const actor=(req:FastifyRequest)=>(req as any).identity.userId as string;
const fail=(message:string,statusCode:number)=>Object.assign(new Error(message),{statusCode});
const accepted=new Set(['image/jpeg','image/png','image/webp']);
export async function mediaRoutes(app:FastifyInstance,c:Config){
 const enabled=Boolean(c.S3_BUCKET&&c.MEDIA_UPLOADS_ENABLED);
 const s3=new S3Client({region:c.AWS_REGION});
 app.post('/api/media/presign',async req=>{
  if(!enabled)throw fail('Image uploads await policy and storage approval',503);
  const v=z.object({mimeType:z.string(),byteSize:z.number().int().min(1).max(10*1024*1024),consentConfirmed:z.literal(true)}).parse(req.body);
  if(!accepted.has(v.mimeType))throw fail('Only JPEG, PNG and WebP accepted',400);
  const key=`review/${actor(req)}/${randomUUID()}`;
  const r=await queryOne<any>(`INSERT INTO media_uploads(user_id,object_key,content_type,byte_size,consent_confirmed)
   VALUES($1,$2,$3,$4,true) RETURNING id`,[actor(req),key,v.mimeType,v.byteSize]);
  const url=await getSignedUrl(s3,new PutObjectCommand({Bucket:c.S3_BUCKET!,Key:key,ContentType:v.mimeType,ContentLength:v.byteSize,
   ServerSideEncryption:'AES256'}),{expiresIn:300});
  return {uploadId:r.id,url,expiresInSeconds:300,requiredHeaders:{'Content-Type':v.mimeType,'x-amz-server-side-encryption':'AES256'}};
 });
 app.post('/api/media/:id/confirm',async req=>{
  if(!enabled)throw fail('Image uploads disabled',503);
  const {id}=z.object({id:uuid}).parse(req.params);
  const row=await queryOne<{object_key:string,content_type:string,byte_size:number,status:string}>(
   `SELECT object_key,content_type,byte_size,status FROM media_uploads WHERE id=$1 AND user_id=$2`,[id,actor(req)]);
  if(!row||row.status!=='pending_upload')throw fail('Upload not found or already submitted',409);
  const obj=await s3.send(new HeadObjectCommand({Bucket:c.S3_BUCKET!,Key:row.object_key}));
  if(obj.ContentType!==row.content_type||obj.ContentLength!==row.byte_size)throw fail('Uploaded image metadata differs; review required',409);
  await pool.query(`UPDATE media_uploads SET status='pending_review' WHERE id=$1 AND user_id=$2 AND status='pending_upload'`,[id,actor(req)]);
  return {uploadId:id,status:'pending_review',message:'Private image received; moderation required before publication.'};
 });
 app.get('/api/admin/media',{preHandler:managerOnly},async()=>({enabled,uploads:(await pool.query(`SELECT id,user_id,content_type,byte_size,status,consent_confirmed,created_at,review_note,reviewed_at
  FROM media_uploads ORDER BY created_at DESC LIMIT 100`)).rows}));
 app.get('/api/admin/media/:id/preview',{preHandler:managerOnly},async(req,reply)=>{
  if(!enabled)throw fail('Private storage review is not configured',503);
  const {id}=z.object({id:uuid}).parse(req.params);
  const row=await queryOne<any>(`SELECT object_key FROM media_uploads WHERE id=$1 AND consent_confirmed=true AND status IN ('pending_review','approved')`,[id]);
  if(!row)throw fail('Image unavailable for review',404);
  const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:c.S3_BUCKET!,Key:row.object_key,ResponseCacheControl:'no-store'}),{expiresIn:60});
  reply.header('Cache-Control','no-store');return {url,expiresInSeconds:60};
 });
 app.post('/api/admin/media/:id/review',{preHandler:managerOnly},async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const v=z.object({approve:z.boolean(),reviewNote:z.string().trim().min(10).max(1500),rightsConfirmed:z.boolean().default(false)}).strict().parse(req.body);
  if(v.approve&&(!enabled||!v.rightsConfirmed))throw fail('Private preview configuration and explicit publication-rights confirmation are required',409);
  const r=await transaction(async db=>{
   await requireManagerWrite(db,req);
   const row=await queryOne<any>(`UPDATE media_uploads SET status=$2,reviewer_id=$3,review_note=$4,reviewed_at=now()
    WHERE id=$1 AND status='pending_review' AND ($5=false OR consent_confirmed=true) RETURNING id,status`,
    [id,v.approve?'approved':'rejected',actor(req),v.reviewNote,v.approve],db);
   if(!row)throw fail('Media not awaiting review or consent missing',409);
   await db.query('INSERT INTO audit_logs(actor_id,action,resource_id,details) VALUES($1,$2,$3,$4)',[actor(req),'media.review',id,JSON.stringify(v)]);
   return row;
  });return {upload:r};
 });
}
