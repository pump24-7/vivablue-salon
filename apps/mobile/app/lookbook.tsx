import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Image,Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {api,publicApi} from '../src/api';
import {demoGallery,demoGalleryEnabled,type Look} from '../src/gallery';
import {useSession} from '../src/session';
import {styles,theme} from '../src/theme';
import {TitleBar,EmptyState} from '../src/widgets';
export default function Lookbook(){
 const {token,login}=useSession();const [es,setEs]=useState(false),[gallery,setGallery]=useState<Look[]>([]),[favorites,setFavorites]=useState<string[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const load=useCallback(async()=>{
  try{const l=await publicApi<{looks:Look[]}>('/api/lookbook');setGallery(l.looks);
   if(token){const f=await api<{looks:Look[]}>('/api/me/favorites');setFavorites(f.looks.map(x=>x.id))}}
  catch(e){setMessage(String(e))}finally{setLoading(false)}
 },[token]);
 useEffect(()=>{void load()},[load]);
 const looks=gallery.length?gallery:demoGalleryEnabled?demoGallery:[];
 async function toggle(id:string){
  if(id.startsWith('demo-')){Alert.alert('Preview only','This website reference must be approved and published before it can be saved.');return}
  if(!token){await login().catch(e=>Alert.alert('Sign-in',String(e)));return}
  const saved=favorites.includes(id);
  try{await api('/api/me/favorites/'+id,{method:saved?'DELETE':'PUT'});setFavorites(x=>saved?x.filter(v=>v!==id):[...x,id])}
  catch(e){setMessage(String(e))}
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <View style={styles.row}><Text style={styles.overline}>LOOKBOOK · VIVA BLUE</Text><Pressable onPress={()=>setEs(x=>!x)}><Text style={{color:theme.ink,fontWeight:'700'}}>{es?'English':'Español'}</Text></Pressable></View>
  <TitleBar title={es?'Encuentra tu inspiración':'Looks we love'} subtitle={es?'Guarda tus estilos favoritos y muestra la inspiración en tu cita.':'Explore salon looks, save favorites and bring inspiration to your next visit.'}/>
  {gallery.length===0&&demoGalleryEnabled?<View style={[styles.card,{backgroundColor:theme.rose}]}><Text style={styles.muted}>DEMO IMAGE REFERENCES — The salon must confirm model and photographer permissions before these photos appear publicly in the app.</Text></View>:null}
  {loading?<ActivityIndicator color={theme.ink}/>:looks.length===0?<EmptyState message={es?'Las fotografías aprobadas llegarán pronto.':'Approved salon photos will appear here soon.'}/>:
   <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{looks.map(l=><View key={l.id} style={{width:'48%',marginVertical:10,backgroundColor:'white',borderRadius:18,overflow:'hidden'}}>
    <Image source={{uri:l.image_url}} style={{height:235,width:'100%',backgroundColor:theme.lilac}} resizeMode="cover"/>
    <View style={{padding:11}}><Text style={{fontSize:13,fontWeight:'800',color:theme.ink}}>{es?l.caption_es:l.caption_en}</Text><Pressable accessibilityRole="button" accessibilityLabel="Save favorite" onPress={()=>void toggle(l.id)} style={{marginTop:8}}><Text style={{fontSize:23,color:theme.ink}}>{favorites.includes(l.id)?'♥':'♡'} <Text style={styles.muted}>{es?'Guardar':'Save'}</Text></Text></Pressable></View>
   </View>)}</View>}
  <Pressable style={styles.softButton} onPress={()=>router.push('/my-viva')}><Text style={styles.softButtonText}>{es?'Mis favoritos':'See My Viva favorites'} →</Text></Pressable>
  {message?<Text style={styles.muted}>{message}</Text>:null}
 </ScrollView>;
}
