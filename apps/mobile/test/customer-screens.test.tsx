import React from 'react';
import {Alert} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {router} from 'expo-router';
import {api,post,publicApi} from '../src/api';
import Service from '../app/service';
import Profile from '../app/profile';
import Favorites from '../app/favorites';
import Bookings from '../app/bookings';
import Notifications from '../app/notifications';
import MyViva from '../app/my-viva';
import Lookbook from '../app/lookbook';
import Events from '../app/events';

let mockLanguage:'en'|'es'='en';
let mockSession={token:'customer-token' as string|null,identityVersion:0,login:jest.fn(),logout:jest.fn(),ready:true,signingIn:false};
jest.mock('../src/session',()=>({useSession:()=>mockSession}));
jest.mock('../src/language',()=>({...jest.requireActual('../src/language'),useLanguage:()=>({lang:mockLanguage,setLanguage:jest.fn()})}));
jest.mock('../src/api',()=>({...jest.requireActual('../src/api'),api:jest.fn(),publicApi:jest.fn(),post:jest.fn()}));
jest.mock('expo-crypto',()=>({randomUUID:jest.fn(()=> 'test-idempotency-key')}));
const profile={id:'customer-1',display_name:'Test Customer',preferred_language:'en',role:'customer'};
const look={id:'look-1',image_url:'https://example.invalid/approved.png',caption_en:'Saved style',caption_es:'Estilo guardado'};
const appointment={id:'booking-1',start_at:'2030-02-04T15:00:00Z',end_at:'2030-02-04T16:00:00Z',status:'confirmed',
 timezone:'America/New_York',name_en:'Haircut',name_es:'Corte',stylist_name:'Test Stylist',quoted_price_cents:6000,selected_modifiers:[],price_breakdown:{serviceMinutes:60}};
const service={id:'service-1',slug:'haircut',name_en:'Haircut',name_es:'Corte',description_en:'Test service',description_es:'Servicio de prueba',
 duration_minutes:45,starting_price_cents:5000,requires_consultation:true,is_bookable:true};
const policy={cancellation_en:'Test cancellation policy',cancellation_es:'Política de prueba',service_consent_en:'Test consent',
 service_consent_es:'Consentimiento',privacy_url:'https://example.invalid/privacy',effective_at:'2026-01-01T00:00:00Z'};
const quote={serviceMinutes:60,occupiedMinutes:75,baseCents:5000,modifierCents:500,peakCents:500,totalCents:6000,timezone:'America/New_York'};
beforeEach(()=>{
 mockLanguage='en';mockSession={token:'customer-token',identityVersion:0,login:jest.fn(),logout:jest.fn(),ready:true,signingIn:false};
 jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 (api as jest.Mock).mockImplementation(async(path:string,options?:RequestInit)=>{
  if(path==='/api/me')return {user:options?.body?{...profile,display_name:JSON.parse(String(options.body)).displayName??profile.display_name}:profile};
  if(path==='/api/bookings')return {appointments:[appointment]};
  if(path==='/api/me/favorites')return {looks:[look]};
  if(path==='/api/me/events')return {registrations:[{id:'registration-1',event_id:'event-1',status:'registered'}]};
  if(path==='/api/me/notifications')return {unreadCount:1,notifications:[{...appointment,id:'notice-1',appointment_id:appointment.id,created_at:'2026-11-15T10:00:00Z',read_at:null}]};
  return {};
 });
 (publicApi as jest.Mock).mockImplementation(async(path:string)=>{
  if(path==='/api/catalog')return {services:[service]};
  if(path==='/api/lookbook')return {looks:[look]};
  if(path==='/api/events')return {events:[{id:'event-1',title_en:'Free test event',title_es:'Evento de prueba',description_en:'Test',description_es:'Prueba',starts_at:appointment.start_at,capacity:5,price_cents:0}]};
  if(path.startsWith('/api/stylists'))return {stylists:[{id:'stylist-1',display_name:'Test Stylist',bio:'Qualified for this service'}]};
  if(path.startsWith('/api/booking-options'))return {modifiers:[{id:'modifier-1',label_en:'Extra time',label_es:'Tiempo adicional',additional_minutes:15,additional_price_cents:500}]};
  if(path==='/api/policies')return {policies:policy};
  if(path.startsWith('/api/availability'))return {slots:['2030-02-04T15:00:00Z'],timezone:'America/New_York',reason:null};
  if(path.startsWith('/api/booking-quote'))return {quote};
  throw Error('Unexpected test route: '+path);
 });
 (post as jest.Mock).mockResolvedValue({});
});
afterEach(()=>jest.restoreAllMocks());

