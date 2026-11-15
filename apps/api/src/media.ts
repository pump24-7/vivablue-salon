import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {S3Client,HeadObjectCommand,PutObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {pool,queryOne} from './db.js';
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
 app.get('/api/admin/media',{preHandler:managerOnly},async()=>({uploads:(await pool.query(`SELECT id,user_id,content_type,byte_size,status,consent_confirmed,created_at
  FROM media_uploads ORDER BY created_at DESC LIMIT 100`)).rows}));
 app.post('/api/admin/media/:id/review',{preHandler:managerOnly},async req=>{
  const {id}=z.object({id:uuid}).parse(req.params);
  const {approve}=z.object({approve:z.boolean()}).parse(req.body);
  const r=await queryOne<any>(`UPDATE media_uploads SET status=$2,reviewer_id=$3
   WHERE id=$1 AND status='pending_review' RETURNING id,status`,[id,approve?'approved':'rejected',actor(req)]);
  if(!r)throw fail('Media not awaiting review',409);return {upload:r};
 });
}
