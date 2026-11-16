import {NextRequest,NextResponse} from 'next/server';
import {authCookie,unseal,validSession,type Session} from '../../../../src/sso';
export async function GET(req:NextRequest){
 const session=await unseal<Session>(req.cookies.get(authCookie)?.value);
 return NextResponse.json({signedIn:validSession(session)},{headers:{'Cache-Control':'no-store'}});
}
