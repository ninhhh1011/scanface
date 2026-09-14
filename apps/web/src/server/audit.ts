import type { Prisma } from '@prisma/client';
import type { Actor } from './policy';
export async function audit(tx:Prisma.TransactionClient,actor:Actor|null,action:string,resource_type:string,resource_id:string|null,details:{result?:string;reason?:string;before?:Prisma.InputJsonValue;after?:Prisma.InputJsonValue}={}){
  await tx.auditEvent.create({data:{actor_id:actor?.id,action,resource_type,resource_id,result:details.result??'SUCCESS',reason:details.reason,request_id:crypto.randomUUID(),before:details.before,after:details.after}});
}
