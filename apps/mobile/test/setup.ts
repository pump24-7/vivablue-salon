jest.mock('expo-secure-store',()=>{
 const data=new Map<string,string>();
 return {getItemAsync:jest.fn(async(key:string)=>data.get(key)??null),
  setItemAsync:jest.fn(async(key:string,value:string)=>{data.set(key,value)}),
  deleteItemAsync:jest.fn(async(key:string)=>{data.delete(key)})};
});
jest.mock('expo-router',()=>{
 const React=require('react');
 return {router:{push:jest.fn(),replace:jest.fn()},
  useLocalSearchParams:jest.fn(()=>({serviceId:'service-1'})),
  useFocusEffect:(callback:()=>void)=>React.useEffect(callback,[callback])};
});
