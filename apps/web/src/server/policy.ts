import { db } from './db';
import { AppError } from './domain';
export type Actor={id:string;email:string;role:string;employee_id:string|null;capabilities:string[];session_id?:string};
export function can(actor:Actor,capability:string){return actor.role==='SUPER_ADMIN'||actor.capabilities.includes(capability);}
export function requireCapability(actor:Actor,capability:string){if(!can(actor,capability))throw new AppError('PERMISSION_DENIED',403);}
export function employeeScope(actor:Actor){
  if(can(actor,'hr:read'))return {};
  if(!actor.employee_id)return {id:'__none__'};
  return actor.role==='MANAGER'?{OR:[{id:actor.employee_id},{manager_id:actor.employee_id}]}:{id:actor.employee_id};
}
export async function employeeIds(actor:Actor){return (await db().employee.findMany({where:employeeScope(actor),select:{id:true}})).map(x=>x.id);}
export async function authorizeEmployee(actor:Actor,id:string){
  const employee=await db().employee.findFirst({where:{AND:[{id},employeeScope(actor)]}});
  if(!employee)throw new AppError('PERMISSION_DENIED',403);
  return employee;
}
export async function authorizeApproval(actor:Actor,employee_id:string){
  if(actor.employee_id===employee_id)throw new AppError('SELF_APPROVAL_DENIED',403);
  const employee=await authorizeEmployee(actor,employee_id);
  if(!can(actor,'hr:write')&&!(actor.role==='MANAGER'&&employee.manager_id===actor.employee_id))throw new AppError('PERMISSION_DENIED',403);
}
