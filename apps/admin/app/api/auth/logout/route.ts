import {NextResponse} from 'next/server';
import {authCookie,flowCookie} from '../../../../src/sso';
export async function POST(){
 const r=NextResponse.json({signedOut:true});r.cookies.delete(authCookie);r.cookies.delete(flowCookie);return r;
}
