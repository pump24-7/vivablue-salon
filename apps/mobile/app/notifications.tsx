import React,{useState} from 'react';
import {Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {api,post,type CustomerNotification} from '../src/api';
import {useSession} from '../src/session';
import {useCustomerData} from '../src/customer-data';
import {dateTime,errorText,statusText,useLanguage} from '../src/language';
import {styles,theme} from '../src/theme';
import {EmptyState,PrimaryButton,SignInCard,TitleBar} from '../src/widgets';
const load=()=>api<{notifications:CustomerNotification[],unreadCount:number}>('/api/me/notifications');
export default function Notifications(){
 const {token}=useSession();const {lang}=useLanguage();const es=lang==='es';
 const {data,error,loading,refresh}=useCustomerData(load,30000);const [pending,setPending]=useState<string|null>(null);
 async function open(item:CustomerNotification){
  if(pending)return;setPending(item.id);
  try{await post('/api/me/notifications/'+item.id+'/read',{});await refresh();router.push('/bookings')}
  catch(e){Alert.alert('Viva Blue',errorText(e,lang))}finally{setPending(null)}
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title={es?'Actualizaciones de citas':'Appointment updates'} subtitle={es?'Solicitudes, confirmaciones y cancelaciones del salón.':'Requests, confirmations and cancellations from the salon.'}/>
  {!token?<SignInCard/>:<>
   <PrimaryButton label={es?'Actualizar':'Refresh'} disabled={loading} onPress={()=>void refresh()}/>
   {data?.notifications.length?data.notifications.map(n=><Pressable key={n.id} accessibilityRole="button" disabled={Boolean(pending)}
    accessibilityLabel={`${statusText(n.status,lang)} · ${es?n.name_es:n.name_en}`} onPress={()=>void open(n)} style={[styles.card,!n.read_at&&{borderColor:theme.blueDark}]}>
    {!n.read_at?<Text style={styles.overline}>{es?'NUEVA':'NEW'}</Text>:null}
    <Text style={styles.body}>{statusText(n.status,lang)} · {es?n.name_es:n.name_en}</Text>
    <Text style={styles.muted}>{n.stylist_name} · {dateTime(n.start_at,lang,n.timezone)}</Text>
    <Text style={styles.muted}>{es?'Actualización':'Updated'}: {dateTime(n.created_at,lang,n.timezone)}</Text>
    <Text style={styles.softButtonText}>{es?'Ver citas':'View appointments'} →</Text>
   </Pressable>):!loading?<EmptyState message={es?'Las actualizaciones de tus citas aparecerán aquí.':'Your appointment updates will appear here.'}/>:null}
  </>}
  {error?<Text accessibilityRole="alert" style={styles.muted}>{errorText(error,lang)}</Text>:null}
 </ScrollView>;
}
