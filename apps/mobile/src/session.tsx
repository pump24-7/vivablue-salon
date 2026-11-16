import * as AuthSession from 'expo-auth-session';
import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import {clearSession,readSession,saveSession,sessionGeneration,sessionSnapshot,subscribeSession} from './auth-store';
const issuer=process.env.EXPO_PUBLIC_AUTH_ISSUER??'';
const clientId=process.env.EXPO_PUBLIC_AUTH_CLIENT_ID??'';
const audience=process.env.EXPO_PUBLIC_AUTH_AUDIENCE??'';
type Session={token:string|null,login:()=>Promise<void>,logout:()=>Promise<void>,ready:boolean,signingIn:boolean,identityVersion:number};
const Context=createContext<Session>({token:null,ready:false,signingIn:false,identityVersion:0,login:async()=>{},logout:async()=>{}});
export function useSession(){return useContext(Context)}
export function SessionProvider({children}:{children:React.ReactNode}){
 const [token,setToken]=useState<string|null>(null),[ready,setReady]=useState(false),[signingIn,setSigningIn]=useState(false);
 const [identityVersion,setIdentityVersion]=useState(sessionGeneration()),[error,setError]=useState('');
 const loggingIn=useRef(false);
 const discovery=AuthSession.useAutoDiscovery(issuer);
 const redirectUri=AuthSession.makeRedirectUri({scheme:'vivablue',path:'auth/callback'});
 const [request,,promptAsync]=AuthSession.useAuthRequest({clientId,redirectUri,responseType:AuthSession.ResponseType.Code,
  scopes:['openid','profile','email','offline_access'],usePKCE:true,prompt:AuthSession.Prompt.Login,extraParams:{audience}},discovery);
 useEffect(()=>{
  let active=true;
  const sync=()=>{if(active){setToken(sessionSnapshot()?.accessToken??null);setIdentityVersion(sessionGeneration())}};
  const unsubscribe=subscribeSession(sync);
  readSession().then(sync).catch(()=>{if(active)setError('Secure sign-in storage is unavailable. Restart the app to retry.')}).finally(()=>{if(active)setReady(true)});
  return()=>{active=false;unsubscribe()};
 },[]);
 const login=useCallback(async()=>{
  if(loggingIn.current)return;
  if(!issuer.startsWith('https://')||!clientId||!request?.codeVerifier||!discovery?.tokenEndpoint?.startsWith('https://'))throw Error('Secure sign-in is not configured yet. Please try again.');
  loggingIn.current=true;setSigningIn(true);
  try{
   await clearSession();const version=sessionGeneration();
   const result=await promptAsync();
   if(result.type==='cancel'||result.type==='dismiss')return;
   if(result.type!=='success'||!result.params.code)throw Error('Sign-in was not completed. Please try again.');
   const response=await AuthSession.exchangeCodeAsync({clientId,code:result.params.code,redirectUri,
    extraParams:{code_verifier:request.codeVerifier}},discovery);
   if(!response.accessToken)throw Error('Sign-in did not return an access token');
   await saveSession({accessToken:response.accessToken,refreshToken:response.refreshToken},version);
  }finally{loggingIn.current=false;setSigningIn(false)}
 },[request,discovery,promptAsync,redirectUri]);
 const logout=useCallback(async()=>{
  const saved=await readSession();await clearSession();
  if(saved?.refreshToken&&discovery?.revocationEndpoint?.startsWith('https://')){
   const revoked=await AuthSession.revokeAsync({clientId,token:saved.refreshToken,tokenTypeHint:AuthSession.TokenTypeHint.RefreshToken},discovery);
   if(!revoked)throw Error('Signed out on this device. The provider could not revoke the session; sign out from your account provider too.');
  }
 },[discovery]);
 const value=useMemo(()=>({token,login,logout,ready,signingIn,identityVersion}),[token,login,logout,ready,signingIn,identityVersion]);
 return <Context.Provider value={value}>{!ready?<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator/><Text>Viva Blue Salon…</Text></View>:
  error?<View><Text accessibilityRole="alert">{error}</Text></View>:children}</Context.Provider>;
}
