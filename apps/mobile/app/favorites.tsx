import React,{useState} from 'react';
import {Alert,Image,ScrollView,Text,View} from 'react-native';
import {api} from '../src/api';
import type {Look} from '../src/gallery';
import {useSession} from '../src/session';
import {useCustomerData} from '../src/customer-data';
import {errorText,useLanguage} from '../src/language';
import {styles} from '../src/theme';
import {TitleBar,PrimaryButton,SignInCard,EmptyState} from '../src/widgets';
const load=()=>api<{looks:Look[]}>('/api/me/favorites');
export default function Favorites(){
 const {token}=useSession();const {lang}=useLanguage();const es=lang==='es';
 const {data,error,loading,refresh}=useCustomerData(load);const [pending,setPending]=useState<string|null>(null);
 async function remove(id:string){
  if(pending)return;setPending(id);
  try{await api('/api/me/favorites/'+id,{method:'DELETE'});await refresh()}
  catch(e){Alert.alert('Viva Blue',errorText(e,lang))}finally{setPending(null)}
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title={es?'Inspiración guardada ♡':'Saved inspiration ♡'} subtitle={es?'Tus estilos favoritos de la galería aprobada del salón.':"Your favorite looks from the salon's approved gallery."}/>
  {!token?<SignInCard/>:<>
   <PrimaryButton label={es?'Actualizar':'Refresh'} disabled={loading} onPress={()=>void refresh()}/>
   {data?.looks.length?data.looks.map(l=><View key={l.id} style={styles.card}>
    <Image source={{uri:l.image_url}} accessibilityLabel={es?l.caption_es:l.caption_en} style={styles.photo}/>
    <Text style={styles.body}>{es?l.caption_es:l.caption_en}</Text>
    <PrimaryButton label={es?'Quitar de favoritos':'Remove favorite'} disabled={Boolean(pending)} onPress={()=>void remove(l.id)}/>
   </View>):!loading?<EmptyState message={es?'Aún no tienes estilos guardados. Visita el catálogo para encontrar inspiración.':'No saved looks yet. Visit the lookbook to find your favorite style.'}/>:null}
  </>}
  {error?<Text accessibilityRole="alert" style={styles.muted}>{errorText(error,lang)}</Text>:null}
 </ScrollView>;
}
