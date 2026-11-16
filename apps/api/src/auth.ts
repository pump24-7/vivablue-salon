import {createRemoteJWKSet,jwtVerify,type JWTPayload} from 'jose';
import type {FastifyReply,FastifyRequest} from 'fastify';
import {pool} from './db.js';
import type {Config} from './config.js';
export type Identity={userId:string,subject:string,role:'customer'|'stylist'|'manager'|'admin'};
declare module 'fastify'{interface FastifyRequest {identity?:Identity}}
export function authentication(config:Config){
 const jwks=createRemoteJWKSet(new URL(config.AUTH_JWKS_URL));
 return async function requireAuth(req:FastifyRequest,reply:FastifyReply){
  const header=req.headers.authorization;
  if(!header?.startsWith('Bearer ')){reply.code(401).send({error:'Login required'});return}
  let payload:JWTPayload;
  try{
   ({payload}=await jwtVerify(header.slice(7),jwks,{issuer:config.AUTH_ISSUER,audience:config.AUTH_AUDIENCE}));
   if(!payload.sub)throw Error('Missing subject');
  }catch{reply.code(401).send({error:'Invalid or expired session'});return}
  // A database outage is a server failure, not proof that the customer's token expired.
  const email=typeof payload.email==='string'?payload.email:null;
  const r=await pool.query<{id:string,role:Identity['role']}>(
    `INSERT INTO users(auth_subject,email) VALUES($1,$2)
     ON CONFLICT(auth_subject) DO UPDATE SET email=COALESCE(EXCLUDED.email,users.email)
     RETURNING id,role`,[payload.sub,email]);
  req.identity={userId:r.rows[0].id,subject:payload.sub!,role:r.rows[0].role};
 }
}
export async function managerOnly(req:FastifyRequest,reply:FastifyReply){
 if(req.identity?.role!=='manager'&&req.identity?.role!=='admin')return reply.code(403).send({error:'Manager permissions required'});
}
