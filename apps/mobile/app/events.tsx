import React,{useCallback,useRef,useState} from 'react';
import {Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {api,post,publicApi} from '../src/api';
import {useSession} from '../src/session';
import {errorText,useLanguage} from '../src/language';
import {styles,theme} from '../src/theme';
import {TitleBar,EmptyState,PrimaryButton,LanguageToggle} from '../src/widgets';
type Event={id:string,title_en:string,title_es:string,description_en:string,description_es:string,starts_at:string,capacity:number,price_cents:number|null};
export default function Events(){
 const {token,login,identityVersion}=useSession();const {lang}=useLanguage();const es=lang==='es';
 const [joining,setJoining]=useState<string|null>(null);const [events,setEvents]=useState<Event[]>([]),[mine,setMine]=useState<string[]>([]),[msg,setMsg]=useState('');
 const sequence=useRef(0),owner=useRef(identityVersion);
 const registered=token&&owner.current===identityVersion?mine:[];
 const load=useCallback(async()=>{
  const run=++sequence.current;setMine([]);owner.current=identityVersion;setMsg('');
  try{
   const ev=await publicApi<{events:Event[]}>('/api/events');if(run!==sequence.current)return;setEvents(ev.events);
   if(token){const r=await api<{registrations:{id:string,event_id:string,status:string}[]}>('/api/me/events');
    if(run===sequence.current)setMine(r.registrations.filter(x=>x.status==='registered').map(x=>x.event_id))}
  }catch(e){if(run===sequence.current)setMsg(errorText(e,lang))}
 },[token,identityVersion,lang]);
 useFocusEffect(useCallback(()=>{void load();return()=>{sequence.current++}},[load]));
 async function join(event:Event){
  if(joining)return;
  if(!token){await login().catch(e=>Alert.alert('Viva Blue',errorText(e,lang)));return}
  if(event.price_cents!==0){Alert.alert('Viva Blue',es?'Los eventos de pago aún no admiten compra en línea.':'Paid events are not available for online checkout yet.');return}
  setJoining(event.id);try{await post('/api/events/'+event.id+'/register',{seats:1});Alert.alert('Viva Blue Salon',es?'Tu registro al evento gratuito está confirmado.':'Your free-event registration is confirmed.');await load()}
  catch(e){Alert.alert('Viva Blue',errorText(e,lang))}finally{setJoining(null)}
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <View style={styles.row}><Text style={styles.overline}>{es?'JUNTOS BRILLAMOS ☆':'GATHER & GLOW ☆'}</Text><LanguageToggle/></View>
  <TitleBar languageSwitch={false} title={es?'Momentos juntos':'Beautiful moments together'} subtitle={es?'Eventos, talleres y comunidad.':'Inspiration, workshops and salon community.'}/>
  {events.length===0?<EmptyState message={es?'Aún no hay eventos publicados.':'No salon events are currently published.'}/>:events.map(e=><View key={e.id} style={[styles.card,{padding:0,overflow:'hidden'}]}>
   <View style={{backgroundColor:theme.lilac,padding:22}}><Text style={[styles.brand,{fontSize:29}]}>{es?e.title_es:e.title_en}</Text><Text style={styles.overline}>✿ {es?'EVENTO DE COMUNIDAD':'COMMUNITY EVENT'}</Text></View>
   <View style={{padding:18}}><Text style={styles.body}>{es?e.description_es:e.description_en}</Text><Text style={[styles.muted,{marginTop:11}]}>{new Date(e.starts_at).toLocaleString(es?'es-US':'en-US',{dateStyle:'long',timeStyle:'short',timeZone:'America/New_York'})} · {e.capacity} {es?'plazas en total':'total seats'}</Text>
    <PrimaryButton label={registered.includes(e.id)?(es?'Ya estás registrado':'Already registered'):e.price_cents===0?(es?'Registrar asistencia gratuita':'Register for free event'):(es?'Contactar salón para precio':'Contact salon for price')} disabled={e.price_cents!==0||registered.includes(e.id)||Boolean(joining)} onPress={()=>void join(e)}/></View>
  </View>)}
  {msg?<Text style={styles.muted}>{msg}</Text>:null}
 </ScrollView>;
}
