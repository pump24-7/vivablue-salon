import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import https from 'node:https';

const ca=readFileSync(new URL('../../work/dev/tls/ca.crt',import.meta.url));
const issuer='https://localhost:8443/realms/vivablue-dev';
const discovery=await new Promise((resolve,reject)=>{
 const req=https.get(issuer+'/.well-known/openid-configuration',{ca,timeout:5000},res=>{
  let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{
   try{assert.equal(res.statusCode,200);resolve(JSON.parse(body))}catch(error){reject(error)}
  });
 });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Identity provider timeout')));
});
assert.equal(discovery.issuer,issuer);
assert.ok(discovery.code_challenge_methods_supported.includes('S256'));
console.log('PASS: local OIDC discovery over verified TLS; PKCE S256 supported.');
const get=path=>fetch(path,{signal:AbortSignal.timeout(15000)});
const health=await get('http://127.0.0.1:4000/health');
assert.equal(health.status,200);assert.equal((await health.json()).app,'Viva Blue Salon');
const catalog=await get('http://127.0.0.1:4000/api/catalog');
assert.equal(catalog.status,200);
const {services}=await catalog.json();
assert.ok(services.some(service=>service.slug==='dev-test-haircut'&&service.is_bookable));
assert.equal(new Set(services.map(service=>service.id)).size,services.length);
assert.ok(services.every(service=>typeof service.name_en==='string'&&typeof service.name_es==='string'));
console.log('PASS: API and development database serve the editable bilingual catalog and seeded test service.');
const admin=await get('http://localhost:3000');assert.equal(admin.status,200);
assert.ok((await admin.text()).includes('Viva Blue'));
const protectedRoute=await get('http://localhost:3000/api/bridge/admin/overview');assert.equal(protectedRoute.status,401);
console.log('PASS: admin page loads; unauthenticated administrative API remains protected.');
const metro=await get('http://127.0.0.1:8081/status');
assert.equal(await metro.text(),'packager-status:running');
console.log('PASS: Expo Metro is running for the actual mobile application. Device installation is a separate check.');
