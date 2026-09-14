import { api } from '../../../server/http';
import { actorFromRequest } from '../../../server/auth';
import { requireCapability } from '../../../server/policy';
import { db } from '../../../server/db';
import { config } from '../../../server/config';
export const GET=api(async request=>{
  const actor=await actorFromRequest(request);requireCapability(actor,'system:manage');
  const vector=await db().$queryRaw<{distance:number}[]>`SELECT '[1,0,0]'::vector <=> '[1,0,0]'::vector AS distance`;
  const count=await db().employee.count();
  let python={status:'SERVICE_UNAVAILABLE'};
    try{const response=await fetch(config('AI_SERVICE_URL')+'/readyz',{headers:{Authorization:`Bearer ${config('SERVICE_AUTH_KEY')}`},signal:AbortSignal.timeout(3000)});python=await response.json();}catch{/* Report availability, never impersonate inference. */}
  return Response.json({runtime:'workers',database:true,vector_distance:vector[0].distance,employees:count,python,chat:config('LLM_API_KEY')?'CONFIGURED_NOT_VERIFIED':'AI_NOT_CONFIGURED'});
});
