beforeEach(()=>jest.resetModules());
test('cold start adopts legacy SecureStore tokens into one record and removes old keys',async()=>{
 const storage=require('expo-secure-store') as typeof import('expo-secure-store');
 await storage.setItemAsync('vivablue_access_token','legacy-access');
 await storage.setItemAsync('vivablue_refresh_token','legacy-refresh');
 const session=require('../src/auth-store') as typeof import('../src/auth-store');
 expect(await session.readSession()).toEqual({accessToken:'legacy-access',refreshToken:'legacy-refresh'});
 expect(JSON.parse((await storage.getItemAsync('vivablue_session'))!)).toEqual(await session.readSession());
 expect(await storage.getItemAsync('vivablue_access_token')).toBeNull();
 expect(await storage.getItemAsync('vivablue_refresh_token')).toBeNull();
});
test('cold start restores the current atomic session record',async()=>{
 const storage=require('expo-secure-store') as typeof import('expo-secure-store');
 await storage.setItemAsync('vivablue_session',JSON.stringify({accessToken:'stored-access',refreshToken:'stored-refresh'}));
 const session=require('../src/auth-store') as typeof import('../src/auth-store');
 expect(await session.readSession()).toEqual({accessToken:'stored-access',refreshToken:'stored-refresh'});
});
