import React,{useEffect,useState} from 'react';
import {Alert,ScrollView,Text,TextInput,View} from 'react-native';
import {api,type Profile} from '../src/api';
import {useSession} from '../src/session';
import {useCustomerData} from '../src/customer-data';
import {errorText,useLanguage} from '../src/language';
import {styles} from '../src/theme';
import {PrimaryButton,SignInCard,TitleBar} from '../src/widgets';
const load=()=>api<{user:Profile}>('/api/me');
export default function ProfileScreen(){
 const {token,identityVersion}=useSession();const {lang}=useLanguage();const es=lang==='es';
 const {data,error,loading,refresh}=useCustomerData(load);const [name,setName]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{setName(data?.user.display_name??'')},[data?.user.id,data?.user.display_name,identityVersion]);
 async function save(){
  setSaving(true);
  try{await api('/api/me',{method:'PATCH',body:JSON.stringify({displayName:name.trim(),preferredLanguage:lang})});
   await refresh();Alert.alert('Viva Blue',es?'Perfil guardado.':'Profile saved.');
  }catch(e){Alert.alert('Viva Blue',errorText(e,lang))}finally{setSaving(false)}
 }
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <TitleBar title={es?'Mi perfil':'My profile'} subtitle={es?'Tu nombre y tu idioma preferido.':'Your name and preferred language.'}/>
  {!token?<SignInCard/>:<View style={styles.card}>
   <Text style={styles.body}>{es?'Nombre':'Name'}</Text>
   <TextInput accessibilityLabel={es?'Nombre':'Name'} value={name} onChangeText={setName} maxLength={100} autoComplete="name" style={styles.input}/>
   <Text style={styles.body}>{es?'Idioma: Español':'Language: English'}</Text>
   <Text style={styles.muted}>{es?'Usa el selector de idioma de arriba para cambiarlo.':'Use the language selector above to change your preference.'}</Text>
   <PrimaryButton label={saving?(es?'Guardando…':'Saving…'):(es?'Guardar perfil':'Save profile')} disabled={!data||loading||saving||!name.trim()} onPress={()=>void save()}/>
   <Text style={styles.muted}>{es?'El correo y la contraseña se administran con tu proveedor de acceso seguro.':'Manage your email and password with your secure sign-in provider.'}</Text>
  </View>}
  {error?<><Text accessibilityRole="alert" style={styles.muted}>{errorText(error,lang)}</Text><PrimaryButton label={es?'Reintentar':'Retry'} disabled={loading} onPress={()=>void refresh()}/></>:null}
 </ScrollView>;
}
