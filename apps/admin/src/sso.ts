import {createHash,randomBytes} from 'node:crypto';
import {EncryptJWT,jwtDecrypt,jwtVerify,createRemoteJWKSet} from 'jose';
export const authCookie='vb_admin_session';
export const flowCookie='vb_admin_oauth_flow';
export type Flow={state:string,nonce:string,verifier:string};
export type Session={token:string,expiresAt:number,subject:string};
function secret(){
 const v=process.env.VIVABLUE_COOKIE_SECRET;
 if(!v||v.length<32)throw Error('VIVABLUE_COOKIE_SECRET must be at least 32 characters');
 return createHash('sha256').update(v).digest();
}
export function random(){return randomBytes(32).toString('base64url')}
export function challenge(verifier:string){return createHash('sha256').update(verifier).digest('base64url')}
export async function seal(value:Flow|Session,lifeSeconds:number){
 return new EncryptJWT({...value}).setProtectedHeader({alg:'dir',enc:'A256GCM'})
  .setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+lifeSeconds).encrypt(secret());
}
export async function unseal<T>(cookie:string|undefined):Promise<T|null>{
 if(!cookie)return null;
 try{
  const {payload}=await jwtDecrypt(cookie,secret(),{keyManagementAlgorithms:['dir'],contentEncryptionAlgorithms:['A256GCM']});
  const session=typeof payload.token==='string'&&payload.token.length>0&&typeof payload.subject==='string'&&payload.subject.length>0
   &&typeof payload.expiresAt==='number'&&Number.isFinite(payload.expiresAt)&&payload.expiresAt>Date.now();
  const flow=[payload.state,payload.nonce,payload.verifier].every(v=>typeof v==='string'&&v.length>=32);
  if(!session&&!flow)return null;
  return payload as unknown as T;
 }catch{return null}
}
export function validSession(value:Session|null):value is Session{
 return Boolean(value&&typeof value.token==='string'&&value.token.length&&typeof value.subject==='string'
  &&Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now());
}
export function sessionLifetime(expiresIn:unknown){
 if(typeof expiresIn!=='number'||!Number.isFinite(expiresIn)||expiresIn<=0)throw Error('Invalid token expiry');
 return Math.min(expiresIn,3600);
}
export function sameOriginMutation(req:Request){
 const configured=process.env.VIVABLUE_APP_ORIGIN;
 return Boolean(configured&&req.headers.get('origin')===new URL(configured).origin&&req.headers.get('x-vivablue-request')==='admin');
}
export async function discovery(){
 const issuer=process.env.VIVABLUE_OIDC_ISSUER;
 if(!issuer||!issuer.startsWith('https://'))throw Error('VIVABLUE_OIDC_ISSUER must be HTTPS');
 const base=issuer.endsWith('/')?issuer:issuer+'/';
 const response=await fetch(new URL('.well-known/openid-configuration',base),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Cannot discover identity provider');
 const data=await response.json() as {issuer:string,authorization_endpoint:string,token_endpoint:string,jwks_uri:string};
 if(data.issuer.replace(/\/$/,'')!==issuer.replace(/\/$/,''))throw Error('Identity provider issuer mismatch');
 for(const endpoint of [data.authorization_endpoint,data.token_endpoint,data.jwks_uri]){
  if(!endpoint.startsWith('https://'))throw Error('Identity provider endpoint must be HTTPS');
 }
 return data;
}
export function redirectUri(){
 const origin=process.env.VIVABLUE_APP_ORIGIN;
 if(!origin)throw Error('VIVABLUE_APP_ORIGIN required');
 const u=new URL(origin);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&u.hostname==='localhost'))throw Error('HTTPS required');
 return new URL('/api/auth/callback',u).toString();
}
export async function exchangeAndVerify(code:string,flow:Flow):Promise<Session>{
 const conf=await discovery(),clientId=process.env.VIVABLUE_OIDC_CLIENT_ID;
 if(!clientId)throw Error('OIDC client ID missing');
 const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri(),client_id:clientId,code_verifier:flow.verifier});
 const clientSecret=process.env.VIVABLUE_OIDC_CLIENT_SECRET;
 const headers:Record<string,string>={'content-type':'application/x-www-form-urlencoded'};
 if(clientSecret){headers.authorization='Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64')}
 const res=await fetch(conf.token_endpoint,{method:'POST',headers,body:body.toString(),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('Organization sign-in token exchange failed');
 const token=await res.json() as {access_token?:string,id_token?:string,expires_in?:number};
 if(!token.access_token||!token.id_token)throw Error('Identity provider returned incomplete token set');
 const {payload}=await jwtVerify(token.id_token,createRemoteJWKSet(new URL(conf.jwks_uri)),{issuer:conf.issuer,audience:clientId});
 if(payload.nonce!==flow.nonce||!payload.sub)throw Error('Invalid nonce or subject');
 const seconds=sessionLifetime(token.expires_in);
 return {token:token.access_token,expiresAt:Date.now()+seconds*1000,subject:payload.sub};
}
