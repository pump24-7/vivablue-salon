import * as SecureStore from 'expo-secure-store';
const base=process.env.EXPO_PUBLIC_API_URL??'';
const issuer=process.env.EXPO_PUBLIC_AUTH_ISSUER??'';
const clientId=process.env.EXPO_PUBLIC_AUTH_CLIENT_ID??'';
let inFlightRefresh:Promise<string|null>|null=null;
async function refreshToken():Promise<string|null>{
 if(inFlightRefresh)return inFlightRefresh;
 inFlightRefresh=(async()=>{
  const refresh=await SecureStore.getItemAsync('vivablue_refresh_token');
  if(!refresh||!issuer||!clientId)return null;
  try{
   const discoveryResponse=await fetch(new URL('.well-known/openid-configuration',issuer.endsWith('/')?issuer:issuer+'/').toString());
   if(!discoveryResponse.ok)return null;
   const discovery=await discoveryResponse.json();
   if(typeof discovery.token_endpoint!=='string'||!discovery.token_endpoint.startsWith('https://'))return null;
   const body=new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:refresh});
   const r=await fetch(discovery.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});
   if(!r.ok)return null;
   const json=await r.json();if(!json.access_token)return null;
   await SecureStore.setItemAsync('vivablue_access_token',String(json.access_token));
   if(json.refresh_token)await SecureStore.setItemAsync('vivablue_refresh_token',String(json.refresh_token));
   return String(json.access_token);
  }catch{return null}
 })().finally(()=>{inFlightRefresh=null});
 return inFlightRefresh;
}
async function request<T>(path:string,options:RequestInit={},authenticated:boolean):Promise<T>{
 if(!base)throw Error('API URL not configured');
 const headers=new Headers(options.headers);
 let token=authenticated?await SecureStore.getItemAsync('vivablue_access_token'):null;
 if(authenticated&&!token)throw Error('Please sign in');
 if(token)headers.set('Authorization',`Bearer ${token}`);
 if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
 let resp=await fetch(base+path,{...options,headers});
 if(authenticated&&resp.status===401){
  token=await refreshToken();
  if(token){headers.set('Authorization',`Bearer ${token}`);resp=await fetch(base+path,{...options,headers})}
 }
 if(authenticated&&resp.status===401){
  await SecureStore.deleteItemAsync('vivablue_access_token');await SecureStore.deleteItemAsync('vivablue_refresh_token');
  throw Error('Session expired. Please sign in again');
 }
 const json=await resp.json().catch(()=>({}));
 if(!resp.ok)throw Error(json.message??`Request failed (${resp.status})`);
 return json as T;
}
export function publicApi<T>(path:string){return request<T>(path,{},false)}
export function api<T>(path:string,options:RequestInit={}){return request<T>(path,options,true)}
export function post<T>(path:string,data:unknown){return api<T>(path,{method:'POST',body:JSON.stringify(data)})}
export type SalonService={id:string,slug:string,name_en:string,name_es:string,description_en:string,
 description_es:string,duration_minutes:number|null,starting_price_cents:number|null,
 requires_consultation:boolean,is_bookable:boolean};
export type Stylist={id:string,display_name:string,bio:string|null,service_ids:string[]};
export type Appointment={id:string,start_at:string,end_at:string,status:string,
 name_en:string,name_es:string,stylist_name:string,quoted_price_cents:number|null};
