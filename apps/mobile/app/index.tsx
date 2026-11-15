import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Image,Pressable,ScrollView,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {router} from 'expo-router';
import {publicApi,type SalonService} from '../src/api';
import {useSession} from '../src/session';
import {styles,theme} from '../src/theme';
import {demoGallery,demoGalleryEnabled,photoForService,type Look} from '../src/gallery';
import {LookTile,PrimaryButton} from '../src/widgets';
import {BrandLogo} from '../src/BrandLogo';
export default function Home(){
 const {token,login,logout}=useSession();
 const [lang,setLang]=useState<'en'|'es'>('en');const es=lang==='es';
 const [services,setServices]=useState<SalonService[]>([]),[looks,setLooks]=useState<Look[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{Promise.all([publicApi<{services:SalonService[]}>('/api/catalog'),publicApi<{looks:Look[]}>('/api/lookbook')])
  .then(([s,l])=>{setServices(s.services);setLooks(l.looks)}).catch(e=>Alert.alert('Viva Blue',String(e))).finally(()=>setLoading(false))},[]);
 const gallery=looks.length?looks:demoGalleryEnabled?demoGallery:[];
 const navigate=(path:'/lookbook'|'/my-viva'|'/services'|'/favorites'|'/events'|'/shop')=>router.push(path);
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <View style={styles.row}><BrandLogo compact/><Pressable accessibilityRole="button" onPress={()=>setLang(es?'en':'es')}><Text style={{fontWeight:'700',color:theme.ink}}>{es?'English':'Español'}</Text></Pressable></View>
  <LinearGradient colors={['#d4ebff','#f6e9fc','#eaf5ff']} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.panel,{padding:25,marginTop:22}]}>
   <Text style={styles.overline}>YOUR BEAUTY, YOUR STORY</Text><Text style={[styles.brand,{marginTop:12}]}>{es?'Tu mejor versión.':'Feel fabulous.'}</Text>
   <Text style={[styles.body,{marginTop:12,maxWidth:300}]}>{es?'Tu próxima transformación comienza aquí. Descubre estilos, expertos y citas.':'Your next chapter looks beautiful. Discover styles, artists and appointments.'}</Text>
   <Pressable style={[styles.button,{alignSelf:'flex-start',marginTop:15}]} onPress={()=>navigate('/lookbook')}><Text style={styles.buttonText}>{es?'Ver el catálogo de estilos':'Explore the lookbook'}  ↗</Text></Pressable>
   <Text style={{alignSelf:'flex-end',color:theme.deepLilac,fontSize:45}}>✿</Text>
  </LinearGradient>
  <View style={[styles.row,{marginVertical:16}]}>
   {([['♡',es?'Mi Viva':'My Viva','/my-viva'],['✂',es?'Reservar':'Book','/services'],['☆',es?'Eventos':'Events','/events'],['♥',es?'Guardados':'Saved','/favorites']] as const).map(([symbol,label,path])=><Pressable key={label} onPress={()=>navigate(path)} style={{alignItems:'center',width:'23%'}}><View style={styles.circle}><Text style={{fontSize:21,color:theme.ink}}>{symbol}</Text></View><Text style={{fontSize:11,color:theme.ink,marginTop:8,fontWeight:'700'}}>{label}</Text></Pressable>)}
  </View>
  <View style={[styles.row,{marginTop:14}]}><Text style={styles.subheading}>{es?'Inspiración real':'The style edit'}</Text><Pressable onPress={()=>navigate('/lookbook')}><Text style={{color:theme.ink,fontWeight:'700'}}>{es?'Ver todo':'View all'} →</Text></Pressable></View>
  {gallery.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Lookbook preview">{gallery.slice(0,5).map(l=><LookTile key={l.id} url={l.image_url} title={es?l.caption_es:l.caption_en} onPress={()=>navigate('/lookbook')}/>)}</ScrollView>:
   <View style={styles.card}><Text style={styles.body}>✿ {es?'Próximamente fotos del salón aprobadas.':'Salon-approved lookbook photos coming soon.'}</Text></View>}
  <Text style={styles.subheading}>{es?'Nuestros servicios':'A little self-care'}</Text>
  {loading?<ActivityIndicator color={theme.ink}/>:<View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'}}>{services.map(s=><Pressable key={s.id} accessibilityRole="button" style={{width:'48%',marginBottom:15,backgroundColor:theme.white,borderRadius:17,overflow:'hidden',borderColor:theme.outline,borderWidth:1}}
   onPress={()=>router.push({pathname:'/service',params:{serviceId:s.id,lang}})}>
   {demoGalleryEnabled?<Image source={{uri:photoForService(s.slug)}} style={{width:'100%',height:135}}/>:<LinearGradient colors={['#d6ecff','#f6eafa','#eaf7ff']} style={{height:135,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:35}}>✿</Text></LinearGradient>}
   <View style={{padding:12}}><Text style={{fontWeight:'800',color:theme.ink,fontSize:14}}>{es?s.name_es:s.name_en}</Text><Text style={styles.muted}>{s.is_bookable?(es?'Solicitar cita':'Request a time'):(es?'Consultar':'Consultation')}</Text></View>
  </Pressable>)}</View>}
  <View style={[styles.card,{backgroundColor:theme.sky,marginTop:11}]}><Text style={styles.subheading}>{es?'Cuidado para llevar':'Take your glow home'}</Text><Text style={styles.body}>{es?'Productos recomendados por profesionales, con información de ingredientes.':'Discover salon-recommended products and ingredient notes.'}</Text><PrimaryButton label={es?'Ver productos':'Explore products'} onPress={()=>navigate('/shop')}/></View>
  <View style={[styles.row,{marginTop:20}]}><Text style={styles.muted}>{es?'Citas sujetas a confirmación.':'Appointments require salon confirmation.'}</Text><Pressable onPress={()=>token?logout():login().catch(e=>Alert.alert('Sign in',String(e)))}><Text style={{color:theme.ink,fontWeight:'700'}}>{token?(es?'Salir':'Sign out'):(es?'Entrar':'Sign in')}</Text></Pressable></View>
 </ScrollView>;
}
