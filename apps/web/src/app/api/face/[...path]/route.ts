import { z } from 'zod';
import { api } from '../../../../server/http';
import { actorFromRequest,rateLimit } from '../../../../server/auth';
import { authorizeEmployee,can } from '../../../../server/policy';
import { db } from '../../../../server/db';
import { config } from '../../../../server/config';
import { serviceHeaders } from '../../../../server/service-auth';
import { AppError } from '../../../../server/domain';
import { locked,attendance } from '../../../../server/workflows';
const handler=api(async request=>{
 const actor=await actorFromRequest(request);await rateLimit('face:'+actor.id,60,600);
 const path=new URL(request.url).pathname.slice('/api/face/'.length);
 if(path==='attendance'&&request.method==='POST'){
  const input=z.object({proof_id:z.string().max(100),action:z.enum(['CHECK_IN','CHECK_OUT'])}).strict().parse(await request.json());
  return Response.json(await locked(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(734901)`;
   const proof=await tx.faceVerification.findUnique({where:{id:input.proof_id}});
   if(!proof||proof.session_id!==actor.session_id||proof.action!==input.action||proof.employee_id!==actor.employee_id)throw new AppError('INVALID_PROOF',403);
   if(proof.consumed_at)throw new AppError('PROOF_ALREADY_USED',409);
   if(proof.expires_at<new Date())throw new AppError('PROOF_EXPIRED',409);
   const profile=await tx.faceProfile.findUnique({where:{employee_id:proof.employee_id}});if(profile?.status!=='ENROLLED'||profile.model_version!==proof.model_version)throw new AppError('PROFILE_REVOKED',409);
   await tx.faceVerification.update({where:{id:proof.id},data:{consumed_at:new Date()}});
   return attendance(tx,actor,{employee_id:proof.employee_id,action:input.action,occurred_at:new Date(),source:'FACE',proof_id:proof.id});
  },actor),{status:201});
 }
 let input:Record<string,unknown>={},employee_id='',action='';
 if(path.startsWith('profiles/')&&request.method==='DELETE'){employee_id=path.split('/')[1];action='DELETE';if(!can(actor,'hr:write')&&employee_id!==actor.employee_id)throw new AppError('PERMISSION_DENIED',403);}
 else if(request.method==='POST'&&['challenge','enroll','verify'].includes(path)){
  input=await request.json();
  if(path==='challenge'){
   const data=z.object({employee_id:z.string().optional(),action:z.enum(['ENROLL','CHECK_IN','CHECK_OUT']),consent:z.literal(true)}).strict().parse(input);
   employee_id=data.employee_id??actor.employee_id??'';action=data.action;
   if(action!=='ENROLL'&&employee_id!==actor.employee_id)throw new AppError('SELF_SCAN_REQUIRED',403);
   if(action==='ENROLL'&&!can(actor,'hr:write')&&employee_id!==actor.employee_id)throw new AppError('PERMISSION_DENIED',403);
   input={...data,employee_id,session_id:actor.session_id,actor_id:actor.id};
  }else{
   const data=z.object({challenge_id:z.string(),employee_id:z.string().optional(),frames:z.array(z.object({image:z.string().max(1_500_000),captured_at:z.number().finite()}).strict()).min(5).max(10)}).strict().parse(input);
   const challenge=await db().faceChallenge.findUnique({where:{id:data.challenge_id}});
   if(!challenge||challenge.session_id!==actor.session_id||challenge.actor_id!==actor.id)throw new AppError('INVALID_CHALLENGE',403);
   employee_id=challenge.employee_id;action=challenge.action;
   if(path==='enroll'&&action!=='ENROLL'||path==='verify'&&action==='ENROLL')throw new AppError('INVALID_ACTION');
   if(data.employee_id&&data.employee_id!==employee_id)throw new AppError('INVALID_EMPLOYEE',403);
   input=path==='enroll'?{...data,employee_id}:{challenge_id:data.challenge_id,frames:data.frames};
  }
 }else throw new AppError('NOT_FOUND',404);
 await authorizeEmployee(actor,employee_id);
 const url=config('AI_SERVICE_URL');if(!url)throw new AppError('SERVICE_UNAVAILABLE',503);
 try{
  const response=await fetch(`${url}/face/${path}`,{method:request.method,headers:{...serviceHeaders({actor_id:actor.id,session_id:actor.session_id!,employee_id,action}),'Content-Type':'application/json'},body:request.method==='DELETE'?undefined:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
  const body=await response.json();return Response.json(body,{status:response.status});
 }catch{throw new AppError('SERVICE_UNAVAILABLE',503);}
});
export {handler as POST,handler as DELETE};
