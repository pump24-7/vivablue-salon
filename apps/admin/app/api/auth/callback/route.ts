import {NextRequest,NextResponse} from 'next/server';
import {authCookie,exchangeAndVerify,flowCookie,redirectUri,seal,unseal,type Flow} from '../../../../src/sso';
export async function GET(req:NextRequest){
 const url=new URL(req.url);const state=url.searchParams.get('state'),code=url.searchParams.get('code');
 const flow=await unseal<Flow>(req.cookies.get(flowCookie)?.value);
 if(!code||!state||!flow||state!==flow.state)return NextResponse.json({message:'Invalid or expired sign-in flow'},{status:401});
 try{
  const session=await exchangeAndVerify(code,flow);
  const res=NextResponse.redirect(new URL('/',redirectUri()));
  const life=Math.max(1,Math.floor((session.expiresAt-Date.now())/1000));
  res.cookies.set(authCookie,await seal(session,life),
   {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:life});
  res.cookies.delete(flowCookie);return res;
 }catch{const res=NextResponse.json({message:'Sign-in failed. Start a new organization sign-in.'},{status:401});res.cookies.delete(flowCookie);return res}
}
