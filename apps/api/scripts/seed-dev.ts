// Explicit local fixtures only. This script is not imported by the API server.
import {readFileSync} from 'node:fs';
import pg from 'pg';

type FixtureUser={id:string,username:string,role:string,name:string};
type Fixtures={users:FixtureUser[],serviceId:string,stylistId:string,modifierId:string,productId:string,eventId:string};
const fixtures:Fixtures=JSON.parse(readFileSync(new URL('../../../scripts/dev/fixtures.json',import.meta.url),'utf8'));

function localConnection(value:string|undefined,username:string){
 if(process.env.NODE_ENV!=='development'||process.env.VIVABLUE_DEV_SEED!=='true'||!value){
  throw Error('Development seeding requires NODE_ENV=development and VIVABLUE_DEV_SEED=true.');
 }
 const url=new URL(value);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||
    url.pathname!=='/vivablue_dev'||url.username!==username||url.search||url.hash){
  throw Error('Development fixtures require a bare loopback vivablue_dev URL and the dedicated development role.');
 }
 return url;
}
const migration=localConnection(process.env.MIGRATION_DATABASE_URL,'vivablue_dev_owner');
const runtime=localConnection(process.env.DATABASE_URL,'vivablue_app');
if(migration.host!==runtime.host)throw Error('Migration and runtime connections must use the same local database server.');
const client=new pg.Client({connectionString:migration.toString()});
await client.connect();
try{
 const identity=await client.query('SELECT current_database() AS db,session_user AS owner');
 if(identity.rows[0].db!=='vivablue_dev'||identity.rows[0].owner!=='vivablue_dev_owner')throw Error('Unexpected development database identity.');
 const ledger=await client.query('SELECT count(*)::int AS n FROM schema_migrations');
 if(ledger.rows[0].n<3)throw Error('Run the complete migration sequence before seeding.');
 await client.query('BEGIN');
 const role=await client.query("SELECT 1 FROM pg_roles WHERE rolname='vivablue_app'");
 if(!role.rowCount)await client.query('CREATE ROLE vivablue_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');
 await client.query('ALTER ROLE vivablue_app PASSWORD '+client.escapeLiteral(decodeURIComponent(runtime.password)));
 await client.query('GRANT CONNECT ON DATABASE vivablue_dev TO vivablue_app');
 await client.query('GRANT USAGE ON SCHEMA public TO vivablue_app');
 await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO vivablue_app');
 await client.query(`GRANT INSERT,UPDATE,DELETE ON users,services,stylists,stylist_services,stylist_shifts,stylist_time_off,
  appointments,salon_closures,peak_pricing_rules,service_modifiers,lookbook_images,client_favorites,
  retail_products,salon_events,event_registrations,media_uploads,salon_policies TO vivablue_app`);
 await client.query('GRANT INSERT ON audit_logs TO vivablue_app');
 await client.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO vivablue_app');
 for(const user of fixtures.users){
  await client.query(`INSERT INTO users(id,auth_subject,email,display_name,role)
   VALUES($1::uuid,$1::text,$2,$3,$4) ON CONFLICT(id) DO NOTHING`,[user.id,user.username+'@example.invalid',user.name,user.role]);
 }
 const salon=(await client.query('SELECT id FROM salons ORDER BY name LIMIT 1')).rows[0]?.id;
 if(!salon)throw Error('Migration did not create a salon.');
 const manager=fixtures.users.find(user=>user.role==='manager')!;
 const stylist=fixtures.users.find(user=>user.role==='stylist')!;
 await client.query(`INSERT INTO services(id,slug,name_en,name_es,description_en,description_es,
  duration_minutes,buffer_minutes,starting_price_cents,requires_consultation,is_bookable)
  VALUES($1,'dev-test-haircut','Development test haircut','Corte de prueba de desarrollo',
  'LOCAL TEST ONLY. Synthetic price and duration; not a real salon offer.',
  'SOLO PRUEBA LOCAL. Precio y duración de prueba; no es una oferta del salón.',45,15,2500,true,true)
  ON CONFLICT(id) DO NOTHING`,[fixtures.serviceId]);
 await client.query(`INSERT INTO stylists(id,salon_id,user_id,display_name,bio)
  VALUES($1,$2,$3,'Development Test Stylist','LOCAL TEST ONLY. Synthetic availability.') ON CONFLICT(id) DO NOTHING`,
  [fixtures.stylistId,salon,stylist.id]);
 await client.query('INSERT INTO stylist_services(stylist_id,service_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[fixtures.stylistId,fixtures.serviceId]);
 for(let day=1;day<=7;day++){
  await client.query(`INSERT INTO stylist_shifts(id,stylist_id,weekday,start_local,end_local)
   VALUES($1,$2,$3,'10:00','17:00') ON CONFLICT(id) DO NOTHING`,
   [`20000000-0000-4000-8000-00000000002${day}`,fixtures.stylistId,day]);
 }
 await client.query(`INSERT INTO service_modifiers(id,service_id,label_en,label_es,additional_minutes,additional_price_cents,is_enabled)
  VALUES($1,$2,'Development extra time','Tiempo adicional de prueba',15,500,true) ON CONFLICT(id) DO NOTHING`,[fixtures.modifierId,fixtures.serviceId]);
 await client.query(`INSERT INTO salon_policies(salon_id,cancellation_en,cancellation_es,service_consent_en,
  service_consent_es,privacy_url,effective_at,approved_by) VALUES($1,
  'LOCAL DEVELOPMENT TEST ONLY. These appointments are synthetic and may be cancelled for testing.',
  'SOLO PRUEBA LOCAL. Estas citas son de prueba y se pueden cancelar durante las pruebas.',
  'LOCAL DEVELOPMENT TEST ONLY. No actual salon service or charge is provided.',
  'SOLO PRUEBA LOCAL. No se proporciona un servicio ni un cobro real del salón.',
  'https://example.invalid/development-privacy',now(),$2) ON CONFLICT(salon_id) DO NOTHING`,[salon,manager.id]);
 await client.query(`INSERT INTO retail_products(id,salon_id,name,description,stock_on_hand,unit_price_cents,available_for_sale)
  VALUES($1,$2,'Development draft product','LOCAL TEST ONLY. No real inventory or sale.',3,1000,false)
  ON CONFLICT(id) DO NOTHING`,[fixtures.productId,salon]);
 await client.query(`INSERT INTO salon_events(id,salon_id,title_en,title_es,starts_at,ends_at,capacity,price_cents,status)
  VALUES($1,$2,'Development draft event','Evento de prueba',now()+interval '14 days',now()+interval '14 days 1 hour',5,0,'draft')
  ON CONFLICT(id) DO NOTHING`,[fixtures.eventId,salon]);
 await client.query('COMMIT');
 console.log('Local development fixtures are ready. Existing fixtures were retained; nine original services remain unchanged.');
 console.log('Runtime uses vivablue_app without schema ownership or writes to historical program/financial tables.');
}catch(error){await client.query('ROLLBACK');throw error}
finally{await client.end()}
