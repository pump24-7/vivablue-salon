import {api} from '../src/api';
import {clearSession,readSession,saveSession,sessionGeneration,subscribeSession} from '../src/auth-store';
import * as SecureStore from 'expo-secure-store';

const reply=(status:number,body:unknown)=>({status,ok:status>=200&&status<300,json:async()=>body}) as Response;
const discovery={issuer:'https://identity.example.invalid',token_endpoint:'https://identity.example.invalid/token'};
beforeEach(async()=>{await clearSession();await saveSession({accessToken:'old-access',refreshToken:'old-refresh'},sessionGeneration());global.fetch=jest.fn()});
afterEach(async()=>{await clearSession()});
test('concurrent 401s share a single refresh, rotate the pair and notify the session UI',async()=>{
 const listener=jest.fn(),unsubscribe=subscribeSession(listener);let rotations=0;
 (fetch as jest.Mock).mockImplementation(async(url:string,options:RequestInit)=>{
  if(url.endsWith('openid-configuration'))return reply(200,discovery);
  if(url.endsWith('/token')){rotations++;return reply(200,{access_token:'new-access',refresh_token:'new-refresh'})}
  return new Headers(options.headers).get('Authorization')==='Bearer new-access'?reply(200,{ok:true}):reply(401,{});
 });
 await expect(Promise.all([api('/one'),api('/two')])).resolves.toEqual([{ok:true},{ok:true}]);
 expect(rotations).toBe(1);expect(await readSession()).toEqual({accessToken:'new-access',refreshToken:'new-refresh'});
 expect(JSON.parse((await SecureStore.getItemAsync('vivablue_session'))!)).toEqual(await readSession());
 expect(listener).toHaveBeenCalled();unsubscribe();
});
test('a temporary provider failure retains the session for retry',async()=>{
 (fetch as jest.Mock).mockImplementation(async(url:string)=>url.endsWith('openid-configuration')?reply(503,{}):reply(401,{}));
 await expect(api('/me')).rejects.toMatchObject({status:503});
 expect((await readSession())?.refreshToken).toBe('old-refresh');
});
test('provider rejection clears the UI and both token generations',async()=>{
 const listener=jest.fn(),unsubscribe=subscribeSession(listener);
 (fetch as jest.Mock).mockImplementation(async(url:string)=>url.endsWith('openid-configuration')?reply(200,discovery):
  url.endsWith('/token')?reply(400,{error:'invalid_grant'}):reply(401,{}));
 await expect(api('/me')).rejects.toMatchObject({status:401});
 expect(await readSession()).toBeNull();expect(await SecureStore.getItemAsync('vivablue_session')).toBeNull();
 expect(listener).toHaveBeenCalled();unsubscribe();
});
test('a late refresh cannot restore a signed-out account or overwrite a new account',async()=>{
 let resolveRefresh!:(response:Response)=>void,started!:()=>void;
 const waiting=new Promise<void>(resolve=>{started=resolve});
 (fetch as jest.Mock).mockImplementation(async(url:string)=>{
  if(url.endsWith('openid-configuration'))return reply(200,discovery);
  if(url.endsWith('/token')){started();return new Promise<Response>(resolve=>{resolveRefresh=resolve})}
  return reply(401,{});
 });
 const result=api('/me');const rejected=expect(result).rejects.toMatchObject({status:401});
 await waiting;await clearSession();await saveSession({accessToken:'different-customer'},sessionGeneration());
 resolveRefresh(reply(200,{access_token:'late-old-customer',refresh_token:'late-refresh'}));await rejected;
 expect((await readSession())?.accessToken).toBe('different-customer');
});
test('a delayed response body from a previous account is discarded',async()=>{
 let resolveBody!:(body:unknown)=>void,started!:()=>void;
 const waiting=new Promise<void>(resolve=>{started=resolve});
 (fetch as jest.Mock).mockResolvedValue({status:200,ok:true,json:()=>{started();return new Promise(resolve=>{resolveBody=resolve})}});
 const result=api('/private');const rejected=expect(result).rejects.toMatchObject({status:401});
 await waiting;await clearSession();resolveBody({private:'previous customer'});await rejected;
});
