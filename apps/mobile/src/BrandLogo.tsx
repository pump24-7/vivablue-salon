import React,{useState} from 'react';
import {Image,Text,View} from 'react-native';
import {VIVA_BLUE_LOGO_URL} from './brand';
import {theme} from './theme';
export function BrandLogo({compact=false}:{compact?:boolean}){
 const [failed,setFailed]=useState(false);
 const width=compact?142:190,height=compact?67:95;
 return <View accessibilityLabel="Viva Blue Salon" style={{width,height,justifyContent:'center'}}>
  {failed?<Text style={{color:theme.blue,fontSize:compact?22:28,fontWeight:'800',fontStyle:'italic'}}>Viva Blue Salon ✿</Text>:
   <Image source={{uri:VIVA_BLUE_LOGO_URL}} onError={()=>setFailed(true)}
    resizeMode="contain" accessibilityLabel="Official Viva Blue Salon logo" style={{width,height}}/>}
 </View>;
}
