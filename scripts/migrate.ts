import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import pg from 'pg';
const connectionString=process.env.MIGRATION_DATABASE_URL;
if(!connectionString)throw Error('MIGRATION_DATABASE_URL required. Never run against Nestease production.');
const client=new pg.Client({connectionString});
const directory=resolve(fileURLToPath(new URL('../db/migrations/',import.meta.url)));
async function main(){
 await client.connect();
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const files=readdirSync(directory).filter(x=>/^\d+.*\.sql$/.test(x)).sort();
 for(const file of files){
  const sql=readFileSync(resolve(directory,file),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
  await client.query('BEGIN');
  try{
   await client.query('SELECT pg_advisory_xact_lock(78222602)');
   const existing=await client.query('SELECT sha256 FROM schema_migrations WHERE version=$1',[file]);
   if(existing.rowCount){if(existing.rows[0].sha256!==hash)throw Error('Migration checksum mismatch: '+file);await client.query('COMMIT');continue}
   await client.query(sql);
   await client.query('INSERT INTO schema_migrations(version,sha256) VALUES ($1,$2)',[file,hash]);
   await client.query('COMMIT');console.log('Applied',file);
  }catch(e){await client.query('ROLLBACK');throw e}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>client.end());
