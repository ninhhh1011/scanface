import { createHmac,timingSafeEqual } from 'node:crypto';
import { required } from './config';
import { AppError } from './domain';
import { db } from './db';
export type Scope={actor_id:string;session_id:string;employee_id:string;action:string;exp:number;nonce:string};
export function serviceHeaders(input:Omit<Scope,'exp'|'nonce'>){
  const key=required('SERVICE_AUTH_KEY');
  const scope:Scope={...input,exp:Math.floor(Date.now()/1000)+60,nonce:crypto.randomUUID()};
  const payload=Buffer.from(JSON.stringify(scope)).toString('base64url');
  return {Authorization:`Bearer ${key}`,'X-ABC-Scope':payload+'.'+createHmac('sha256',key).update(payload).digest('base64url')};
}
export async function verifyService(request:Request,action:string,id:string){
  const key=required('SERVICE_AUTH_KEY');
  const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
  if(!equal(request.headers.get('authorization')??'',`Bearer ${key}`))throw new AppError('PERMISSION_DENIED',403);
  const [payload,signature,...extra]=(request.headers.get('x-abc-scope')??'').split('.');
  if(!payload||!signature||extra.length||!equal(signature,createHmac('sha256',key).update(payload).digest('base64url')))throw new AppError('INVALID_SCOPE',403);
  let scope:Scope;try{scope=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw new AppError('INVALID_SCOPE',403);}
  const now=Date.now()/1000;
  if(scope.action!==action||scope.employee_id!==id||scope.exp<now||scope.exp>now+90||!scope.nonce||scope.actor_id!=='ingestion-worker'||scope.session_id!=='ingestion-worker')throw new AppError('INVALID_SCOPE',403);
  const rows=await db().$queryRaw<{nonce:string}[]>`INSERT INTO service_nonces(nonce,expires_at) VALUES(${scope.nonce},${new Date(scope.exp*1000)}) ON CONFLICT DO NOTHING RETURNING nonce`;
  if(!rows.length)throw new AppError('REPLAY_DENIED',409);
}
