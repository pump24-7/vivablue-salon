import {NextResponse} from 'next/server';
import {challenge,discovery,flowCookie,random,redirectUri,seal} from '../../../../src/sso';
export async function GET(){
 try{
  const config=await discovery(),client=process.env.VIVABLUE_OIDC_CLIENT_ID;
  if(!client)throw Error('OIDC client ID not configured');
  const state=random(),nonce=random(),verifier=random();
  const url=new URL(config.authorization_endpoint);
  url.searchParams.set('client_id',client);url.searchParams.set('redirect_uri',redirectUri());
  url.searchParams.set('response_type','code');url.searchParams.set('scope','openid profile email');
  const audience=process.env.VIVABLUE_OIDC_AUDIENCE;
  if(audience)url.searchParams.set('audience',audience);
  url.searchParams.set('state',state);url.searchParams.set('nonce',nonce);
  url.searchParams.set('code_challenge',challenge(verifier));url.searchParams.set('code_challenge_method','S256');
  const res=NextResponse.redirect(url);
  res.cookies.set(flowCookie,await seal({state,nonce,verifier},600),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});
  return res;
 }catch(e){return NextResponse.json({message:String(e)},{status:503})}
}
