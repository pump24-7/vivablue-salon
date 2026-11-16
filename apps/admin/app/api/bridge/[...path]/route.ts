import {NextRequest,NextResponse} from 'next/server';
import {authCookie,unseal,validSession,sameOriginMutation,type Session} from '../../../../src/sso';
type Ctx={params:Promise<{path:string[]}>};
async function proxy(req:NextRequest,ctx:Ctx){
 const session=await unseal<Session>(req.cookies.get(authCookie)?.value);
 if(!validSession(session))return NextResponse.json({message:'Organization sign-in required'},{status:401,headers:{'Cache-Control':'no-store'}});
 const {path}=await ctx.params;
 const allowed=(path[0]==='admin')||(path.length===1&&['catalog','stylists','lookbook'].includes(path[0]));
 if(!allowed||path.some(p=>!/^[-a-zA-Z0-9_]+$/.test(p)))return NextResponse.json({message:'Route not permitted'},{status:403});
 if(req.method!=='GET'){
  if(!sameOriginMutation(req))
   return NextResponse.json({message:'Cross-origin request rejected'},{status:403});
 }
 const base=process.env.VIVABLUE_API_ORIGIN;
 if(!base) return NextResponse.json({message:'API origin not configured'},{status:503});
 const pathName='/api/'+path.join('/');
 const target=new URL(pathName,base);target.search=req.nextUrl.search;
 try{
 const requestBody=req.method==='GET'?undefined:await req.text();
 if(requestBody&&Buffer.byteLength(requestBody)>128*1024)return NextResponse.json({message:'Request too large'},{status:413});
 const res=await fetch(target,{method:req.method,headers:{Authorization:'Bearer '+session.token,
  ...(requestBody?{'Content-Type':'application/json'}:{})},
  ...(requestBody?{body:requestBody}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 const body=await res.text();
 return new NextResponse(body,{status:res.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{return NextResponse.json({message:'Salon API unavailable. Refresh before retrying a change.'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
export const GET=proxy;
export const POST=proxy;
export const PATCH=proxy;
export const DELETE=proxy;
