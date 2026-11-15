import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {publicApi,type SalonService} from '../src/api';
import {styles,theme} from '../src/theme';
import {TitleBar,EmptyState} from '../src/widgets';
export default function Services(){
 const [services,setServices]=useState<SalonService[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{publicApi<{services:SalonService[]}>('/api/catalog').then(r=>setServices(r.services)).catch(e=>Alert.alert('Service catalog',String(e))).finally(()=>setLoading(false))},[]);
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title="Explore services" subtitle="Hair, color, beauty and styling. Real pricing and times appear only after salon approval."/>
  {loading?<ActivityIndicator color={theme.blueDark}/>:services.length===0?<EmptyState message="Services are being prepared by the salon."/>:
  services.map(s=><Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.name_en} onPress={()=>router.push({pathname:'/service',params:{serviceId:s.id,lang:'en'}})} style={[styles.card,styles.row]}>
   <View style={{flex:1,marginRight:12}}><Text style={{fontSize:17,fontWeight:'800',color:theme.ink}}>{s.name_en}</Text>
   <Text style={styles.muted}>{s.requires_consultation?'Consultation may be required':s.is_bookable?'Explore available appointments':'Salon confirmation required'}</Text></View>
   <Text style={{color:theme.blueDark,fontSize:22}}>→</Text>
  </Pressable>)}
  <Text style={[styles.muted,{marginTop:16}]}>Appointments remain requests until confirmed by Viva Blue staff.</Text>
 </ScrollView>;
}
