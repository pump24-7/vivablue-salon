import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {DateTime} from 'luxon';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import pg from 'pg';
import {runMigrations} from '../../src/migrations.js';

test('Stage 4 salon management with real isolated PostgreSQL and signed JWTs',{timeout:90000},async t=>{
 const bare=new URL(process.env.TEST_DATABASE_URL??'http://invalid');
 if(!['postgres:','postgresql:'].includes(bare.protocol)||!['localhost','127.0.0.1','[::1]'].includes(bare.hostname)
  ||!/^\/vivablue_test(?:_[a-z0-9_]+)?$/.test(bare.pathname)||bare.search||bare.hash)
  throw Error('TEST_DATABASE_URL must name a loopback vivablue_test database without query parameters; no operational databases.');
 const control=new pg.Pool({connectionString:bare.toString()});t.after(()=>control.end());
 await control.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
 await control.query('CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public');
 const schema='stage4_'+randomUUID().replaceAll('-','');await control.query(`CREATE SCHEMA ${schema}`);
 bare.searchParams.set('options','-csearch_path='+schema+',public');const url=bare.toString();
 await runMigrations(url);await runMigrations(url);
 const sql=new pg.Pool({connectionString:url});t.after(()=>sql.end());
 process.env.DATABASE_URL=url;process.env.NODE_ENV='test';
 const {pool}=await import('../../src/db.js');t.after(()=>pool.end());
 const {buildApp}=await import('../../src/app.js');
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const jwk={...await exportJWK(publicKey),kid:'stage4-local',alg:'RS256',use:'sig'};
 const keys=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({keys:[jwk]}))});
 await new Promise<void>(resolve=>keys.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise<void>(resolve=>{keys.closeAllConnections();keys.close(()=>resolve())}));
 const address=keys.address();assert.ok(address&&typeof address==='object');
 const issuer='https://stage4.invalid',audience='stage4-api';
 const app=await buildApp({NODE_ENV:'test',HOST:'127.0.0.1',PORT:4000,DATABASE_URL:url,CORS_ORIGINS:'http://localhost:3000',
  AUTH_ISSUER:issuer,AUTH_AUDIENCE:audience,AUTH_JWKS_URL:`http://127.0.0.1:${address.port}`,MEDIA_UPLOADS_ENABLED:false,AWS_REGION:'us-east-1'});
 const apiAddress=await app.listen({host:'127.0.0.1',port:0});t.after(async()=>{app.server.closeAllConnections();await app.close()});
 const tokens:Record<string,string>={},users:Record<string,string>={};
 for(const role of ['customer','stylist','manager','admin']){
  users[role]=(await sql.query('INSERT INTO users(auth_subject,display_name,role) VALUES($1,$1,$1) RETURNING id',[role])).rows[0].id;
  tokens[role]=await new SignJWT({role:'admin'}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setSubject(role).setIssuer(issuer).setAudience(audience).setExpirationTime('10m').sign(privateKey);
 }
 async function request(path:string,body?:any,method=body===undefined?'GET':'POST',role='manager'){
  const response=await fetch(apiAddress+'/api/'+path,{method,signal:AbortSignal.timeout(5000),headers:{authorization:'Bearer '+tokens[role],...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json() as any};
 }
 async function ok(path:string,body?:any,method?:string,role?:string){const r=await request(path,body,method,role);assert.equal(r.status,200,JSON.stringify(r.body));return r.body}
 const day=DateTime.now().setZone('America/New_York').plus({days:3}).startOf('day');
 const service=(await sql.query("SELECT id FROM services WHERE slug='haircut'")).rows[0].id;
 let stylist:string,shift:string,booking:string;
 const approved={slug:'haircut',nameEn:'Test cut',nameEs:'Corte de prueba',descriptionEn:'Test',descriptionEs:'Prueba',durationMinutes:60,bufferMinutes:15,startingPriceCents:4200,requiresConsultation:true,isVisible:true,isBookable:true};
 await t.test('manager edits full catalog, qualified stylist and recurring shift; inactive drafts remain manageable',async()=>{
  await ok('admin/services/'+service,approved,'PATCH');
  stylist=(await ok('admin/stylists',{displayName:'Stage 4 synthetic stylist'})).stylist.id;
  await ok('admin/stylists/'+stylist,{displayName:'Stage 4 synthetic stylist',bio:'Synthetic biography',isActive:true,userId:users.stylist},'PATCH');
  await ok('admin/stylists/'+stylist+'/services',{serviceIds:[service]});
  shift=(await ok('admin/stylists/'+stylist+'/shifts',{weekday:day.weekday,startLocal:'10:00',endLocal:'18:00'})).shift.id;
  assert.equal((await request('admin/stylists/'+stylist+'/shifts',{weekday:day.weekday,startLocal:'11:00',endLocal:'12:00'})).status,409);
  await ok('admin/shifts/'+shift,{weekday:day.weekday,startLocal:'09:00',endLocal:'18:00'},'PATCH');
  assert.equal((await ok('admin/stylists/'+stylist+'/schedule')).shifts.length,1);
  assert.equal((await ok('admin/stylists')).stylists[0].user_id,users.stylist);
  const extra=(await ok('admin/services',{...approved,slug:'stage4-draft',isVisible:false,isBookable:false})).service.id;
  assert.ok((await ok('admin/services')).services.some((s:any)=>s.id===extra));
  assert.ok(!(await ok('catalog')).services.some((s:any)=>s.id===extra));
  await ok('admin/policies',{cancellationEn:'Synthetic cancellation policy',cancellationEs:'Política de cancelación sintética',serviceConsentEn:'Synthetic service consent',serviceConsentEs:'Consentimiento sintético',privacyUrl:'https://example.invalid/privacy'});
 });
 await t.test('appointment details, quote and audit survive catalog edits; schedule and qualification changes protect active requests',async()=>{
  const start=day.set({hour:10}).toUTC().toISO();
  booking=(await ok('bookings',{serviceId:service,stylistId:stylist,startAt:start,idempotencyKey:randomUUID(),consultationAck:true,policyAccepted:true,customerNote:'Synthetic consultation note'},'POST','customer')).appointment.id;
  const block={startAt:start,endAt:day.set({hour:12}).toUTC().toISO(),reason:'Synthetic leave'};
  for(const path of ['admin/stylists/'+stylist+'/time-off','admin/closures'])assert.equal((await request(path,block)).status,409);
  assert.equal((await request('admin/shifts/'+shift,{weekday:day.weekday,startLocal:'12:00',endLocal:'18:00'},'PATCH')).status,409);
  assert.equal((await request('admin/shifts/'+shift,undefined,'DELETE')).status,409);
  assert.equal((await request('admin/stylists/'+stylist+'/services',{serviceIds:[]})).status,409);
  assert.equal((await request('admin/stylists/'+stylist,{displayName:'Inactive test',bio:'',isActive:false},'PATCH')).status,409);
  await ok('admin/services/'+service,{...approved,startingPriceCents:9000,durationMinutes:120},'PATCH');
  const appt=(await ok('admin/bookings')).appointments.find((a:any)=>a.id===booking);
  assert.equal(appt.quoted_price_cents,4200);assert.equal(appt.customer_note,'Synthetic consultation note');assert.equal(appt.consultation_ack,true);assert.ok(appt.policy_ack_at);
  assert.equal(new Date(appt.end_at).getTime()-new Date(appt.start_at).getTime(),75*60000);
  const workspace=await ok('admin/workspace');assert.equal(workspace.role,'manager');
  assert.deepEqual(workspace.appointments.find((a:any)=>a.id===booking),appt);
  await ok('admin/services/'+service,approved,'PATCH');
  await ok('admin/bookings/'+booking+'/status',{status:'confirmed'});
  assert.ok((await ok('me/notifications',undefined,'GET','customer')).notifications.some((n:any)=>n.status==='confirmed'));
 });
 await t.test('time-off and closure edits/removal change real availability, with offset-aware boundaries',async()=>{
  const start=day.set({hour:13}).toUTC().toISO({suppressMilliseconds:true})!,end=day.set({hour:14}).toUTC().toISO()!;
  const v={startAt:start,endAt:end,reason:'Synthetic one-hour absence'};
  const off=(await ok('admin/stylists/'+stylist+'/time-off',v)).timeOff.id;
  const availability='availability?'+new URLSearchParams({serviceId:service,stylistId:stylist,date:day.toISODate()!});
  assert.ok(!(await ok(availability)).slots.includes(start));
  await ok('admin/time-off/'+off,{...v,startAt:day.set({hour:14}).toUTC().toISO(),endAt:day.set({hour:15}).toUTC().toISO()},'PATCH');
  await ok('admin/time-off/'+off,undefined,'DELETE');
  const closure=(await ok('admin/closures',v)).closure.id;
  assert.ok(!(await ok(availability)).slots.includes(start));
  assert.equal((await request('admin/closures/'+closure,{...v,startAt:day.set({hour:10}).toUTC().toISO()},'PATCH')).status,409);
  await ok('admin/closures/'+closure,undefined,'DELETE');
  assert.ok((await ok(availability)).slots.includes(start));
 });
 await t.test('concurrent booking and closure cannot both claim the same available interval',async()=>{
  const startAt=day.set({hour:15}).toUTC().toISO(),endAt=day.set({hour:17}).toUTC().toISO();
  const results=await Promise.all([
   request('bookings',{serviceId:service,stylistId:stylist,startAt,idempotencyKey:randomUUID(),policyAccepted:true,consultationAck:true},'POST','customer'),
   request('admin/closures',{startAt,endAt,reason:'Synthetic concurrent closure'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 });
 await t.test('stock edits are atomic, reject stale expected stock, hide sold-out products and retain audit before/after',async()=>{
  const v={name:'Stage 4 synthetic product',stockOnHand:2,unitPriceCents:1200,availableForSale:true,description:'Test only',imageUrl:'https://example.invalid/test.png'};
  const id=(await ok('admin/inventory',v)).product.id;
  const saves=await Promise.all([request('admin/inventory/'+id,{...v,stockOnHand:3,expectedStock:2},'PATCH'),request('admin/inventory/'+id,{...v,stockOnHand:4,expectedStock:2},'PATCH')]);
  assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);
  const stock=saves.find(r=>r.status===200)!.body.product.stock_on_hand;
  const result=await ok('admin/inventory/'+id,{...v,stockOnHand:0,expectedStock:stock},'PATCH');assert.equal(result.product.available_for_sale,false);
  assert.equal((await request('admin/inventory/'+id+'/publish',{publish:true})).status,409);
  await ok('admin/inventory/'+id+'/publish',{publish:false});
  const entries=(await ok('admin/audit')).entries.filter((a:any)=>a.resource_id===id&&a.action==='inventory.patch');
  assert.equal(entries.length,2);assert.equal(entries[0].details.before.stock_on_hand,stock);assert.equal(entries[0].details.after.product.stock_on_hand,0);
 });
 await t.test('image publication requires explicit rights evidence; replacing image withdraws rights and favorites',async()=>{
  const v={imageUrl:'https://example.invalid/synthetic.png',captionEn:'Synthetic photo',captionEs:'Foto sintética'};
  const id=(await ok('admin/lookbook',v)).look.id;
  for(const body of [{rightsConfirmed:true,publish:true},{rightsConfirmed:false,publish:true,rightsNote:'Synthetic release reference'}])assert.equal((await request('admin/lookbook/'+id+'/review',body)).status,409);
  await ok('admin/lookbook/'+id+'/review',{rightsConfirmed:true,publish:true,rightsNote:'Synthetic fixture release stage4'});
  await ok('me/favorites/'+id,undefined,'PUT','customer');
  await ok('admin/lookbook/'+id,{...v,imageUrl:'https://example.invalid/replaced.png'},'PATCH');
  assert.ok(!(await ok('lookbook')).looks.some((l:any)=>l.id===id));assert.deepEqual((await ok('me/favorites',undefined,'GET','customer')).looks,[]);
  assert.equal((await ok('admin/media')).enabled,false);
  const media=(await sql.query("INSERT INTO media_uploads(user_id,object_key,content_type,byte_size,status,consent_confirmed) VALUES($1,'synthetic-no-object','image/png',100,'pending_review',true) RETURNING id",[users.customer])).rows[0].id;
  assert.equal((await request('admin/media/'+media+'/preview')).status,503);
  assert.equal((await request('admin/media/'+media+'/review',{approve:true,reviewNote:'Synthetic approval attempt',rightsConfirmed:true})).status,409);
  await ok('admin/media/'+media+'/review',{approve:false,reviewNote:'Synthetic rejection for unavailable image'});
  assert.equal((await request('admin/media/'+media+'/review',{approve:false,reviewNote:'Synthetic duplicate review'})).status,409);
 });
 await t.test('event edits respect registrations and cancellation preserves customer records',async()=>{
  const v={titleEn:'Stage4 synthetic event',titleEs:'Evento de prueba',startsAt:day.plus({days:10}).toISO(),endsAt:day.plus({days:10,hours:1}).toISO(),capacity:3,priceCents:0};
  const id=(await ok('admin/events',v)).event.id;await ok('admin/events/'+id+'/publish',{publish:true});
  await ok('events/'+id+'/register',{seats:2},'POST','customer');
  assert.equal((await request('admin/events/'+id,{...v,capacity:1},'PATCH')).status,409);
  assert.equal((await request('admin/events/'+id,{...v,priceCents:2000},'PATCH')).status,409);
  await ok('admin/events/'+id,{...v,capacity:4,descriptionEn:'Updated description'},'PATCH');
  assert.equal((await ok('admin/events/'+id+'/registrations')).registrations.length,1);
  await ok('admin/events/'+id+'/cancel',{});
  assert.equal((await ok('me/events',undefined,'GET','customer')).registrations[0].status,'cancelled');
  assert.equal((await request('admin/events/'+id+'/publish',{publish:true})).status,409);
 });
 await t.test('modifier edits change future options without changing historical appointment snapshots',async()=>{
  const v={serviceId:service,labelEn:'Extra synthetic time',labelEs:'Tiempo de prueba',additionalMinutes:15,additionalPriceCents:500,isEnabled:true};
  const id=(await ok('admin/modifiers',v)).modifier.id;
  await ok('admin/modifiers/'+id,{...v,isEnabled:false},'PATCH');
  assert.ok(!(await ok('booking-options?serviceId='+service)).modifiers.some((m:any)=>m.id===id));
 });
 await t.test('database roles deny customer/stylist management and manager privilege escalation; revocation applies to existing tokens',async()=>{
  for(const role of ['customer','stylist']){
   assert.equal((await request('admin/workspace',undefined,'GET',role)).status,403);
   assert.equal((await request('admin/services',undefined,'GET',role)).status,403);
   assert.equal((await request('admin/stylists/'+stylist+'/time-off',{startAt:day.toISO(),endAt:day.plus({hours:1}).toISO()},'POST',role)).status,403);
  }
  assert.equal((await request('admin/staff-accounts')).status,403);
  assert.equal((await request('admin/staff-accounts/'+users.customer,{role:'admin'},'PATCH')).status,403);
  assert.equal((await request('admin/staff-accounts/'+users.admin,{role:'customer'},'PATCH','admin')).status,409);
  const accounts=await ok('admin/staff-accounts?search=customer',undefined,'GET','admin');assert.ok(accounts.accounts.some((a:any)=>a.id===users.customer));
  await ok('admin/staff-accounts/'+users.manager,{role:'customer'},'PATCH','admin');
  assert.equal((await request('admin/services')).status,403);
  await ok('admin/staff-accounts/'+users.manager,{role:'manager'},'PATCH','admin');
 });
 await t.test('an audit write failure rolls back the management mutation',async()=>{
  await sql.query(`CREATE FUNCTION stage4_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END; $$`);
  await sql.query("CREATE TRIGGER stage4_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW WHEN (NEW.action='inventory.post') EXECUTE FUNCTION stage4_fail_audit()");
  assert.equal((await request('admin/inventory',{name:'Must roll back',stockOnHand:1,unitPriceCents:100})).status,500);
  assert.equal((await sql.query("SELECT count(*)::int AS n FROM retail_products WHERE name='Must roll back'")).rows[0].n,0);
 });
});
