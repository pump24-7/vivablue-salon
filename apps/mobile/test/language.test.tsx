import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import {api} from '../src/api';
import {LanguageProvider,useLanguage} from '../src/language';
jest.mock('../src/session',()=>({useSession:()=>({token:'customer',identityVersion:1})}));
jest.mock('../src/api',()=>({...jest.requireActual('../src/api'),api:jest.fn()}));
function Probe({name}:{name:string}){
 const {lang,setLanguage}=useLanguage();return <View><Text>{name+':'+lang}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={()=>void setLanguage('es')}><Text>Español</Text></Pressable></View>;
}
test('the shared language provider updates every screen and persists account/device preference',async()=>{
 await SecureStore.deleteItemAsync('vivablue_language');
 (api as jest.Mock).mockResolvedValue({user:{preferred_language:'en'}});
 render(<LanguageProvider><Probe name="home"/><Probe name="appointments"/></LanguageProvider>);
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/me'));
 fireEvent.press(screen.getByRole('button',{name:'home'}));
 await screen.findByText('home:es');expect(screen.getByText('appointments:es')).toBeTruthy();
 expect(api).toHaveBeenCalledWith('/api/me',{method:'PATCH',body:JSON.stringify({preferredLanguage:'es'})});
 expect(await SecureStore.getItemAsync('vivablue_language')).toBe('es');
});
test('a slow initial profile response cannot override a newer language choice',async()=>{
 let resolve!:(result:unknown)=>void;
 (api as jest.Mock).mockImplementation((_path:string,options?:RequestInit)=>options?.method==='PATCH'?Promise.resolve({}):new Promise(r=>{resolve=r}));
 render(<LanguageProvider><Probe name="home"/></LanguageProvider>);
 await waitFor(()=>expect(resolve).toBeDefined());
 fireEvent.press(screen.getByRole('button',{name:'home'}));await screen.findByText('home:es');
 await act(async()=>resolve({user:{preferred_language:'en'}}));
 expect(screen.getByText('home:es')).toBeTruthy();
});
