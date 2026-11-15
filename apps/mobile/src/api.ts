import {clearSession,readSession,saveSession,sessionGeneration} from './auth-store';
const base=process.env.EXPO_PUBLIC_API_URL??'';
const issuer=process.env.EXPO_PUBLIC_AUTH_ISSUER??'';
const clientId=process.env.EXPO_PUBLIC_AUTH_CLIENT_ID??'';
export class ApiError extends Error{constructor(message:string,public status:number){super(message);this.name='ApiError'}}
let refresh:{version:number,promise:Promise<string|null>}|null=null;
export async function timedFetch(url:string,options:RequestInit={}){
 const controller=new AbortController();const abort=()=>controller.abort();
 if(options.signal?.aborted)controller.abort();else options.signal?.addEventListener('abort',abort);
 const timer=setTimeout(abort,15000);
 try{return await fetch(url,{...options,signal:controller.signal})}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort)}
}
async function refreshToken(version:number):Promise<string|null>{
 if(refresh?.version===version)return refresh.promise;
 const promise=(async()=>{
  const session=await readSession();
  if(!session?.refreshToken){await clearSession(version);return null}
  if(!issuer.startsWith('https://')||!clientId)throw new ApiError('Sign-in provider is not configured',503);
  const discovered=await timedFetch(issuer.replace(/\/$/,'')+'/.well-known/openid-configuration');
  if(!discovered.ok)throw new ApiError('Sign-in is temporarily unavailable. Please retry.',503);
  const discovery=await discovered.json();
  if(discovery.issuer!==issuer||typeof discovery.token_endpoint!=='string'||!discovery.token_endpoint.startsWith('https://'))throw new ApiError('Invalid sign-in configuration',503);
  const body=new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:session.refreshToken});
  const response=await timedFetch(discovery.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});
  const json=await response.json().catch(()=>({}));
  if(response.status===400&&json.error==='invalid_grant'){await clearSession(version);return null}
  if(!response.ok||typeof json.access_token!=='string'||!json.access_token)throw new ApiError('Sign-in is temporarily unavailable. Please retry.',503);
  const saved=await saveSession({accessToken:json.access_token,refreshToken:typeof json.refresh_token==='string'?json.refresh_token:session.refreshToken},version);
  return saved?json.access_token:null;
 })();
 refresh={version,promise};
 try{return await promise}finally{if(refresh?.promise===promise)refresh=null}
}
async function request<T>(path:string,options:RequestInit={},authenticated:boolean):Promise<T>{
 if(!base)throw new ApiError('API URL not configured',503);
 const headers=new Headers(options.headers);
 let token=authenticated?(await readSession())?.accessToken:null;
 const version=sessionGeneration();
 if(authenticated&&!token)throw new ApiError('Please sign in',401);
 if(token)headers.set('Authorization',`Bearer ${token}`);
 if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
 let response=await timedFetch(base+path,{...options,headers});
 if(authenticated&&version!==sessionGeneration())throw new ApiError('Session changed. Please sign in again.',401);
 if(authenticated&&response.status===401){
  const latest=(await readSession())?.accessToken;
  token=latest&&latest!==token?latest:await refreshToken(version);
  if(token&&version===sessionGeneration()){
   headers.set('Authorization',`Bearer ${token}`);response=await timedFetch(base+path,{...options,headers});
  }
 }
 if(authenticated&&version!==sessionGeneration())throw new ApiError('Session expired. Please sign in again.',401);
 if(authenticated&&response.status===401){await clearSession(version);throw new ApiError('Session expired. Please sign in again.',401)}
 const json=await response.json().catch(()=>({}));
 if(authenticated&&version!==sessionGeneration())throw new ApiError('Session changed. Please sign in again.',401);
 if(!response.ok)throw new ApiError(json.message??json.error??`Request failed (${response.status})`,response.status);
 return json as T;
}
export function publicApi<T>(path:string){return request<T>(path,{},false)}
export function api<T>(path:string,options:RequestInit={}){return request<T>(path,options,true)}
export function post<T>(path:string,data:unknown){return api<T>(path,{method:'POST',body:JSON.stringify(data)})}
export type Profile={id:string,display_name:string|null,role:string,preferred_language:'en'|'es'};
export type SalonService={id:string,slug:string,name_en:string,name_es:string,description_en:string,
 description_es:string,duration_minutes:number|null,starting_price_cents:number|null,
 requires_consultation:boolean,is_bookable:boolean};
export type Stylist={id:string,display_name:string,bio:string|null,service_ids:string[]};
export type Modifier={id:string,label_en:string,label_es:string,additional_minutes:number,additional_price_cents:number};
export type Quote={serviceMinutes:number,occupiedMinutes:number,baseCents:number|null,modifierCents:number,
 peakCents:number|null,totalCents:number|null,timezone:string};
export type Appointment={id:string,start_at:string,end_at:string,status:string,timezone:string,
 name_en:string,name_es:string,stylist_name:string,quoted_price_cents:number|null,
 selected_modifiers:Modifier[],price_breakdown:Partial<Quote>};
export type CustomerNotification={id:string,appointment_id:string,status:string,created_at:string,read_at:string|null,
 start_at:string,timezone:string,name_en:string,name_es:string,stylist_name:string};
