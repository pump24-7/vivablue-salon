import React,{useCallback,useState} from 'react';
import {Image,Pressable,ScrollView,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {api} from '../src/api';
import {useSession} from '../src/session';
import {styles} from '../src/theme';
import {TitleBar,PrimaryButton,EmptyState} from '../src/widgets';
type Look={id:string,image_url:string,caption_en:string};
export default function Favorites(){
 const {token,login}=useSession();const [items,setItems]=useState<Look[]>([]),[msg,setMsg]=useState('');
 const load=useCallback(async()=>{if(token)try{setItems((await api<{looks:Look[]}>('/api/me/favorites')).looks)}catch(e){setMsg(String(e))}},[token]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><TitleBar title="Saved inspiration ♡" subtitle="Your favorite looks from the salon's approved gallery."/>
  {!token?<PrimaryButton label="Sign in to save looks" onPress={()=>void login()}/>:items.length===0?<EmptyState message="No saved looks yet. Visit the lookbook to find your favorite style."/>:
   items.map(l=><View key={l.id} style={styles.card}><Image source={{uri:l.image_url}} style={styles.photo}/><View style={[styles.row,{marginTop:12}]}><Text style={styles.body}>{l.caption_en}</Text><Pressable onPress={()=>void api('/api/me/favorites/'+l.id,{method:'DELETE'}).then(load)}><Text style={styles.body}>♥ Remove</Text></Pressable></View></View>)}
  {!!msg?<Text style={styles.muted}>{msg}</Text>:null}</ScrollView>;
}
