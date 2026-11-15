import React,{useEffect,useState} from 'react';
import {Image,ScrollView,Text,View} from 'react-native';
import {publicApi} from '../src/api';
import {styles,theme} from '../src/theme';
import {TitleBar,EmptyState} from '../src/widgets';
type Product={id:string,name:string,description:string,image_url:string|null,ingredients_note:string|null,allergy_caution:string|null,stock_on_hand:number,unit_price_cents:number|null};
export default function Shop(){
 const [products,setProducts]=useState<Product[]>([]),[message,setMessage]=useState('');
 useEffect(()=>{publicApi<{products:Product[]}>('/api/shop').then(x=>setProducts(x.products)).catch(e=>setMessage(String(e)))},[]);
 return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <TitleBar title="Salon essentials ♧" subtitle="Professional products, details and availability. Purchase in salon; app checkout is not yet enabled."/>
  {products.length?products.map(x=><View key={x.id} style={styles.card}>
   {x.image_url?<Image source={{uri:x.image_url}} style={styles.photo}/>:<View style={[styles.photo,{alignItems:'center',justifyContent:'center',backgroundColor:theme.mint}]}><Text style={{fontSize:55}}>✿</Text></View>}
   <Text style={styles.subheading}>{x.name}</Text><Text style={styles.body}>{x.description}</Text>
   <Text style={styles.muted}>{x.stock_on_hand} in stock · {x.unit_price_cents==null?'Ask salon for price':'Price $'+(x.unit_price_cents/100).toFixed(2)}</Text>
   {x.ingredients_note?<Text style={[styles.muted,{marginTop:10}]}>Ingredients: {x.ingredients_note}</Text>:null}
   {x.allergy_caution?<Text style={[styles.muted,{marginTop:7,color:'#96535e'}]}>Sensitivity note: {x.allergy_caution}</Text>:null}
  </View>):<EmptyState message="Salon-approved retail inventory will appear here when available."/>}
  {message?<Text style={styles.muted}>{message}</Text>:null}
 </ScrollView>;
}
