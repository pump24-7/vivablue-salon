import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {DateTime} from 'luxon';
import {exportJWK,generateKeyPair,SignJWT} from 'jose';
import pg from 'pg';

const execute=promisify(execFile);
const root=fileURLToPath(new URL('../../../../',import.meta.url));

function testDatabase(){
 const value=process.env.TEST_DATABASE_URL;
 if(!value)throw Error('TEST_DATABASE_URL is required; use a disposable local database named vivablue_test.');
 const url=new URL(value);
 if(!['postgres:','postgresql:'].includes(url.protocol)||
    !['localhost','127.0.0.1','[::1]'].includes(url.hostname)||
    !/^\/vivablue_test(?:_[a-z0-9_]+)?$/.test(url.pathname)||url.search||url.hash){
  // pg accepts query parameters such as host that can override the URL hostname.
  // Only this suite may add connection options after validating the bare URL.
  throw Error('Integration tests require a loopback PostgreSQL URL and a vivablue_test database, without query parameters or fragments; no production databases.');
 }
 return url;
}

test('Stage 1 migrations, authorization and appointment concurrency', {timeout:90000},async t=>{
 const database=testDatabase();
 const control=new pg.Pool({connectionString:database.toString()});
 t.after(()=>control.end());
 // All application tables use new isolated schemas in this disposable test DB.
 // Do not truncate/drop existing schemas or application records.
 await control.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
 await control.query('CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public');
 async function freshSchema(){
  const schema='stage1_'+randomUUID().replaceAll('-','');
  await control.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(database);
  url.searchParams.set('options',`-csearch_path=${schema},public`);
  return url.toString();
 }

 // Exercise the documented npm command, resolving dependencies from apps/api
 // and loading MIGRATION_DATABASE_URL from .env without NODE_PATH or a root install.
 const fixture=await mkdtemp(join(tmpdir(),'vivablue-stage1-'));
 t.after(()=>rm(fixture,{recursive:true,force:true}));
 const fixtureApi=join(fixture,'apps/api');
 await mkdir(join(fixtureApi,'src'),{recursive:true});
 await mkdir(join(fixture,'scripts'));
 await cp(join(root,'apps/api/package.json'),join(fixtureApi,'package.json'));
 await cp(join(root,'apps/api/src/migrations.ts'),join(fixtureApi,'src/migrations.ts'));
 await cp(join(root,'scripts/migrate.ts'),join(fixture,'scripts/migrate.ts'));
 await cp(join(root,'db/migrations'),join(fixture,'db/migrations'),{recursive:true});
 await symlink(join(root,'apps/api/node_modules'),join(fixtureApi,'node_modules'),'junction');
 const npmCli=process.env.npm_execpath;
 assert.ok(npmCli,'Run this suite with npm run test:integration');
 const migrationEnv={...process.env};
 delete migrationEnv.MIGRATION_DATABASE_URL;
 delete migrationEnv.NODE_PATH;
 async function configureMigration(url:string){
  await writeFile(join(fixtureApi,'.env'),`MIGRATION_DATABASE_URL=${url}\n`,{mode:0o600});
 }
 function migrate(){
  return execute(process.execPath,[npmCli!,'--prefix',fixtureApi,'run','migrate'],{
   cwd:fixture,env:migrationEnv,timeout:20000
  });
 }
 const applicationUrl=await freshSchema();
 const sql=new pg.Pool({connectionString:applicationUrl});
 t.after(()=>sql.end());
 await configureMigration(applicationUrl);
 await t.test('fresh migrations and repeat execution preserve checksums',async()=>{
  const first=await migrate();
  assert.equal((first.stdout.match(/Applied /g)??[]).length,3);
  const repeated=await migrate();
  assert.doesNotMatch(repeated.stdout,/Applied /);
  const ledger=await sql.query('SELECT version,sha256 FROM schema_migrations ORDER BY version');
  assert.equal(ledger.rowCount,3);
  for(const row of ledger.rows){
   const source=await readFile(join(root,'db/migrations',row.version));
   assert.equal(row.sha256,createHash('sha256').update(source).digest('hex'));
  }
 });
 await t.test('concurrent first migrations serialize ledger creation and apply once',async()=>{
  const url=await freshSchema();
  await configureMigration(url);
  const results=await Promise.all([migrate(),migrate()]);
  assert.equal((results.map(result=>result.stdout).join('').match(/Applied /g)??[]).length,3);
  const client=new pg.Client({connectionString:url});
  await client.connect();
  try{assert.equal((await client.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,3)}
  finally{await client.end()}
  await configureMigration(applicationUrl);
 });
 await t.test('changed applied SQL is rejected without changing the ledger',async()=>{
  const first=(await readdir(join(fixture,'db/migrations'))).sort()[0];
  const path=join(fixture,'db/migrations',first);
  const original=await readFile(path,'utf8');
  await writeFile(path,original+'\n-- test-only checksum change\n');
  try{await assert.rejects(migrate(),/Migration checksum mismatch/)}
  finally{await writeFile(path,original)}
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,3);
 });
 await t.test('a failing new migration rolls back its schema changes',async()=>{
  const path=join(fixture,'db/migrations/004_test_failure.sql');
  await writeFile(path,'CREATE TABLE stage1_rollback_probe(id integer); SELECT * FROM stage1_missing_table;');
  try{await assert.rejects(migrate(),/stage1_missing_table/)}
  finally{await rm(path)}
  assert.equal((await sql.query("SELECT to_regclass('stage1_rollback_probe') AS relation")).rows[0].relation,null);
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,3);
 });

 process.env.DATABASE_URL=applicationUrl;
 process.env.NODE_ENV='test';
 const {pool}=await import('../../src/db.js');
 t.after(()=>pool.end());
 const {buildApp}=await import('../../src/app.js');
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const jwk={...await exportJWK(publicKey),kid:'stage1-local',alg:'RS256',use:'sig'};
 const jwks=createServer((_req,res)=>{
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({keys:[jwk]}));
 });
 await new Promise<void>(resolve=>jwks.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise<void>((resolve,reject)=>{
  jwks.closeAllConnections();jwks.close(error=>error?reject(error):resolve());
 }));
 const jwksAddress=jwks.address();
 assert.ok(jwksAddress&&typeof jwksAddress==='object');
 const issuer='https://stage1-issuer.invalid/';
 const audience='vivablue-test-api';
 const app=await buildApp({NODE_ENV:'test',HOST:'127.0.0.1',PORT:4000,DATABASE_URL:applicationUrl,
  CORS_ORIGINS:'http://localhost:3000',AUTH_ISSUER:issuer,AUTH_AUDIENCE:audience,
  AUTH_JWKS_URL:`http://127.0.0.1:${jwksAddress.port}`,MEDIA_UPLOADS_ENABLED:false,AWS_REGION:'us-east-1'});
 t.after(async()=>{app.server.closeAllConnections();await app.close()});
 const address=await app.listen({port:0,host:'127.0.0.1'});
 const tokens:Record<string,string>={};
 for(const [subject,role] of Object.entries({alice:'customer',bob:'customer',manager:'manager',admin:'admin',stylist:'stylist'})){
  await sql.query('INSERT INTO users(auth_subject,role) VALUES($1,$2)',[subject,role]);
  // Forged role claims must not elevate a customer's database permissions.
  tokens[subject]=await new SignJWT({role:'admin'}).setProtectedHeader({alg:'RS256',kid:jwk.kid})
   .setSubject(subject).setIssuer(issuer).setAudience(audience).setExpirationTime('10m').sign(privateKey);
 }
 async function request(path:string,subject?:string,body?:unknown,tokenOverride?:string){
  const response=await fetch(address+path,{
   method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(3000),
   headers:{...(subject?{authorization:'Bearer '+(tokenOverride??tokens[subject])}:{}),
    ...(body===undefined?{}:{'content-type':'application/json'})},
   body:body===undefined?undefined:JSON.stringify(body)
  });
  return {status:response.status,body:await response.json() as any};
 }
 async function managerPost(path:string,body:unknown){
  const result=await request(path,'manager',body);
  assert.equal(result.status,200,JSON.stringify(result.body));
  return result.body;
 }
 await t.test('signed JWTs use database roles, require valid sessions and complete manager requests',async()=>{
  for(const subject of ['manager','admin'])assert.equal((await request('/api/admin/overview',subject)).status,200);
  for(const subject of ['alice','stylist'])assert.equal((await request('/api/admin/overview',subject)).status,403);
  assert.equal((await request('/api/admin/overview')).status,401);
  assert.equal((await request('/api/admin/overview','manager',undefined,'invalid')).status,401);
  for(const claims of [{audience:'wrong',expires:'10m'},{audience,expires:'-1m'}]){
   const token=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setSubject('manager')
    .setIssuer(issuer).setAudience(claims.audience).setExpirationTime(claims.expires).sign(privateKey);
   assert.equal((await request('/api/admin/overview','manager',undefined,token)).status,401);
  }
 });

 const day=DateTime.now().setZone('America/New_York').plus({days:3}).startOf('day');
 let serviceId:string,stylistId:string,modifierId:string,slot:string;
 let winner:string,loser:string,bookingId:string,winningRequest:Record<string,unknown>;
 const availability=()=>'/api/availability?'+new URLSearchParams({serviceId,stylistId,date:day.toISODate()!,modifierIds:modifierId??''});
 await t.test('manager configures service, qualification, shifts, modifiers, peak pricing and policies',async()=>{
  const catalog=await request('/api/catalog');
  assert.equal(catalog.status,200);
  assert.equal(catalog.body.services.length,9);
  assert.ok(catalog.body.services.every((s:any)=>s.is_bookable===false));
  serviceId=catalog.body.services.find((s:any)=>s.slug==='hair-color').id;
  stylistId=(await managerPost('/api/admin/stylists',{displayName:'Stage 1 Test Stylist'})).stylist.id;
  const unpublished=await request(availability());
  assert.deepEqual(unpublished.body.slots,[]);
  assert.ok(unpublished.body.reason);
  await managerPost(`/api/admin/services/${serviceId}/publish`,{
   durationMinutes:60,startingPriceCents:7000,requiresConsultation:true,isBookable:true
  });
  assert.equal((await request(availability())).status,404);
  await managerPost(`/api/admin/stylists/${stylistId}/services`,{serviceIds:[serviceId]});
  await managerPost(`/api/admin/stylists/${stylistId}/shifts`,{weekday:day.weekday,startLocal:'10:00',endLocal:'18:00'});
  modifierId=(await managerPost('/api/admin/modifiers',{serviceId,labelEn:'Test extra length',labelEs:'Largo de prueba',
   additionalMinutes:20,additionalPriceCents:1500,isEnabled:true})).modifier.id;
  await managerPost('/api/admin/peak-rules',{weekday:day.weekday,startLocal:'10:00',endLocal:'18:00',surchargeBps:1000,activate:true});
  const available=await request(availability());
  assert.equal(available.status,200);
  assert.equal(available.body.timezone,'America/New_York');
  slot=available.body.slots[0];assert.ok(slot);
  assert.equal(DateTime.fromISO(slot).setZone('America/New_York').hour,10);
  const candidate={serviceId,stylistId,startAt:slot,modifierIds:[modifierId],consultationAck:true,policyAccepted:true};
  assert.equal((await request('/api/bookings','alice',{...candidate,idempotencyKey:randomUUID()})).status,409);
  await managerPost('/api/admin/policies',{
   cancellationEn:'Synthetic test cancellation policy.',cancellationEs:'Política sintética de cancelación.',
   serviceConsentEn:'Synthetic test service consent.',serviceConsentEs:'Consentimiento sintético de servicio.',
   privacyUrl:'https://example.invalid/privacy'
  });
  assert.equal((await request('/api/bookings','alice',{...candidate,consultationAck:false,idempotencyKey:randomUUID()})).status,400);
  assert.equal((await request('/api/bookings','alice',{...candidate,policyAccepted:false,idempotencyKey:randomUUID()})).status,409);
 });
 await t.test('two customers racing for one appointment yield exactly one reservation and a server quote',async()=>{
  const candidates=['alice','bob'].map(subject=>({subject,body:{serviceId,stylistId,startAt:slot,
   modifierIds:[modifierId],consultationAck:true,policyAccepted:true,idempotencyKey:randomUUID(),quotedPriceCents:1}}));
  const results=await Promise.all(candidates.map(c=>request('/api/bookings',c.subject,c.body)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const index=results.findIndex(r=>r.status===200);
  winner=candidates[index].subject;loser=candidates[1-index].subject;winningRequest=candidates[index].body;
  const appointment=results[index].body.appointment;bookingId=appointment.id;
  assert.equal(appointment.status,'requested');assert.equal(appointment.quoted_price_cents,9350);
  assert.equal((Date.parse(appointment.end_at)-Date.parse(appointment.start_at))/60000,80);
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM appointments')).rows[0].n,1);
  assert.ok(!(await request(availability())).body.slots.includes(slot));
  const replay=await request('/api/bookings',winner,winningRequest);
  assert.equal(replay.status,200);assert.equal(replay.body.alreadyCreated,true);assert.equal(replay.body.appointment.id,bookingId);
 });
 await t.test('owner-only appointment access, manager confirmation and reviewed cancellation work',async()=>{
  assert.equal((await request('/api/bookings',loser)).body.appointments.length,0);
  assert.equal((await request(`/api/bookings/${bookingId}/cancel-request`,loser,{})).status,409);
  assert.equal((await request(`/api/admin/bookings/${bookingId}/status`,winner,{status:'confirmed'})).status,403);
  await managerPost(`/api/admin/bookings/${bookingId}/status`,{status:'confirmed'});
  assert.equal((await request('/api/bookings',winner)).body.appointments[0].status,'confirmed');
  assert.equal((await request(`/api/bookings/${bookingId}/cancel-request`,winner,{})).body.appointment.status,'cancel_requested');
  assert.ok(!(await request(availability())).body.slots.includes(slot));
  await managerPost(`/api/admin/bookings/${bookingId}/status`,{status:'cancelled'});
  assert.ok((await request(availability())).body.slots.includes(slot));
  assert.equal((await request(`/api/admin/bookings/${bookingId}/status`,'manager',{status:'confirmed'})).status,409);
  const actions=(await sql.query('SELECT action FROM audit_logs WHERE resource_id=$1',[bookingId])).rows.map(r=>r.action);
  for(const action of ['booking.requested','booking.confirmed','booking.cancel_requested','booking.cancelled'])assert.ok(actions.includes(action));
 });
 await t.test('retired customer programs remain unavailable',async()=>{
  for(const path of ['/api/memberships','/api/me/rewards','/api/admin/memberships']){
   assert.equal((await request(path,'admin')).status,404);
  }
 });
});
