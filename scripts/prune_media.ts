// Schedule daily with a trusted worker; delete abandoned private uploads only.
import {S3Client,DeleteObjectCommand} from '@aws-sdk/client-s3';
import pg from 'pg';
const url=process.env.MIGRATION_DATABASE_URL,bucket=process.env.S3_BUCKET;
if(!url||!bucket)throw Error('MIGRATION_DATABASE_URL and S3_BUCKET required');
const db=new pg.Client({connectionString:url});const s3=new S3Client({region:process.env.AWS_REGION??'us-east-1'});
async function run(){
 await db.connect();
 const r=await db.query(`SELECT id,object_key FROM media_uploads
  WHERE status IN ('pending_upload','rejected') AND expires_at<now() LIMIT 100`);
 for(const row of r.rows){
  await s3.send(new DeleteObjectCommand({Bucket:bucket!,Key:row.object_key}));
  await db.query(`UPDATE media_uploads SET status='deleted' WHERE id=$1 AND status IN ('pending_upload','rejected')`,[row.id]);
 }
 console.log('Expired private media processed:',r.rowCount);
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.end());
