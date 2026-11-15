import React from 'react';
import {Image,Pressable,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {styles,theme} from './theme';
import {BrandLogo} from './BrandLogo';
export function PrimaryButton({label,onPress,disabled=false}:{label:string,onPress:()=>void,disabled?:boolean}){
 return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,disabled?{opacity:.45}:{}]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
export function TitleBar({title,subtitle}:{title:string,subtitle?:string}){
 return <View style={{marginBottom:17}}><BrandLogo compact/><Text style={[styles.heading,{marginTop:7}]}>{title}</Text>{subtitle?<Text style={styles.muted}>{subtitle}</Text>:null}</View>;
}
export function LookTile({url,title,width=190,onPress}:{url?:string,title:string,width?:number,onPress?:()=>void}){
 return <Pressable onPress={onPress} disabled={!onPress} style={{width,marginRight:13}} accessibilityRole={onPress?'button':'image'} accessibilityLabel={title}>
  {url?<Image source={{uri:url}} style={{height:210,width,borderRadius:19,backgroundColor:theme.lilac}} resizeMode="cover"/>:
   <LinearGradient colors={['#d6ecff','#f1e3fa','#e8f7ff']} style={{height:210,width,borderRadius:19,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:54}}>✿</Text></LinearGradient>}
  <Text style={{fontWeight:'700',color:theme.ink,marginTop:9}} numberOfLines={2}>{title}</Text>
 </Pressable>;
}
export function EmptyState({message}:{message:string}){return <View style={[styles.card,{alignItems:'center',padding:28}]}><Text style={{fontSize:35,color:theme.deepLilac}}>✿</Text><Text style={[styles.muted,{textAlign:'center',marginTop:8}]}>{message}</Text></View>}
