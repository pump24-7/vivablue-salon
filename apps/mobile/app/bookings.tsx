import React,{useCallback,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {api,post,type Appointment} from '../src/api';
import {useSession} from '../src/session';
import {styles} from '../src/theme';
import {TitleBar} from '../src/widgets';
export default function Bookings(){
 const {token,login}=useSession();const [items,setItems]=useState<Appointment[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=useCallback(async()=>{
  if(!token)return;
  setBusy(true);try{const x=await api<{appointments:Appointment[]}>('/api/bookings');setItems(x.appointments)}
  catch(e){setMessage(String(e))}finally{setBusy(false)}
 },[token]);
 useFocusEffect(useCallback(()=>{load().catch(()=>{})},[load]));
 async function cancel(id:string){
  try{await post('/api/bookings/'+id+'/cancel-request',{});await load();Alert.alert('Request sent','Salon management will review your cancellation request.');}
  catch(e){setMessage(String(e))}
 }
 if(!token)return <View style={[styles.screen,styles.content]}><Text style={styles.heading}>My appointments</Text><Pressable style={styles.button} onPress={()=>login()}><Text style={styles.buttonText}>Sign in</Text></Pressable></View>;
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title="My appointments" subtitle="A requested time is not confirmed until the salon approves it."/>
  <Text style={styles.muted}>A requested time is not confirmed until the salon approves it.</Text>
  {busy?<ActivityIndicator/>:items.length===0?<Text style={styles.muted}>No appointments yet.</Text>:items.map(a=><View key={a.id} style={styles.card}>
   <Text style={styles.body}>{a.name_en} · {a.stylist_name}</Text>
   <Text style={styles.muted}>{new Date(a.start_at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'})}</Text>
   <Text style={styles.muted}>Status: {a.status}</Text>
   {['requested','confirmed'].includes(a.status)?<Pressable style={styles.softButton} onPress={()=>cancel(a.id)}><Text style={styles.softButtonText}>Request cancellation</Text></Pressable>:null}
  </View>)}
  {!!message?<Text style={styles.muted}>{message}</Text>:null}
 </ScrollView>;
}
