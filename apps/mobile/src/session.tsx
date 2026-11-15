import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';

const issuer=process.env.EXPO_PUBLIC_AUTH_ISSUER??'';
const clientId=process.env.EXPO_PUBLIC_AUTH_CLIENT_ID??'';
const audience=process.env.EXPO_PUBLIC_AUTH_AUDIENCE??'';
type Session={token:string|null,login:()=>Promise<void>,logout:()=>Promise<void>,ready:boolean};
const Context=createContext<Session>({token:null,ready:false,login:async()=>{},logout:async()=>{}});
export function useSession(){return useContext(Context)}
export function SessionProvider({children}:{children:React.ReactNode}){
 const [token,setToken]=useState<string|null>(null),[ready,setReady]=useState(false);
 const discovery=AuthSession.useAutoDiscovery(issuer);
 const redirectUri=AuthSession.makeRedirectUri({scheme:'vivablue',path:'auth/callback'});
 const [request,,promptAsync]=AuthSession.useAuthRequest({clientId,redirectUri,responseType:AuthSession.ResponseType.Code,scopes:['openid','profile','email','offline_access'],usePKCE:true,extraParams:{audience}},discovery);
 useEffect(()=>{SecureStore.getItemAsync('vivablue_access_token').then(setToken).finally(()=>setReady(true))},[]);
 const login=useCallback(async()=>{
  if(!request||!discovery)throw Error('OIDC not configured');
  const result=await promptAsync();if(result.type!=='success'||!result.params.code)return;
  const resp=await AuthSession.exchangeCodeAsync({clientId,code:result.params.code,redirectUri,extraParams:{code_verifier:request.codeVerifier??''}},discovery);
  await SecureStore.setItemAsync('vivablue_access_token',resp.accessToken);setToken(resp.accessToken);
  if(resp.refreshToken)await SecureStore.setItemAsync('vivablue_refresh_token',resp.refreshToken);
 },[request,discovery,promptAsync,redirectUri]);
 const logout=useCallback(async()=>{await SecureStore.deleteItemAsync('vivablue_access_token');await SecureStore.deleteItemAsync('vivablue_refresh_token');setToken(null)},[]);
 // Access token refresh is done on 401 in api.ts and kept in SecureStore; a real release
 // must test provider-specific refresh rotation and session revocation end-to-end.
 const value=useMemo(()=>({token,login,logout,ready}),[token,login,logout,ready]);
 return <Context.Provider value={value}>{ready?children:<View style={{flex:1,justifyContent:'center'}}><ActivityIndicator/><Text>Starting vivablue…</Text></View>}</Context.Provider>
}
