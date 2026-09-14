import 'dotenv/config';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { withDb,db } from '../src/server/db';
import { hrRoute } from '../src/server/hr';
import { workflow } from '../src/server/workflows';
import type { Actor } from '../src/server/policy';
const origin='http://127.0.0.1:3000';
const admin:Actor={id:'user-admin',email:'admin@abc.example',role:'SUPER_ADMIN',employee_id:null,capabilities:[]};
const employee:Actor={id:'user-employee',email:'employee@abc.example',role:'EMPLOYEE',employee_id:'NV002',capabilities:[]};
const manager:Actor={id:'user-manager',email:'manager@abc.example',role:'MANAGER',employee_id:'NV001',capabilities:[]};
const testId='test-hr-'+crypto.randomUUID();const created:string[]=[],imported:string[]=[];
async function call(actor:Actor,path:string,body?:unknown,method=body?'POST':'GET'){
 const req=new Request(origin+'/api/hr/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 return withDb(async()=>{const response=await hrRoute(req,actor);return response.json();});
}
describe('real PostgreSQL HR workflows',()=>{
 beforeAll(async()=>{await withDb(async()=>{await db().employee.create({data:{id:testId,code:testId,full_name:'Nhân viên kiểm thử tạm',email:testId+'@example.invalid',department_id:'dept-1',position_id:'position-2',manager_id:'NV001',hire_date:new Date('2026-01-01'),source:'TEST'}});await db().shiftAssignment.create({data:{id:testId+'-shift',employee_id:testId,shift_id:'shift-office',starts_on:new Date('2026-01-01'),ends_on:new Date('2026-12-31'),source:'TEST'}});await db().leaveBalance.create({data:{id:testId+'-balance',employee_id:testId,type_id:'leave-annual',year:2026,granted:12}});});});
 afterAll(async()=>{await withDb(async()=>{const client=db();await client.notification.deleteMany({where:{title:{startsWith:'test-hr-'}}});await client.leaveLedger.deleteMany({where:{employee_id:testId}});await client.leaveRequest.deleteMany({where:{employee_id:testId}});await client.attendanceEvent.deleteMany({where:{employee_id:testId}});await client.attendanceSession.deleteMany({where:{employee_id:testId}});await client.shiftAssignment.deleteMany({where:{employee_id:testId}});await client.leaveBalance.deleteMany({where:{employee_id:testId}});await client.employee.delete({where:{id:testId}});await client.leaveBalance.deleteMany({where:{employee_id:{in:imported}}});await client.employee.deleteMany({where:{id:{in:imported}}});await client.department.deleteMany({where:{id:{in:created}}});await client.auditEvent.deleteMany({where:{OR:[{resource_id:testId},{resource_id:{in:[...created,...imported]}},{resource_id:{startsWith:testId}}]}});});});
 it('employee lists only self and manager lists only direct reports',async()=>{
  expect((await call(employee,'employees')).items.map((x:{id:string})=>x.id)).toEqual(['NV002']);
  const ids=(await call(manager,'employees?page_size=100')).items.map((x:{id:string})=>x.id);expect(ids).toContain('NV005');expect(ids).not.toContain('NV006');
  await expect(call(employee,'employees/NV003')).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await expect(call(manager,'attendance?employee_id=NV006')).resolves.toMatchObject({total:0});
 });
 it('protects salary and system data independent of UI',async()=>{
  const result=await call(manager,'contracts');expect(result.items.every((x:Record<string,unknown>)=>!('base_salary'in x))).toBe(true);
  await expect(call(employee,'users')).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await expect(call(employee,'departments',{name:'Forbidden'})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 });
 it('writes and reads transactionally then denies assignment overlap',async()=>{
  const department=await call(admin,'departments',{name:testId});created.push(department.id);
  expect((await call(admin,'departments/'+department.id)).name).toBe(testId);
  await expect(call(admin,'schedule',{employee_id:testId,shift_id:'shift-office',starts_on:'2026-09-01',ends_on:'2026-09-30'})).rejects.toThrow();
 });
 it('duplicate check-in is rejected without toggle or duplicate event',async()=>{
  const input={employee_id:testId,action:'CHECK_IN',occurred_at:'2026-09-11T01:06:00Z',reason:'Integration test manual source'};
  const results=await Promise.allSettled([call(admin,'attendance/manual',input),call(admin,'attendance/manual',input)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const record=(await call(manager,'attendance?employee_id='+testId)).items[0];expect(record.check_out).toBeNull();expect(record.source).toBe('MANUAL');
  const out=await call(admin,'attendance/manual',{...input,action:'CHECK_OUT',occurred_at:'2026-09-11T10:00:00Z'});expect(out.worked_minutes).toBe(474);
 });
 it('approval is atomic and ledger reverses exactly once on cancellation',async()=>{
  const leave=await call(admin,'leave',{employee_id:testId,type_id:'leave-annual',starts_on:'2026-10-05',ends_on:'2026-10-06',reason:'Integration test leave'});
  await withDb(()=>workflow(admin,'leave',leave.id,'submit',{}));
  const result=await Promise.allSettled([withDb(()=>workflow(manager,'leave',leave.id,'approve',{})),withDb(()=>workflow(manager,'leave',leave.id,'approve',{}))]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await withDb(()=>db().leaveBalance.findUniqueOrThrow({where:{id:testId+'-balance'}}))).toMatchObject({used:2});
  await withDb(()=>workflow(admin,'leave',leave.id,'cancel',{}));
  expect(await withDb(()=>db().leaveBalance.findUniqueOrThrow({where:{id:testId+'-balance'}}))).toMatchObject({used:0});
 });
 it('CSV preview and explicit commit persist valid employees once',async()=>{
  const code='CSV-'+testId,email=code.toLowerCase()+'@example.invalid';
  const csv='code,full_name,email,department_id,position_id,hire_date,manager_id\r\n'+[code,'CSV imported temporary employee',email,'dept-1','position-2','2026-01-01','NV001'].join(',');
  expect(await call(admin,'employees/import',{csv,commit:false})).toMatchObject({valid:true});
  expect(await call(admin,'employees/import',{csv,commit:true})).toMatchObject({committed:1});
  const record=await withDb(()=>db().employee.findUniqueOrThrow({where:{code}}));imported.push(record.id);
  expect(record.email).toBe(email);
  expect((await call(manager,'employees/'+record.id)).full_name).toBe('CSV imported temporary employee');
  await expect(call(admin,'employees/import',{csv,commit:true})).rejects.toMatchObject({code:'CSV_VALIDATION_FAILED'});
 });
 it('self approval and forged employee updates are rejected',async()=>{
  const self={...admin,employee_id:testId};
  const leave=await call(admin,'leave',{employee_id:testId,type_id:'leave-annual',starts_on:'2026-10-07',ends_on:'2026-10-07',reason:'Self approval negative'});
  await withDb(()=>workflow(admin,'leave',leave.id,'submit',{}));
  await expect(withDb(()=>workflow(self,'leave',leave.id,'approve',{}))).rejects.toMatchObject({code:'SELF_APPROVAL_DENIED'});
  await expect(call(employee,'leave/'+leave.id,{reason:'attacker'},'PATCH')).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 });
});
