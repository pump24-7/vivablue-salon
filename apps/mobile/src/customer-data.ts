import {useCallback,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSession} from './session';

// Discard stale responses on blur, sign-out and account changes; refresh on foreground.
export function useCustomerData<T>(loader:()=>Promise<T>,pollMilliseconds=0){
 const {token,identityVersion}=useSession();const authenticated=Boolean(token);
 const [result,setResult]=useState<{identity:number,data:T}|null>(null);
 const [error,setError]=useState<unknown>(null),[loading,setLoading]=useState(false);
 const sequence=useRef(0),focused=useRef(false);
 const refresh=useCallback(async()=>{
  const id=++sequence.current;
  if(!authenticated){setResult(null);setError(null);setLoading(false);return}
  setLoading(true);setError(null);
  try{const data=await loader();if(focused.current&&id===sequence.current)setResult({identity:identityVersion,data})}
  catch(e){if(focused.current&&id===sequence.current)setError(e)}
  finally{if(focused.current&&id===sequence.current)setLoading(false)}
 },[loader,authenticated,identityVersion]);
 useFocusEffect(useCallback(()=>{
  focused.current=true;void refresh();
  const listener=AppState.addEventListener('change',state=>{if(state==='active')void refresh()});
  const timer=pollMilliseconds?setInterval(()=>{if(AppState.currentState==='active')void refresh()},pollMilliseconds):null;
  return()=>{focused.current=false;sequence.current++;listener.remove();if(timer)clearInterval(timer)};
 },[refresh,pollMilliseconds]));
 return {data:authenticated&&result?.identity===identityVersion?result.data:undefined,error:authenticated?error:null,loading,refresh};
}
