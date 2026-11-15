import React,{useCallback,useState} from 'react';
import {Alert,Pressable,ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {api} from '../src/api';
import {useSession} from '../src/session';
import {styles,theme} from '../src/theme';
import {PrimaryButton,TitleBar} from '../src/widgets';
export default function MyViva(){
 const {token,login,logout}=useSession();
 const [likes,setLikes]=useState(0),[upcoming,setUpcoming]=useState(0);
 const load=useCallback(async()=>{
  if(!token){setLikes(0);setUpcoming(0);return}
  try{const [f,b]=await Promise.all([api<{looks:unknown[]}>('/api/me/favorites'),api<{appointments:{status:string}[]}>('/api/bookings')]);
   setLikes(f.looks.length);setUpcoming(b.appointments.filter(x=>['requested','confirmed'].includes(x.status)).length)
  }catch(e){Alert.alert('My Viva','Could not load your salon history. Please try again.')}
 },[token]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title="My Viva ♡" subtitle="Your appointments and saved inspiration, all in one place."/>
  {!token?<View style={styles.card}><Text style={styles.body}>Sign in to view your appointments and saved looks.</Text>
    <PrimaryButton label="Sign in securely" onPress={()=>void login().catch(e=>Alert.alert('Sign in',String(e)))}/></View>:
   <View style={[styles.panel,{backgroundColor:theme.sky}]}><Text style={styles.overline}>YOUR BEAUTY JOURNEY</Text>
    <Text style={[styles.brand,{marginTop:8,fontSize:29}]}>Welcome to My Viva</Text>
    <View style={[styles.row,{marginTop:18}]}><Text style={styles.body}>♥ {likes} saved looks</Text><Text style={styles.body}>◷ {upcoming} upcoming</Text></View>
   </View>}
  <Text style={styles.subheading}>Your studio</Text>
  {([['◷','My appointments','/bookings'],['♡','Saved looks','/favorites'],['✂','Explore services','/services'],['☆','Events','/events'],['♧','Salon products','/shop']] as const).map(([icon,title,path])=><Pressable key={path} style={styles.card} onPress={()=>router.push(path)}>
   <View style={styles.row}><Text style={{fontSize:21,color:theme.blueDark}}>{icon} <Text style={{fontSize:16,fontWeight:'700'}}>{title}</Text></Text><Text style={{color:theme.blueDark}}>→</Text></View>
  </Pressable>)}
  {token?<Pressable onPress={logout} style={styles.softButton}><Text style={styles.softButtonText}>Sign out</Text></Pressable>:null}
 </ScrollView>;
}
