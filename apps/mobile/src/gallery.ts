// Official website image references, shown ONLY when EXPO_PUBLIC_DEMO_GALLERY=true.
// They are not republished by the API until the salon explicitly verifies ownership/consent.
export type Look={id:string,image_url:string,caption_en:string,caption_es:string,service_id?:string|null};
export const demoGallery:Look[]=[
 {id:'demo-copper',image_url:'https://vivabluesalon.com/images/b0a8c3e7c5e6e52d5d7d68d15129e7c9.jpg',caption_en:'Copper gloss',caption_es:'Cobrizo brillante'},
 {id:'demo-layers',image_url:'https://vivabluesalon.com/images/514931e4ce2df73526541ade40632e1d.jpg',caption_en:'Movement & layers',caption_es:'Capas y movimiento'},
 {id:'demo-waves',image_url:'https://vivabluesalon.com/images/09dde22c2ba0fa122e20c33d01362f96.jpg',caption_en:'Soft waves',caption_es:'Ondas suaves'},
 {id:'demo-balayage',image_url:'https://vivabluesalon.com/images/3390f4f4d1a92df1cd823363e8ad5595.jpg',caption_en:'Ash blonde balayage',caption_es:'Balayage rubio ceniza'},
 {id:'demo-brows',image_url:'https://vivabluesalon.com/images/cef368f9460f8f864d7312df454dc252.jpg',caption_en:'Defined brows',caption_es:'Cejas definidas'}
];
export const demoGalleryEnabled=process.env.EXPO_PUBLIC_DEMO_GALLERY==='true';
export const photoForService=(slug:string)=>{
 const index:Record<string,number>={'hair-color':0,'haircut':1,'styling':2,'balayage':3,'extensions':3,'keratin':2,'brow-wax':4,'lash-lift':4,'makeup':4};
 return demoGallery[index[slug]??2]?.image_url;
};
