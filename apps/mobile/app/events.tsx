import React,{useCallback,useEffect,useState} from 'react';
import {Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {api,post,publicApi} from '../src/api';
import {useSession} from '../src/session';
import {styles,theme} from '../src/theme';
import {TitleBar,EmptyState,PrimaryButton} from '../src/widgets';
type Event={id:string,title_en:string,title_es:string,description_en:string,description_es:string,starts_at:string,capacity:number,price_cents:number|null};
export default function Events(){
 const {token,login}=useSession();const [es,setEs]=useState(false),[events,setEvents]=useState<Event[]>([]),[mine,setMine]=useState<string[]>([]),[msg,setMsg]=useState('');
 const load=useCallback(async()=>{try{
  const ev=await publicApi<{events:Event[]}>('/api/events');setEvents(ev.events);
  if(token){const r=await api<{registrations:{id:string,status:string}[]}>('/api/me/events');setMine(r.registrations.filter(x=>x.status==='registered').map(x=>x.id))}
 }catch(e){setMsg(String(e))}},[token]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 async function join(event:Event){
  if(!token){await login();return}
  if(event.price_cents!==0){Alert.alert('Event booking','Paid events are not available for online checkout yet.');return}
  try{await post('/api/events/'+event.id+'/register',{seats:1});Alert.alert('Viva Blue Salon','Your free-event registration is confirmed.');await load()}
  catch(e){Alert.alert('Event registration',String(e))}
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <View style={styles.row}><Text style={styles.overline}>GATHER & GLOW ☆</Text><Pressable onPress={()=>setEs(x=>!x)}><Text style={styles.body}>{es?'English':'Español'}</Text></Pressable></View>
  <TitleBar title={es?'Momentos juntos':'Beautiful moments together'} subtitle={es?'Eventos, talleres y comunidad.':'Inspiration, workshops and salon community.'}/>
  {events.length===0?<EmptyState message={es?'Aún no hay eventos publicados.':'No salon events are currently published.'}/>:events.map(e=><View key={e.id} style={[styles.card,{padding:0,overflow:'hidden'}]}>
   <View style={{backgroundColor:theme.lilac,padding:22}}><Text style={[styles.brand,{fontSize:29}]}>{es?e.title_es:e.title_en}</Text><Text style={styles.overline}>✿ COMMUNITY EVENT</Text></View>
   <View style={{padding:18}}><Text style={styles.body}>{es?e.description_es:e.description_en}</Text><Text style={[styles.muted,{marginTop:11}]}>{new Date(e.starts_at).toLocaleString(es?'es-US':'en-US',{dateStyle:'long',timeStyle:'short',timeZone:'America/New_York'})} · {e.capacity} total seats</Text>
    <PrimaryButton label={e.price_cents===0?(es?'Registrar asistencia gratuita':'Register for free event'):(es?'Contactar salón para precio':'Contact salon for price')} disabled={e.price_cents!==0} onPress={()=>void join(e)}/></View>
  </View>)}
  {msg?<Text style={styles.muted}>{msg}</Text>:null}
 </ScrollView>;
}
