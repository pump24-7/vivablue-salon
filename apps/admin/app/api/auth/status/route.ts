import {NextRequest,NextResponse} from 'next/server';
import {authCookie,unseal,type Session} from '../../../../src/sso';
export async function GET(req:NextRequest){
 const session=await unseal<Session>(req.cookies.get(authCookie)?.value);
 return NextResponse.json({signedIn:Boolean(session&&session.expiresAt>Date.now())});
}
