import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import * as SecureStore from 'expo-secure-store';
import {api,ApiError,type Profile} from './api';
import {useSession} from './session';
export type Language='en'|'es';
const Context=createContext({lang:'en' as Language,setLanguage:async(_lang:Language)=>{}});
export const useLanguage=()=>useContext(Context);
export function LanguageProvider({children}:{children:React.ReactNode}){
 const {token,identityVersion}=useSession();const authenticated=Boolean(token);
 const [lang,setLang]=useState<Language>('en');
 const changes=useRef(0);
 useEffect(()=>{
  let active=true;const version=++changes.current;
  (async()=>{
   const saved=await SecureStore.getItemAsync('vivablue_language');
   if(active&&version===changes.current&&(saved==='en'||saved==='es'))setLang(saved);
   if(authenticated){const {user}=await api<{user:Profile}>('/api/me');if(active&&version===changes.current)setLang(user.preferred_language)}
  })().catch(()=>{});
  return()=>{active=false};
 },[authenticated,identityVersion]);
 const setLanguage=useCallback(async(next:Language)=>{
  const version=++changes.current;
  if(authenticated)await api('/api/me',{method:'PATCH',body:JSON.stringify({preferredLanguage:next})});
  if(version!==changes.current)return;
  await SecureStore.setItemAsync('vivablue_language',next);if(version===changes.current)setLang(next);
 },[authenticated,identityVersion]);
 const value=useMemo(()=>({lang,setLanguage}),[lang,setLanguage]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function errorText(error:unknown,lang:Language){
 if(lang==='en')return error instanceof Error?error.message:'Please try again.';
 if(error instanceof ApiError){
  if(error.status===401)return 'Tu sesión terminó. Vuelve a iniciar sesión.';
  if(error.status===403)return 'No tienes permiso para realizar esta acción.';
  if(error.status===404)return 'Esta opción ya no está disponible. Actualiza e inténtalo de nuevo.';
  if(error.status===409)return 'La disponibilidad, el precio o las políticas cambiaron. Actualiza y revisa tu selección.';
  if(error.status===400)return 'Revisa los datos e inténtalo de nuevo.';
 }
 return 'No se pudo completar la solicitud. Revisa tu conexión e inténtalo de nuevo.';
}
const statuses:Record<string,[string,string]>={requested:['Requested','Solicitada'],confirmed:['Confirmed','Confirmada'],
 declined:['Declined','Rechazada'],cancel_requested:['Cancellation requested','Cancelación solicitada'],
 cancelled:['Cancelled','Cancelada'],completed:['Completed','Completada'],in_progress:['In progress','En curso']};
export function statusText(status:string,lang:Language){return statuses[status]?.[lang==='es'?1:0]??status}
export const dateTime=(value:string,lang:Language,zone='America/New_York')=>new Date(value).toLocaleString(lang==='es'?'es-US':'en-US',
 {dateStyle:'medium',timeStyle:'short',timeZone:zone});
export const money=(value:number,lang:Language)=>new Intl.NumberFormat(lang==='es'?'es-US':'en-US',{style:'currency',currency:'USD'}).format(value/100);
