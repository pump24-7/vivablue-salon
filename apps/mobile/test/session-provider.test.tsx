import React from 'react';
import {Text} from 'react-native';
import {act,render,screen} from '@testing-library/react-native';
import {SessionProvider,useSession} from '../src/session';
import {clearSession,saveSession,sessionGeneration} from '../src/auth-store';
jest.mock('expo-auth-session',()=>({
 Prompt:{Login:'login'},ResponseType:{Code:'code'},TokenTypeHint:{RefreshToken:'refresh_token'},
 makeRedirectUri:()=> 'vivablue://auth/callback',useAutoDiscovery:()=>null,
 useAuthRequest:()=>[null,null,jest.fn()]
}));
function Probe(){const {token}=useSession();return <Text>{token??'Signed out'}</Text>}
test('the actual SessionProvider follows rotated and cleared secure-session state',async()=>{
 await clearSession();await saveSession({accessToken:'original'},sessionGeneration());
 render(<SessionProvider><Probe/></SessionProvider>);await screen.findByText('original');
 await act(async()=>{await saveSession({accessToken:'rotated'},sessionGeneration())});
 expect(screen.getByText('rotated')).toBeTruthy();
 await act(async()=>{await clearSession()});expect(screen.getByText('Signed out')).toBeTruthy();
});
