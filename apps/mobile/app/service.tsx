import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Image,Linking,Pressable,ScrollView,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {router,useLocalSearchParams} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {ApiError,post,publicApi,type Quote,type SalonService,type Stylist} from '../src/api';
import {useSession} from '../src/session';
import {errorText,useLanguage} from '../src/language';
import {styles,theme} from '../src/theme';
import {demoGalleryEnabled,photoForService} from '../src/gallery';
import {PrimaryButton,TitleBar} from '../src/widgets';
type Modifier={id:string,label_en:string,label_es:string,additional_minutes:number,additional_price_cents:number};
type Policy={cancellation_en:string,cancellation_es:string,service_consent_en:string,service_consent_es:string,privacy_url:string,effective_at:string};
function salonDay(offset:number){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(p:string)=>parts.find(x=>x.type===p)!.value;
 const base=new Date(Date.UTC(Number(get('year')),Number(get('month'))-1,Number(get('day'))+offset,12));
 return base.toISOString().slice(0,10);
}
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export default function Service(){
 const {serviceId}=useLocalSearchParams<{serviceId:string}>();const {lang}=useLanguage();const es=lang==='es';
 const {token,login,identityVersion}=useSession();const [service,setService]=useState<SalonService|null>(null),[stylists,setStylists]=useState<Stylist[]>([]),[modifiers,setModifiers]=useState<Modifier[]>([]);
 const [selected,setSelected]=useState<string[]>([]),[stylistId,setStylistId]=useState(''),[date,setDate]=useState(salonDay(1)),[slots,setSlots]=useState<string[]>([]);
 const [timezone,setTimezone]=useState('America/New_York'),[chosen,setChosen]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [policy,setPolicy]=useState<Policy|null>(null),[accepted,setAccepted]=useState(false),[consultationAck,setConsultationAck]=useState(false);
 const [quote,setQuote]=useState<Quote|null>(null),[quoteBusy,setQuoteBusy]=useState(false),[quoteVersion,setQuoteVersion]=useState(0);
 const availabilityVersion=useRef(0),submitting=useRef(false),requestKey=useRef<{fingerprint:string,key:string}|null>(null);
 const modifierKey=selected.join(',');
 function invalidate(){availabilityVersion.current++;setSlots([]);setChosen('');setQuote(null);setAccepted(false);setBusy(false);setMessage('')}
 useEffect(()=>{
  let active=true;invalidate();setService(null);setStylists([]);setModifiers([]);setSelected([]);setStylistId('');setPolicy(null);setConsultationAck(false);
  if(!serviceId)return;
  Promise.all([publicApi<{services:SalonService[]}>('/api/catalog'),publicApi<{stylists:Stylist[]}>('/api/stylists?serviceId='+serviceId),
   publicApi<{modifiers:Modifier[]}>('/api/booking-options?serviceId='+serviceId),publicApi<{policies:Policy|null}>('/api/policies')])
   .then(([catalog,staff,extras,terms])=>{if(!active)return;setService(catalog.services.find(s=>s.id===serviceId)??null);setStylists(staff.stylists);setModifiers(extras.modifiers);setPolicy(terms.policies)})
   .catch(e=>{if(active)setMessage(errorText(e,lang))});
  return()=>{active=false;availabilityVersion.current++};
 },[serviceId]);
 useEffect(()=>{
  let active=true;setQuote(null);
  if(!chosen){setQuoteBusy(false);return}
  setQuoteBusy(true);
  const qs=new URLSearchParams({serviceId,stylistId,startAt:chosen,...(modifierKey?{modifierIds:modifierKey}:{})});
  publicApi<{quote:Quote}>('/api/booking-quote?'+qs).then(r=>{if(active){setQuote(r.quote);setMessage('')}})
   .catch(e=>{if(active)setMessage(errorText(e,lang))}).finally(()=>{if(active)setQuoteBusy(false)});
  return()=>{active=false};
 },[chosen,serviceId,stylistId,modifierKey,quoteVersion]);
 const choices=useMemo(()=>modifiers.filter(m=>selected.includes(m.id)),[selected,modifiers]);
 const estimatedDuration=quote?.serviceMinutes??((service?.duration_minutes??0)+choices.reduce((n,x)=>n+x.additional_minutes,0));
 const estimatedCents=quote?quote.totalCents:service?.starting_price_cents==null?null:service.starting_price_cents+choices.reduce((n,x)=>n+x.additional_price_cents,0);
 const chooseModifier=(id:string)=>{if(submitting.current)return;invalidate();setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])};
 async function availability(){
  if(!serviceId||!stylistId||submitting.current)return;
  invalidate();const version=availabilityVersion.current;setBusy(true);
  try{
   const qs=new URLSearchParams({serviceId,stylistId,date,...(selected.length?{modifierIds:selected.join(',')}:{})});
   const r=await publicApi<{slots:string[],timezone:string,reason:string|null}>('/api/availability?'+qs.toString());
   if(version!==availabilityVersion.current)return;
   setSlots(r.slots);setTimezone(r.timezone);if(r.reason)setMessage(es?'Este servicio aún requiere aprobación del salón.':r.reason);else if(!r.slots.length)setMessage(es?'No hay horarios disponibles para este día.':'No times are available for this day.');
  }catch(e){if(version===availabilityVersion.current)setMessage(errorText(e,lang))}
  finally{if(version===availabilityVersion.current)setBusy(false)}
 }
 async function requestBooking(){
  if(!chosen||!serviceId||!stylistId||!quote||submitting.current)return;
  if(!token){try{await login();setMessage(es?'Inicia sesión y vuelve a confirmar tu horario.':'After sign-in, confirm your selected time again.')}catch(e){Alert.alert('Viva Blue',errorText(e,lang))}return}
  if(!policy||!accepted||Boolean(service?.requires_consultation&&!consultationAck))return;
  const body={serviceId,stylistId,startAt:chosen,modifierIds:selected,consultationAck,policyAccepted:accepted,
   expectedTotalCents:quote.totalCents,policyEffectiveAt:policy.effective_at};
  const fingerprint=JSON.stringify([identityVersion,body]);
  if(requestKey.current?.fingerprint!==fingerprint)requestKey.current={fingerprint,key:Crypto.randomUUID()};
  submitting.current=true;setBusy(true);setMessage('');
  try{await post('/api/bookings',{...body,idempotencyKey:requestKey.current.key});
   Alert.alert('Viva Blue Salon',es?'Tu cita se solicitó. Espera la confirmación del salón.':'Your appointment request was received. Salon confirmation is required.');router.replace('/bookings');}
  catch(e){
   setMessage(errorText(e,lang));
   if(e instanceof ApiError&&e.status===409){
    setChosen('');setSlots([]);setQuote(null);setAccepted(false);
    try{setPolicy((await publicApi<{policies:Policy|null}>('/api/policies')).policies)}catch{}
   }
   // On a network/server failure keep the same selection and idempotency key for retry.
  }finally{submitting.current=false;setBusy(false)}
 }
 const dateLabel=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString(es?'es-US':'en-US',{month:'short',day:'numeric',weekday:'short',timeZone:'UTC'});
 const fmt=(s:string)=>new Date(s).toLocaleTimeString(es?'es-US':'en-US',{hour:'numeric',minute:'2-digit',timeZone:timezone});
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title={service?(es?service.name_es:service.name_en):(es?'Servicio del salón':'Salon service')} subtitle={es?'Elige tu experiencia. Nuestro equipo confirma la cita.':'Customize your visit. The salon confirms each appointment.'}/>
  {service&&demoGalleryEnabled?<Image source={{uri:photoForService(service.slug)}} style={[styles.photo,{height:255}]}/>:
   <LinearGradient colors={['#e1c6f3','#fbe5ee','#d8edff']} style={[styles.panel,{height:170,alignItems:'center',justifyContent:'center'}]}><Text style={{fontSize:80,color:theme.ink}}>✿</Text></LinearGradient>}
  <View style={styles.card}><Text style={styles.body}>{es?service?.description_es:service?.description_en}</Text><Text style={[styles.subheading,{marginTop:8}]}>{estimatedCents==null?(es?'Precio tras consulta':'Pricing after consultation'):(es?'Desde ':'Starting at ')+money(estimatedCents)}</Text>
   {estimatedDuration>0?<Text style={styles.muted}>{es?'Duración estimada':'Estimated service time'}: {estimatedDuration} min · {es?'Incluye tiempo adicional entre citas':'Salon buffer applies'}</Text>:null}
   <Text style={styles.muted}>{es?'El precio final puede incluir recargos aprobados y se confirma con el salón.':'An approved peak-time adjustment may apply. Final charges require salon confirmation.'}</Text></View>
  {service?.requires_consultation?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:consultationAck}} onPress={()=>setConsultationAck(!consultationAck)} style={[styles.chip,consultationAck&&styles.selected]}><Text style={styles.body}>{consultationAck?'☑':'□'} {es?'Entiendo que este servicio puede requerir consulta.':'I understand this service may require a consultation.'}</Text></Pressable>:null}
  <Text style={styles.subheading}>{es?'Personaliza tu estilo':'Make it your own'}</Text>
  {modifiers.length?modifiers.map(m=><Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{checked:selected.includes(m.id)}} onPress={()=>chooseModifier(m.id)} style={[styles.chip,selected.includes(m.id)&&styles.selected]}>
   <View style={styles.row}><Text style={[styles.body,{fontWeight:'700',flex:1}]}>{selected.includes(m.id)?'✓ ':'+ '}{es?m.label_es:m.label_en}</Text><Text style={styles.muted}>{m.additional_minutes} min · +{money(m.additional_price_cents)}</Text></View>
  </Pressable>):<Text style={styles.muted}>{es?'No hay opciones adicionales publicadas.':'No additional styling options are currently published.'}</Text>}
  <Text style={styles.subheading}>{es?'Tu estilista':'Choose your stylist'}</Text>
  {stylists.length?stylists.map(st=><Pressable key={st.id} accessibilityRole="radio" accessibilityState={{checked:stylistId===st.id}} disabled={busy} onPress={()=>{invalidate();setStylistId(st.id)}} style={[styles.chip,stylistId===st.id&&styles.selected]}><Text style={styles.body}>{stylistId===st.id?'●':'○'} {st.display_name}</Text>{st.bio?<Text style={styles.muted}>{st.bio}</Text>:null}</Pressable>):<Text style={styles.muted}>{es?'El equipo aún no tiene horarios publicados.':'No stylist is configured for online booking yet.'}</Text>}
  {service?.is_bookable?<><Text style={styles.subheading}>{es?'Selecciona un día':'Choose your day'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{Array.from({length:21},(_,i)=>salonDay(i)).map(d=><Pressable accessibilityRole="button" key={d} disabled={busy} onPress={()=>{invalidate();setDate(d)}} style={[styles.chip,{marginRight:8,paddingHorizontal:18},d===date&&styles.selected]}><Text style={{fontWeight:'700',color:theme.ink}}>{dateLabel(d)}</Text></Pressable>)}</ScrollView>
   <PrimaryButton label={busy?(es?'Buscando…':'Searching…'):(es?'Ver horarios disponibles':'Find available times')} disabled={!stylistId||busy} onPress={()=>void availability()}/>
   {busy?<ActivityIndicator color={theme.ink}/>:null}
   <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{slots.map(t=><Pressable key={t} accessibilityRole="radio" accessibilityState={{checked:chosen===t}} style={[styles.chip,{width:'48%',alignItems:'center'},chosen===t&&styles.selected]} disabled={busy} onPress={()=>{setChosen(t);setAccepted(false);setQuoteVersion(x=>x+1)}}><Text style={styles.body}>{fmt(t)}</Text></Pressable>)}</View>
   {chosen?<View style={[styles.card,{backgroundColor:theme.mint}]}><Text style={[styles.body,{fontWeight:'800'}]}>{es?'Resumen de tu visita':'Your visit'}</Text><Text style={styles.body}>{fmt(chosen)} · {dateLabel(date)} · {estimatedDuration} min</Text><Text style={styles.muted}>{es?'Solicitud pendiente de confirmación.':'Request subject to salon confirmation.'}</Text>
    {quoteBusy?<ActivityIndicator/>:quote?<><Text style={styles.body}>{es?'Estimación del salón':'Salon estimate'}: {quote.totalCents==null?(es?'Tras consulta':'After consultation'):money(quote.totalCents)}</Text>
     {Boolean(quote.peakCents)?<Text style={styles.muted}>{es?'Incluye ajuste de horario':'Includes peak adjustment'}: {money(quote.peakCents!)}</Text>:null}</>:
     <PrimaryButton label={es?'Actualizar estimación':'Refresh estimate'} onPress={()=>setQuoteVersion(x=>x+1)}/>}
    <Text style={styles.muted}>{timezone}</Text></View>:null}
   {chosen&&policy?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted}} onPress={()=>setAccepted(!accepted)} style={[styles.chip,accepted&&styles.selected]}><Text style={styles.body}>{accepted?'☑':'□'} {es?'Acepto la política de cancelación y consentimiento de servicios del salón.':'I have read and accept the salon cancellation policy and service consent.'}</Text><Text style={styles.muted}>{es?policy.cancellation_es:policy.cancellation_en}</Text><Text style={styles.muted}>{es?policy.service_consent_es:policy.service_consent_en}</Text></Pressable>:null}
   {chosen&&policy?.privacy_url?<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(policy.privacy_url).catch(e=>setMessage(errorText(e,lang)))}><Text style={styles.softButtonText}>{es?'Leer política de privacidad':'Read privacy policy'}</Text></Pressable>:null}
   {chosen&&!policy?<Text style={styles.muted}>{es?'Las políticas del salón aún no están publicadas.':'Salon policies are not yet published. Online requests remain unavailable.'}</Text>:null}
   {chosen?<PrimaryButton disabled={!accepted||!policy||!quote||quoteBusy||busy||Boolean(service.requires_consultation&&!consultationAck)} label={es?'Solicitar cita':'Request appointment'} onPress={()=>void requestBooking()}/>:null}
  </>:<View style={styles.card}><Text style={styles.body}>{es?'Reservas en línea no disponibles para este servicio hasta que el salón apruebe duración, precios y horarios.':'This service will become bookable when management approves its time, price and stylist schedule.'}</Text></View>}
  {!!message?<Text style={[styles.muted,{marginTop:11}]} role="alert">{message}</Text>:null}
 </ScrollView>;
}
