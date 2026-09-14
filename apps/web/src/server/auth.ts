import { z } from 'zod';
import { db } from './db';
import { config } from './config';
import { AppError } from './domain';
import { audit } from './audit';
import { hashPassword,tokenHash,verifyPassword } from './password';
import type { Actor } from './policy';
export async function rateLimit(key:string,limit:number,seconds:number){
  const id=await tokenHash(key);const expires=new Date(Date.now()+seconds*1000);
  const rows=await db().$queryRaw<{hits:number}[]>`INSERT INTO rate_limits(id,hits,expires_at) VALUES(${id},1,${expires}) ON CONFLICT(id) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN ${expires} ELSE rate_limits.expires_at END RETURNING hits`;
  if(rows[0].hits>limit)throw new AppError('RATE_LIMITED',429);
}
export async function actorFromRequest(request:Request):Promise<Actor>{
  const raw=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('abc_session='))?.slice(12);
  if(!raw||raw.length>150)throw new AppError('UNAUTHENTICATED',401);
  const session=await db().session.findUnique({where:{id:await tokenHash(raw)}});
  if(!session||session.expires_at<new Date())throw new AppError('UNAUTHENTICATED',401);
  const user=await db().user.findUnique({where:{id:session.user_id},select:{id:true,email:true,employee_id:true,role:true,capabilities:true,locked:true}});
  if(!user||user.locked)throw new AppError('UNAUTHENTICATED',401);
  const {locked:_,...actor}=user;
  return {...actor,session_id:session.id};
}
export function checkOrigin(request:Request){if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('origin')!==new URL(config('APP_URL')).origin)throw new AppError('ORIGIN_DENIED',403);}
function cookie(value:string,maxAge:number){return `abc_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config('APP_URL').startsWith('https:')?'; Secure':''}`;}
export async function authRoute(request:Request,action:string){
  if(action==='login'&&request.method==='POST'){
    const input=z.object({email:z.email().max(254),password:z.string().min(1).max(128)}).strict().parse(await request.json());
    await rateLimit('login:'+input.email.toLowerCase(),10,900);
    await rateLimit('login-ip:'+(request.headers.get('cf-connecting-ip')??'local'),60,900);
    const user=await db().user.findUnique({where:{email:input.email.toLowerCase()}});
    if(!user||user.locked||!await verifyPassword(input.password,user.password_hash)){
      await audit(db(),null,'login','user',null,{result:'DENIED',reason:'INVALID_CREDENTIALS'});
      throw new AppError('INVALID_CREDENTIALS',401,'Email hoặc mật khẩu không đúng.');
    }
    const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const upgradedHash=user.password_hash.startsWith('scrypt:')?await hashPassword(input.password):null;
    await db().$transaction(async tx=>{
      const current=await tx.$queryRaw<{password_hash:string;locked:boolean}[]>`SELECT password_hash,locked FROM users WHERE id=${user.id} FOR UPDATE`;
      if(!current[0]||current[0].locked||current[0].password_hash!==user.password_hash)throw new AppError('INVALID_CREDENTIALS',401);
      if(upgradedHash)await tx.user.update({where:{id:user.id},data:{password_hash:upgradedHash}});
      await tx.session.create({data:{id:await tokenHash(token),user_id:user.id,expires_at:new Date(Date.now()+8*3600_000)}});await audit(tx,user,'login','user',user.id);
    });
    return Response.json({ok:true},{headers:{'Set-Cookie':cookie(token,8*3600)}});
  }
  const actor=await actorFromRequest(request);
  if(action==='me'&&request.method==='GET'){const {session_id:_,...user}=actor;return Response.json({user});}
  if(action==='logout'&&request.method==='POST'){
    await db().$transaction(async tx=>{await tx.session.deleteMany({where:{id:actor.session_id}});await audit(tx,actor,'logout','user',actor.id);});
    return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0)}});
  }
  if(action==='change-password'&&request.method==='POST'){
    const input=z.object({current_password:z.string().max(128),new_password:z.string().min(12).max(128)}).strict().parse(await request.json());
    const user=await db().user.findUniqueOrThrow({where:{id:actor.id}});
    if(!await verifyPassword(input.current_password,user.password_hash))throw new AppError('INVALID_CREDENTIALS',401);
    const hash=await hashPassword(input.new_password);
    await db().$transaction(async tx=>{
      const current=await tx.$queryRaw<{password_hash:string;locked:boolean}[]>`SELECT password_hash,locked FROM users WHERE id=${actor.id} FOR UPDATE`;
      if(!current[0]||current[0].locked||current[0].password_hash!==user.password_hash||!await tx.session.findUnique({where:{id:actor.session_id}}))throw new AppError('SESSION_REVOKED',401);
      await tx.user.update({where:{id:actor.id},data:{password_hash:hash}});await tx.session.deleteMany({where:{user_id:actor.id}});await audit(tx,actor,'change-password','user',actor.id);
    });
    return Response.json({ok:true},{headers:{'Set-Cookie':cookie('',0)}});
  }
  throw new AppError('NOT_FOUND',404);
}
