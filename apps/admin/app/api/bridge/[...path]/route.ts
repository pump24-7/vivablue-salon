import {NextRequest,NextResponse} from 'next/server';
import {authCookie,unseal,type Session} from '../../../../src/sso';
type Ctx={params:Promise<{path:string[]}>};
async function proxy(req:NextRequest,ctx:Ctx){
 const session=await unseal<Session>(req.cookies.get(authCookie)?.value);
 if(!session||session.expiresAt<Date.now())return NextResponse.json({message:'Organization sign-in required'},{status:401});
 const {path}=await ctx.params;
 const allowed=(path[0]==='admin')||(path.length===1&&['catalog','stylists','lookbook'].includes(path[0]));
 if(!allowed||path.some(p=>!/^[-a-zA-Z0-9_]+$/.test(p)))return NextResponse.json({message:'Route not permitted'},{status:403});
 if(req.method!=='GET'){
  const origin=req.headers.get('origin');
  if(!origin||origin!==new URL(req.url).origin||req.headers.get('x-vivablue-request')!=='admin')
   return NextResponse.json({message:'Cross-origin request rejected'},{status:403});
 }
 const base=process.env.VIVABLUE_API_ORIGIN;
 if(!base) return NextResponse.json({message:'API origin not configured'},{status:503});
 const pathName='/api/'+path.join('/');
 const target=new URL(pathName,base);target.search=req.nextUrl.search;
 const res=await fetch(target,{method:req.method,headers:{Authorization:'Bearer '+session.token,
  ...(req.method==='GET'?{}:{'Content-Type':'application/json'})},
  ...(req.method==='GET'?{}:{body:await req.text()}),cache:'no-store'});
 const body=await res.text();
 return new NextResponse(body,{status:res.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
export const GET=proxy;
export const POST=proxy;
