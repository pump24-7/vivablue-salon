import React,{useState} from 'react';
import {ActivityIndicator,Alert,ScrollView,Text,View} from 'react-native';
import {api,post,type Appointment} from '../src/api';
import {useSession} from '../src/session';
import {useCustomerData} from '../src/customer-data';
import {dateTime,errorText,money,statusText,useLanguage} from '../src/language';
import {styles} from '../src/theme';
import {PrimaryButton,SignInCard,TitleBar} from '../src/widgets';
const load=()=>api<{appointments:Appointment[]}>('/api/bookings');
export default function Bookings(){
 const {token}=useSession();const {lang}=useLanguage();const es=lang==='es';
 const {data,error,loading,refresh}=useCustomerData(load,30000);const [pending,setPending]=useState<string|null>(null);
 async function cancel(id:string){
  if(pending)return;setPending(id);
  try{await post('/api/bookings/'+id+'/cancel-request',{});await refresh();
   Alert.alert(es?'Solicitud enviada':'Request sent',es?'El salón revisará tu solicitud de cancelación.':'Salon management will review your cancellation request.');
  }catch(e){Alert.alert('Viva Blue',errorText(e,lang))}finally{setPending(null)}
 }
 const items=data?.appointments??[];
 const upcoming=items.filter(a=>Date.parse(a.start_at)>Date.now()&&['requested','confirmed','in_progress','cancel_requested'].includes(a.status));
 const history=items.filter(a=>!upcoming.includes(a));
 const card=(a:Appointment)=><View key={a.id} style={styles.card}>
  <Text style={styles.body}>{es?a.name_es:a.name_en} · {a.stylist_name}</Text>
  <Text style={styles.muted}>{dateTime(a.start_at,lang,a.timezone)} · {a.timezone}</Text>
  <Text style={styles.body}>{statusText(a.status,lang)}</Text>
  {a.price_breakdown?.serviceMinutes?<Text style={styles.muted}>{a.price_breakdown.serviceMinutes} min</Text>:null}
  <Text style={styles.muted}>{es?'Estimación':'Estimate'}: {a.quoted_price_cents==null?(es?'Tras consulta':'After consultation'):money(a.quoted_price_cents,lang)}</Text>
  {a.selected_modifiers?.map(m=><Text key={m.id} style={styles.muted}>{es?m.label_es:m.label_en}</Text>)}
  {Date.parse(a.start_at)>Date.now()&&['requested','confirmed'].includes(a.status)?<PrimaryButton disabled={Boolean(pending)}
   label={es?'Solicitar cancelación':'Request cancellation'} onPress={()=>Alert.alert(es?'¿Solicitar cancelación?':'Request cancellation?',
    es?'La cita sigue reservada hasta que el salón la cancele.':'The appointment stays reserved until the salon cancels it.',[
     {text:es?'Volver':'Go back',style:'cancel'},{text:es?'Enviar solicitud':'Send request',onPress:()=>void cancel(a.id)}])}/>:null}
 </View>;
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title={es?'Mis citas':'My appointments'} subtitle={es?'El horario no está confirmado hasta que el salón lo apruebe.':'A requested time is not confirmed until the salon approves it.'}/>
  {!token?<SignInCard/>:<>
   <PrimaryButton disabled={loading} label={es?'Actualizar citas':'Refresh appointments'} onPress={()=>void refresh()}/>
   {loading&&!data?<ActivityIndicator/>:items.length===0?<Text style={styles.muted}>{es?'Aún no tienes citas.':'No appointments yet.'}</Text>:<>
    {upcoming.length?<><Text style={styles.subheading}>{es?'Próximas citas':'Upcoming'}</Text>{upcoming.map(card)}</>:null}
    {history.length?<><Text style={styles.subheading}>{es?'Historial':'History'}</Text>{history.map(card)}</>:null}
   </>}
  </>}
  {error?<Text accessibilityRole="alert" style={styles.muted}>{errorText(error,lang)}</Text>:null}
 </ScrollView>;
}
