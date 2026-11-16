import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {seal,unseal,validSession,sessionLifetime,sameOriginMutation,type Session} from '../src/sso.ts';

test('admin encrypted sessions reject tampering, expiry and malformed payloads',async()=>{
 process.env.VIVABLUE_COOKIE_SECRET=randomBytes(48).toString('base64url');
 const session={token:'synthetic-test-token',subject:'synthetic-admin',expiresAt:Date.now()+20000};
 const cookie=await seal(session,20);
 assert.ok(validSession(await unseal<Session>(cookie)));
 const parts=cookie.split('.');parts[3]=(parts[3][0]==='a'?'b':'a')+parts[3].slice(1);
 assert.equal(await unseal(parts.join('.')),null);
 assert.equal(await unseal(await seal({...session,expiresAt:Date.now()-1},20)),null);
 assert.equal(await unseal(await seal(session,-1)),null);
 assert.equal(await unseal(await seal({...session,expiresAt:NaN},20)),null);
 const flow={state:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex'),verifier:randomBytes(32).toString('hex')};
 assert.equal(validSession(await unseal<Session>(await seal(flow,20))),false);
 assert.equal(await unseal('not-an-encrypted-session'),null);
});
test('session lifetime never extends a short provider token and rejects invalid expiry',()=>{
 assert.equal(sessionLifetime(5),5);assert.equal(sessionLifetime(900),900);assert.equal(sessionLifetime(7200),3600);
 for(const value of [0,-1,undefined,NaN,Infinity,'900'])assert.throws(()=>sessionLifetime(value),/Invalid token expiry/);
});
test('every administrative mutation including logout needs configured origin and custom header',()=>{
 process.env.VIVABLUE_APP_ORIGIN='http://localhost:3000';
 const request=(origin?:string,header?:string)=>new Request('http://attacker.invalid/api/auth/logout',{method:'POST',headers:{...(origin?{origin}:{}),...(header?{'x-vivablue-request':header}:{})}});
 assert.equal(sameOriginMutation(request('http://localhost:3000','admin')),true);
 assert.equal(sameOriginMutation(request('http://attacker.invalid','admin')),false);
 assert.equal(sameOriginMutation(request('http://localhost:3000')),false);
 assert.equal(sameOriginMutation(request(undefined,'admin')),false);
});
