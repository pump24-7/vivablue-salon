import React from 'react';
import {Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {api,type Appointment,type Profile} from '../src/api';
import {useSession} from '../src/session';
import {useCustomerData} from '../src/customer-data';
import {errorText,useLanguage} from '../src/language';
import {styles,theme} from '../src/theme';
import {PrimaryButton,SignInCard,TitleBar} from '../src/widgets';
const load=async()=>{
 const [favorites,bookings,profile,notifications]=await Promise.all([
  api<{looks:unknown[]}>('/api/me/favorites'),api<{appointments:Appointment[]}>('/api/bookings'),
  api<{user:Profile}>('/api/me'),api<{unreadCount:number}>('/api/me/notifications')]);
 return {likes:favorites.looks.length,upcoming:bookings.appointments.filter(a=>
  ['requested','confirmed','cancel_requested'].includes(a.status)&&Date.parse(a.start_at)>Date.now()).length,
  user:profile.user,unread:notifications.unreadCount};
};
export default function MyViva(){
 const {token,logout}=useSession();const {lang}=useLanguage();const es=lang==='es';
 const {data,error,loading,refresh}=useCustomerData(load,30000);
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title={es?'Mi Viva ♡':'My Viva ♡'} subtitle={es?'Tus citas e inspiración guardada, en un solo lugar.':'Your appointments and saved inspiration, all in one place.'}/>
  {!token?<SignInCard/>:<View style={[styles.panel,{backgroundColor:theme.sky}]}>
   <Text style={styles.overline}>{es?'TU HISTORIA DE BELLEZA':'YOUR BEAUTY JOURNEY'}</Text>
   <Text style={[styles.brand,{marginTop:8,fontSize:29}]}>{data?.user.display_name??(es?'Bienvenido a Mi Viva':'Welcome to My Viva')}</Text>
   {data?<View style={[styles.row,{marginTop:18}]}><Text style={styles.body}>♥ {data.likes} {es?'guardados':'saved looks'}</Text><Text style={styles.body}>◷ {data.upcoming} {es?'próximas citas':'upcoming'}</Text></View>:null}
  </View>}
  <Text style={styles.subheading}>{es?'Tu salón':'Your studio'}</Text>
  {([['◷',es?'Mis citas':'My appointments','/bookings'],['♡',es?'Estilos guardados':'Saved looks','/favorites'],
   ['✉',(es?'Actualizaciones':'Appointment updates')+(data?.unread?` (${data.unread})`:''),'/notifications'],
   ['♙',es?'Mi perfil':'My profile','/profile'],['✂',es?'Explorar servicios':'Explore services','/services'],
   ['☆',es?'Eventos':'Events','/events'],['♧',es?'Productos del salón':'Salon products','/shop']] as const).map(([icon,title,path])=>
   <Pressable key={path} accessibilityRole="button" style={styles.card} onPress={()=>router.push(path)}>
    <View style={styles.row}><Text style={{fontSize:21,color:theme.blueDark}}>{icon} <Text style={{fontSize:16,fontWeight:'700'}}>{title}</Text></Text><Text style={{color:theme.blueDark}}>→</Text></View>
   </Pressable>)}
  {error?<Text accessibilityRole="alert" style={styles.muted}>{errorText(error,lang)}</Text>:null}
  {token?<><PrimaryButton label={es?'Actualizar':'Refresh'} disabled={loading} onPress={()=>void refresh()}/>
   <Pressable accessibilityRole="button" onPress={()=>void logout().catch(e=>Alert.alert('Viva Blue',errorText(e,lang)))} style={styles.softButton}><Text style={styles.softButtonText}>{es?'Salir':'Sign out'}</Text></Pressable></>:null}
 </ScrollView>;
}