test('service journey requires consent, shows the server quote and reuses its key after a lost response',async()=>{
 render(<Service/>);
 fireEvent.press(await screen.findByRole('radio',{name:/Test Stylist/}));
 fireEvent.press(screen.getByRole('checkbox',{name:/Extra time/}));
 fireEvent.press(screen.getByRole('button',{name:'Find available times'}));
 fireEvent.press(await screen.findByRole('radio',{name:'10:00 AM'}));
 await waitFor(()=>expect(screen.getAllByText(/Salon estimate/).length).toBe(1));
 expect(screen.getByRole('button',{name:'Request appointment'})).toBeDisabled();
 fireEvent.press(screen.getByRole('checkbox',{name:/I understand/}));
 fireEvent.press(screen.getByRole('checkbox',{name:/I have read/}));
 expect(screen.getByRole('button',{name:'Request appointment'})).toBeEnabled();
 (post as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce({appointment:{id:'booking-1'}});
 fireEvent.press(screen.getByRole('button',{name:'Request appointment'}));
 await screen.findByText('Network request failed');
 fireEvent.press(screen.getByRole('button',{name:'Request appointment'}));
 await waitFor(()=>expect(router.replace).toHaveBeenCalledWith('/bookings'));
 const bodies=(post as jest.Mock).mock.calls.map(c=>c[1]);
 expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);
 expect(bodies[0]).toMatchObject({expectedTotalCents:6000,modifierIds:['modifier-1'],policyEffectiveAt:policy.effective_at,consultationAck:true,policyAccepted:true});
});
test('an old availability response is discarded when modifiers change',async()=>{
 let resolve!:(result:unknown)=>void;
 const original=(publicApi as jest.Mock).getMockImplementation()!;
 (publicApi as jest.Mock).mockImplementation((path:string)=>path.startsWith('/api/availability')?new Promise(r=>{resolve=r}):original(path));
 render(<Service/>);fireEvent.press(await screen.findByRole('radio',{name:/Test Stylist/}));
 fireEvent.press(screen.getByRole('button',{name:'Find available times'}));
 fireEvent.press(screen.getByRole('checkbox',{name:/Extra time/}));
 await act(async()=>resolve({slots:['2030-02-04T15:00:00Z'],timezone:'America/New_York',reason:null}));
 expect(screen.queryByRole('radio',{name:'10:00 AM'})).toBeNull();
});
test('profile editing validates a name and submits only permitted profile fields',async()=>{
 render(<Profile/>);await screen.findByDisplayValue('Test Customer');
 fireEvent.changeText(screen.getByLabelText('Name'),'  ');
 expect(screen.getByRole('button',{name:'Save profile'})).toBeDisabled();
 fireEvent.changeText(screen.getByLabelText('Name'),'Updated Customer');
 fireEvent.press(screen.getByRole('button',{name:'Save profile'}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/me',{method:'PATCH',body:JSON.stringify({displayName:'Updated Customer',preferredLanguage:'en'})}));
 await waitFor(()=>expect(Alert.alert).toHaveBeenCalledWith('Viva Blue','Profile saved.'));
});
test('saved-look removal reports a failure and leaves the saved item visible',async()=>{
 const original=(api as jest.Mock).getMockImplementation()!;
 (api as jest.Mock).mockImplementation((path:string,options?:RequestInit)=>options?.method==='DELETE'?Promise.reject(Error('Please retry')):original(path,options));
 render(<Favorites/>);fireEvent.press(await screen.findByRole('button',{name:'Remove favorite'}));
 await waitFor(()=>expect(Alert.alert).toHaveBeenCalledWith('Viva Blue','Please retry'));
 expect(screen.getByText('Saved style')).toBeTruthy();
});
test('appointment data disappears on sign-out and Spanish status copy renders',async()=>{
 mockLanguage='es';const view=render(<Bookings/>);
 await screen.findByText('Confirmada');expect(screen.getByText(/Corte · Test Stylist/)).toBeTruthy();
 mockSession={...mockSession,token:null,identityVersion:1};view.rerender(<Bookings/>);
 expect(screen.queryByText(/Corte · Test Stylist/)).toBeNull();
 expect(screen.getByRole('button',{name:'Entrar o crear cuenta'})).toBeTruthy();
});
test('opening an inbox update marks only that notification read and opens appointments',async()=>{
 render(<Notifications/>);fireEvent.press(await screen.findByRole('button',{name:'Confirmed · Haircut'}));
 await waitFor(()=>expect(post).toHaveBeenCalledWith('/api/me/notifications/notice-1/read',{}));
 await waitFor(()=>expect(router.push).toHaveBeenCalledWith('/bookings'));
});
test('My Viva counts future active appointments and links to profile, saved looks and updates',async()=>{
 render(<MyViva/>);await screen.findByText('Test Customer');
 expect(screen.getByText('♥ 1 saved looks')).toBeTruthy();expect(screen.getByText('◷ 1 upcoming')).toBeTruthy();
 fireEvent.press(screen.getByRole('button',{name:/My profile/}));expect(router.push).toHaveBeenCalledWith('/profile');
 fireEvent.press(screen.getByRole('button',{name:/Appointment updates/}));expect(router.push).toHaveBeenCalledWith('/notifications');
});
test('lookbook save/remove controls reflect the signed-in customer and reset on sign-out',async()=>{
 const view=render(<Lookbook/>);
 fireEvent.press(await screen.findByRole('button',{name:'Remove favorite'}));
 await screen.findByRole('button',{name:'Save favorite'});
 expect(api).toHaveBeenCalledWith('/api/me/favorites/look-1',{method:'DELETE'});
 fireEvent.press(screen.getByRole('button',{name:'Save favorite'}));
 await screen.findByRole('button',{name:'Remove favorite'});
 expect(api).toHaveBeenCalledWith('/api/me/favorites/look-1',{method:'PUT'});
 mockSession={...mockSession,token:null,identityVersion:2};view.rerender(<Lookbook/>);
 await screen.findByRole('button',{name:'Save favorite'});
 expect(screen.queryByRole('button',{name:'Remove favorite'})).toBeNull();
});
test('events recognize the event ID on an existing registration and prevent duplicate enrollment',async()=>{
 render(<Events/>);
 expect(await screen.findByRole('button',{name:'Already registered'})).toBeDisabled();
 expect(post).not.toHaveBeenCalled();
});
