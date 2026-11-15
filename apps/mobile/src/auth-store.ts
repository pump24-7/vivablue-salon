import * as SecureStore from 'expo-secure-store';
export type Tokens={accessToken:string,refreshToken?:string};
const key='vivablue_session';
let current:Tokens|null|undefined;
let generation=0;
let loading:Promise<Tokens|null>|null=null;
let writes:Promise<unknown>=Promise.resolve();
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
export const sessionGeneration=()=>generation;
export const sessionSnapshot=()=>current??null;
export function subscribeSession(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
function serialize<T>(action:()=>Promise<T>):Promise<T>{
 const result=writes.then(action,action);writes=result.catch(()=>{});return result;
}
export async function readSession():Promise<Tokens|null>{
 if(current!==undefined)return current;
 if(loading)return loading;
 const version=generation;
 loading=(async()=>{
  const raw=await SecureStore.getItemAsync(key);
  let value:Tokens|null=null;
  if(raw){
   try{const parsed=JSON.parse(raw);if(typeof parsed.accessToken==='string'&&parsed.accessToken&&
    (parsed.refreshToken===undefined||typeof parsed.refreshToken==='string'))value=parsed}catch{}
  }else{
   // Adopt the old keys once; one atomic record keeps rotated token pairs together.
   const accessToken=await SecureStore.getItemAsync('vivablue_access_token');
   const refreshToken=await SecureStore.getItemAsync('vivablue_refresh_token');
   if(accessToken)value={accessToken,...(refreshToken?{refreshToken}:{})};
  }
  if(version!==generation)return current??null;
  if(value)await saveSession(value,version);
  else{current=null;notify()}
  return current??null;
 })().finally(()=>{loading=null});
 return loading;
}
export async function saveSession(value:Tokens,version:number){
 return serialize(async()=>{
  if(version!==generation)return false;
  await SecureStore.setItemAsync(key,JSON.stringify(value));
  if(version!==generation)return false;
  current=value;notify();
  await Promise.all(['vivablue_access_token','vivablue_refresh_token'].map(k=>SecureStore.deleteItemAsync(k)));
  return true;
 });
}
export async function clearSession(version=generation){
 if(version!==generation)return;
 generation++;current=null;notify();
 await serialize(async()=>{
  await Promise.all([key,'vivablue_access_token','vivablue_refresh_token'].map(k=>SecureStore.deleteItemAsync(k)));
 });
}
