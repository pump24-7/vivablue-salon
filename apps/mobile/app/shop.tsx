import React,{useEffect,useState} from 'react';
import {Image,ScrollView,Text,View} from 'react-native';
import {useLanguage,errorText} from '../src/language';
import {publicApi} from '../src/api';
import {styles,theme} from '../src/theme';
import {TitleBar,EmptyState} from '../src/widgets';
type Product={id:string,name:string,description:string,image_url:string|null,ingredients_note:string|null,allergy_caution:string|null,stock_on_hand:number,unit_price_cents:number|null};
export default function Shop(){
 const {lang}=useLanguage();const es=lang==='es';
 const [products,setProducts]=useState<Product[]>([]),[message,setMessage]=useState('');
 useEffect(()=>{publicApi<{products:Product[]}>('/api/shop').then(x=>setProducts(x.products)).catch(e=>setMessage(errorText(e,lang)))},[]);
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title={es?'Esenciales del salón ♧':'Salon essentials ♧'} subtitle={es?'Productos profesionales y disponibilidad. Compra en el salón.':'Professional products, details and availability. Purchase in salon; app checkout is not yet enabled.'}/>
  {products.length?products.map(x=><View key={x.id} style={styles.card}>
   {x.image_url?<Image source={{uri:x.image_url}} style={styles.photo}/>:<View style={[styles.photo,{alignItems:'center',justifyContent:'center',backgroundColor:theme.mint}]}><Text style={{fontSize:55}}>✿</Text></View>}
   <Text style={styles.subheading}>{x.name}</Text><Text style={styles.body}>{x.description}</Text>
   <Text style={styles.muted}>{x.stock_on_hand} {es?'en existencia':'in stock'} · {x.unit_price_cents==null?(es?'Consulta el precio al salón':'Ask salon for price'):(es?'Precio $':'Price $')+(x.unit_price_cents/100).toFixed(2)}</Text>
   {x.ingredients_note?<Text style={[styles.muted,{marginTop:10}]}>{es?'Ingredientes':'Ingredients'}: {x.ingredients_note}</Text>:null}
   {x.allergy_caution?<Text style={[styles.muted,{marginTop:7,color:'#96535e'}]}>{es?'Nota de sensibilidad':'Sensitivity note'}: {x.allergy_caution}</Text>:null}
  </View>):<EmptyState message={es?'Los productos aprobados por el salón aparecerán aquí cuando estén disponibles.':'Salon-approved retail inventory will appear here when available.'}/>}
  {message?<Text style={styles.muted}>{message}</Text>:null}
 </ScrollView>;
}
