import {NextResponse} from 'next/server';
import {authCookie,flowCookie,sameOriginMutation} from '../../../../src/sso';
export async function POST(req:Request){
 if(!sameOriginMutation(req))return NextResponse.json({message:'Cross-origin request rejected'},{status:403});
 const r=NextResponse.json({signedOut:true},{headers:{'Cache-Control':'no-store'}});r.cookies.delete(authCookie);r.cookies.delete(flowCookie);return r;
}
