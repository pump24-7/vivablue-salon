import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {publicApi,type SalonService} from '../src/api';
import {styles,theme} from '../src/theme';
import {useLanguage,errorText} from '../src/language';
import {TitleBar,EmptyState} from '../src/widgets';
export default function Services(){
 const {lang}=useLanguage();const es=lang==='es';
 const [services,setServices]=useState<SalonService[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{publicApi<{services:SalonService[]}>('/api/catalog').then(r=>setServices(r.services)).catch(e=>Alert.alert('Viva Blue',errorText(e,lang))).finally(()=>setLoading(false))},[]);
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title={es?'Explorar servicios':'Explore services'} subtitle={es?'Cabello, color, belleza y peinados. Precios y horarios aprobados por el salón.':'Hair, color, beauty and styling. Real pricing and times appear only after salon approval.'}/>
  {loading?<ActivityIndicator color={theme.blueDark}/>:services.length===0?<EmptyState message={es?'El salón está preparando los servicios.':'Services are being prepared by the salon.'}/>:
  services.map(s=><Pressable key={s.id} accessibilityRole="button" accessibilityLabel={es?s.name_es:s.name_en} onPress={()=>router.push({pathname:'/service',params:{serviceId:s.id,lang}})} style={[styles.card,styles.row]}>
   <View style={{flex:1,marginRight:12}}><Text style={{fontSize:17,fontWeight:'800',color:theme.ink}}>{es?s.name_es:s.name_en}</Text>
   <Text style={styles.muted}>{s.requires_consultation?(es?'Puede requerir consulta':'Consultation may be required'):s.is_bookable?(es?'Ver citas disponibles':'Explore available appointments'):(es?'Requiere confirmación del salón':'Salon confirmation required')}</Text></View>
   <Text style={{color:theme.blueDark,fontSize:22}}>→</Text>
  </Pressable>)}
  <Text style={[styles.muted,{marginTop:16}]}>{es?'Las citas son solicitudes hasta que el equipo de Viva Blue las confirme.':'Appointments remain requests until confirmed by Viva Blue staff.'}</Text>
 </ScrollView>;
}
