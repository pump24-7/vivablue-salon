import {NextRequest,NextResponse} from 'next/server';
import {authCookie,exchangeAndVerify,flowCookie,redirectUri,seal,unseal,type Flow} from '../../../../src/sso';
export async function GET(req:NextRequest){
 const url=new URL(req.url);const state=url.searchParams.get('state'),code=url.searchParams.get('code');
 const flow=await unseal<Flow>(req.cookies.get(flowCookie)?.value);
 if(!code||!state||!flow||state!==flow.state)return NextResponse.json({message:'Invalid or expired sign-in flow'},{status:401});
 try{
  const session=await exchangeAndVerify(code,flow);
  const res=NextResponse.redirect(new URL('/',redirectUri()));
  res.cookies.set(authCookie,await seal(session,Math.min(3600,Math.ceil((session.expiresAt-Date.now())/1000))),
   {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:3600});
  res.cookies.delete(flowCookie);return res;
 }catch(e){return NextResponse.json({message:'Sign-in failed',detail:String(e)},{status:401})}
}
