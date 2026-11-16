import React,{useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Image,Pressable,ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {api,publicApi} from '../src/api';
import {demoGallery,demoGalleryEnabled,type Look} from '../src/gallery';
import {useSession} from '../src/session';
import {sessionGeneration} from '../src/auth-store';
import {errorText,useLanguage} from '../src/language';
import {styles,theme} from '../src/theme';
import {TitleBar,EmptyState,LanguageToggle} from '../src/widgets';
export default function Lookbook(){
 const {token,login,identityVersion}=useSession();const {lang}=useLanguage();const es=lang==='es';
 const [gallery,setGallery]=useState<Look[]>([]),[favorites,setFavorites]=useState<string[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const favoritesOwner=useRef(identityVersion);
 const visibleFavorites=token&&favoritesOwner.current===identityVersion?favorites:[];
 const sequence=useRef(0),pending=useRef(new Set<string>());
 const [saving,setSaving]=useState<string[]>([]);
 const load=useCallback(async()=>{
  const run=++sequence.current;setLoading(true);setMessage('');setFavorites([]);favoritesOwner.current=identityVersion;
  try{const l=await publicApi<{looks:Look[]}>('/api/lookbook');if(run!==sequence.current)return;setGallery(l.looks);
   if(token){const f=await api<{looks:Look[]}>('/api/me/favorites');if(run===sequence.current)setFavorites(f.looks.map(x=>x.id))}}
  catch(e){if(run===sequence.current)setMessage(errorText(e,lang))}finally{if(run===sequence.current)setLoading(false)}
 },[token,identityVersion,lang]);
 useFocusEffect(useCallback(()=>{void load();return()=>{sequence.current++}},[load]));
 const looks=gallery.length?gallery:demoGalleryEnabled?demoGallery:[];
 async function toggle(id:string){
  if(id.startsWith('demo-')){Alert.alert('Viva Blue',es?'Esta foto de referencia necesita aprobación para guardarse.':'This website reference must be approved and published before it can be saved.');return}
  if(!token){await login().catch(e=>Alert.alert('Viva Blue',errorText(e,lang)));return}
  if(pending.current.has(id))return;pending.current.add(id);setSaving([...pending.current]);const version=sessionGeneration();
  const saved=visibleFavorites.includes(id);
  try{await api('/api/me/favorites/'+id,{method:saved?'DELETE':'PUT'});if(version===sessionGeneration())setFavorites(x=>saved?x.filter(v=>v!==id):[...new Set([...x,id])])}
  catch(e){if(version===sessionGeneration())setMessage(errorText(e,lang))}
  finally{pending.current.delete(id);setSaving([...pending.current])}
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <View style={styles.row}><Text style={styles.overline}>LOOKBOOK · VIVA BLUE</Text><LanguageToggle/></View>
  <TitleBar languageSwitch={false} title={es?'Encuentra tu inspiración':'Looks we love'} subtitle={es?'Guarda tus estilos favoritos y muestra la inspiración en tu cita.':'Explore salon looks, save favorites and bring inspiration to your next visit.'}/>
  {gallery.length===0&&demoGalleryEnabled?<View style={[styles.card,{backgroundColor:theme.rose}]}><Text style={styles.muted}>DEMO IMAGE REFERENCES — The salon must confirm model and photographer permissions before these photos appear publicly in the app.</Text></View>:null}
  {loading?<ActivityIndicator color={theme.ink}/>:looks.length===0?<EmptyState message={es?'Las fotografías aprobadas llegarán pronto.':'Approved salon photos will appear here soon.'}/>:
   <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{looks.map(l=><View key={l.id} style={{width:'48%',marginVertical:10,backgroundColor:'white',borderRadius:18,overflow:'hidden'}}>
    <Image accessibilityLabel={es?l.caption_es:l.caption_en} source={{uri:l.image_url}} style={{height:235,width:'100%',backgroundColor:theme.lilac}} resizeMode="cover"/>
    <View style={{padding:11}}><Text style={{fontSize:13,fontWeight:'800',color:theme.ink}}>{es?l.caption_es:l.caption_en}</Text><Pressable accessibilityRole="button" accessibilityLabel={visibleFavorites.includes(l.id)?(es?'Quitar favorito':'Remove favorite'):(es?'Guardar favorito':'Save favorite')} accessibilityState={{selected:visibleFavorites.includes(l.id),disabled:saving.includes(l.id)}} disabled={saving.includes(l.id)} onPress={()=>void toggle(l.id)} style={{marginTop:8}}><Text style={{fontSize:23,color:theme.ink}}>{visibleFavorites.includes(l.id)?'♥':'♡'} <Text style={styles.muted}>{visibleFavorites.includes(l.id)?(es?'Guardado':'Saved'):(es?'Guardar':'Save')}</Text></Text></Pressable></View>
   </View>)}</View>}
  <Pressable style={styles.softButton} onPress={()=>router.push('/favorites')}><Text style={styles.softButtonText}>{es?'Mis favoritos':'See My Viva favorites'} →</Text></Pressable>
  {message?<Text style={styles.muted}>{message}</Text>:null}
 </ScrollView>;
}
