import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {managerOnly,type Identity} from '../src/auth.js';

test('manager preHandler completes allowed requests and denies every other role',async t=>{
 const app=Fastify({forceCloseConnections:true});
 t.after(()=>app.close());
 // This test-only identity hook isolates the Fastify lifecycle regression.
 // The integration suite verifies real signed JWTs and database-owned roles.
 app.addHook('preHandler',async req=>{
  const role=req.headers['x-test-role'] as Identity['role']|undefined;
  if(role)req.identity={userId:'test',subject:'test',role};
 });
 app.get('/protected',{preHandler:managerOnly},async()=>({ok:true}));
 const address=await app.listen({host:'127.0.0.1',port:0});
 for(const role of ['manager','admin','customer','stylist',undefined]){
  await t.test(role??'unauthenticated',async()=>{
   const response=await fetch(address+'/protected',{
    headers:role?{'x-test-role':role}:{},signal:AbortSignal.timeout(2000)
   });
   assert.equal(response.status,role==='manager'||role==='admin'?200:403);
   await response.arrayBuffer();
  });
 }
});
