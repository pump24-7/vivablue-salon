import React from 'react';
import {Alert,Image,Pressable,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {styles,theme} from './theme';
import {BrandLogo} from './BrandLogo';
import {errorText,useLanguage} from './language';
import {useSession} from './session';
export function PrimaryButton({label,onPress,disabled=false}:{label:string,onPress:()=>void,disabled?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button,disabled?{opacity:.45}:{}]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
export function TitleBar({title,subtitle,languageSwitch=true}:{title:string,subtitle?:string,languageSwitch?:boolean}){
 return <View style={{marginBottom:17}}><View style={styles.row}><BrandLogo compact/>{languageSwitch?<LanguageToggle/>:null}</View><Text style={[styles.heading,{marginTop:7}]}>{title}</Text>{subtitle?<Text style={styles.muted}>{subtitle}</Text>:null}</View>;
}
export function LanguageToggle(){
 const {lang,setLanguage}=useLanguage();const [busy,setBusy]=React.useState(false);
 return <Pressable accessibilityRole="button" accessibilityLabel={lang==='es'?'Switch to English':'Cambiar a español'} disabled={busy}
  onPress={()=>{setBusy(true);void setLanguage(lang==='es'?'en':'es').catch(e=>Alert.alert('Viva Blue',errorText(e,lang))).finally(()=>setBusy(false))}}
  style={{padding:10}}><Text style={{color:theme.ink,fontWeight:'700'}}>{lang==='es'?'English':'Español'}</Text></Pressable>;
}
export function SignInCard(){
 const {lang}=useLanguage();const es=lang==='es';const {login,signingIn}=useSession();
 return <View style={styles.card}><Text style={styles.body}>{es?'Inicia sesión para guardar estilos y administrar tus citas.':'Sign in to save looks and manage your appointments.'}</Text>
  <PrimaryButton disabled={signingIn} label={signingIn?(es?'Abriendo…':'Opening…'):(es?'Entrar o crear cuenta':'Sign in or create account')}
   onPress={()=>void login().catch(e=>Alert.alert(es?'Iniciar sesión':'Sign in',errorText(e,lang)))}/>
  <Text style={styles.muted}>{es?'Puedes registrarte y recuperar tu cuenta en la página segura de acceso.':'Registration and account recovery are handled on the secure sign-in page.'}</Text>
 </View>;
}
export function LookTile({url,title,width=190,onPress}:{url?:string,title:string,width?:number,onPress?:()=>void}){
 return <Pressable onPress={onPress} disabled={!onPress} style={{width,marginRight:13}} accessibilityRole={onPress?'button':'image'} accessibilityLabel={title}>
  {url?<Image source={{uri:url}} style={{height:210,width,borderRadius:19,backgroundColor:theme.lilac}} resizeMode="cover"/>:
   <LinearGradient colors={['#d6ecff','#f1e3fa','#e8f7ff']} style={{height:210,width,borderRadius:19,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:54}}>✿</Text></LinearGradient>}
  <Text style={{fontWeight:'700',color:theme.ink,marginTop:9}} numberOfLines={2}>{title}</Text>
 </Pressable>;
}
export function EmptyState({message}:{message:string}){return <View style={[styles.card,{alignItems:'center',padding:28}]}><Text style={{fontSize:35,color:theme.deepLilac}}>✿</Text><Text style={[styles.muted,{textAlign:'center',marginTop:8}]}>{message}</Text></View>}
