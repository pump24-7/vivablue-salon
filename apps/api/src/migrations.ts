import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

// Both src/ and dist/ live three levels below the repository root.
const migrationDirectory=fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
const migrationLock=78222602;

export async function runMigrations(connectionString:string){
 const client=new pg.Client({connectionString});
 try{
  await client.connect();
  // Serialize first-time ledger creation too; concurrent fresh installs must not race.
  await client.query('BEGIN');
  try{
   await client.query('SELECT pg_advisory_xact_lock($1)',[migrationLock]);
   await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}

  const files=readdirSync(migrationDirectory).filter(file=>/^\d+.*\.sql$/.test(file)).sort();
  for(const file of files){
   const sql=readFileSync(resolve(migrationDirectory,file),'utf8');
   const hash=createHash('sha256').update(sql).digest('hex');
   await client.query('BEGIN');
   try{
    await client.query('SELECT pg_advisory_xact_lock($1)',[migrationLock]);
    const existing=await client.query<{sha256:string}>('SELECT sha256 FROM schema_migrations WHERE version=$1',[file]);
    if(existing.rowCount){
     if(existing.rows[0].sha256!==hash)throw Error('Migration checksum mismatch: '+file);
    }else{
     await client.query(sql);
     await client.query('INSERT INTO schema_migrations(version,sha256) VALUES($1,$2)',[file,hash]);
    }
    await client.query('COMMIT');
    if(!existing.rowCount)console.log('Applied',file);
   }catch(error){await client.query('ROLLBACK');throw error}
  }
 }finally{await client.end()}
}
