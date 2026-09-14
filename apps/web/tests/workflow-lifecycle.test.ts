import 'dotenv/config';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {withDb,db} from '../src/server/db';
import {hrRoute} from '../src/server/hr';
import {workflow} from '../src/server/workflows';
import {actorFromRequest} from '../src/server/auth';
import {tokenHash,hashPassword} from '../src/server/password';
import {runTool} from '../src/server/ai/tools';
import type {Actor} from '../src/server/policy';

const key='lifecycle-'+crypto.randomUUID(),uid=key+'-user',shift=key+'-shift',evening=key+'-evening',assignment=key+'-assignment',cycle=key+'-cycle';
const owned=new Set<string>([key,uid,shift,evening,assignment,cycle]);
const admin:Actor={id:'user-admin',email:'admin@abc.example',role:'SUPER_ADMIN',employee_id:null,capabilities:[]};
const manager:Actor={id:'user-manager',email:'manager@abc.example',role:'MANAGER',employee_id:'NV001',capabilities:[]};
const self:Actor={id:uid,email:uid+'@example.invalid',role:'EMPLOYEE',employee_id:key,capabilities:[]};
const outsider:Actor={id:'user-employee',email:'employee@abc.example',role:'EMPLOYEE',employee_id:'NV002',capabilities:[]};
async function response(actor:Actor,path:string,body?:object,method=body?'POST':'GET'){
 return withDb(()=>hrRoute(new Request('http://127.0.0.1:3000/api/hr/'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),actor));
}
async function call(actor:Actor,path:string,body?:object,method?:string){const result=await(await response(actor,path,body,method)).json();if(result.id)owned.add(result.id);return result;}
async function action(actor:Actor,resource:string,id:string,name:string,input:Record<string,unknown>={}){return withDb(()=>workflow(actor,resource,id,name,input));}

describe('complete business lifecycles with isolated real PostgreSQL records',()=>{
 async function cleanup(){
  const periods=await db().payrollPeriod.findMany({where:{name:{startsWith:'lifecycle-'}},select:{id:true}}),sheets=await db().timesheetPeriod.findMany({where:{name:{startsWith:'lifecycle-'}},select:{id:true}});
  for(const row of [...periods,...sheets])owned.add(row.id);
  await db().$transaction(async tx=>{
   await tx.notification.deleteMany({where:{user_id:{startsWith:'lifecycle-'}}});await tx.session.deleteMany({where:{user_id:{startsWith:'lifecycle-'}}});
   await tx.payrollItem.deleteMany({where:{period_id:{in:periods.map(x=>x.id)}}});await tx.payrollPeriod.deleteMany({where:{id:{in:periods.map(x=>x.id)}}});await tx.timesheetPeriod.deleteMany({where:{id:{in:sheets.map(x=>x.id)}}});
   await tx.attendanceCorrection.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.attendanceEvent.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.attendanceSession.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});
   await tx.leaveLedger.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.leaveRequest.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.leaveBalance.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.overtimeRequest.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});
   await tx.performanceReview.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.reviewCycle.deleteMany({where:{name:{startsWith:'lifecycle-'}}});
   await tx.salaryComponent.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.employmentContract.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});
   await tx.shiftAssignment.deleteMany({where:{employee_id:{startsWith:'lifecycle-'}}});await tx.shift.deleteMany({where:{name:{startsWith:'lifecycle-'}}});
   await tx.auditEvent.deleteMany({where:{OR:[{actor_id:{startsWith:'lifecycle-'}},{resource_id:{in:[...owned]}}]}});await tx.user.deleteMany({where:{id:{startsWith:'lifecycle-'}}});await tx.employee.deleteMany({where:{id:{startsWith:'lifecycle-'}}});
  });
 }
 afterAll(()=>withDb(cleanup));
 beforeAll(()=>withDb(async()=>{
  await cleanup();
  const password=await hashPassword(crypto.randomUUID()+crypto.randomUUID());
  await db().$transaction(async tx=>{
   await tx.employee.create({data:{id:key,code:key,full_name:'Lifecycle test employee',email:self.email,department_id:'dept-1',position_id:'position-1',manager_id:'NV001',hire_date:new Date('2040-01-01'),source:'TEST'}});
   await tx.user.create({data:{id:uid,email:self.email,employee_id:key,role:'EMPLOYEE',capabilities:[],password_hash:password}});
   await tx.shift.createMany({data:[{id:shift,name:shift,start_minute:480,end_minute:1020,break_minutes:60,grace_minutes:5,weekdays:[1,2,3,4,5,6,7],source:'TEST'},{id:evening,name:evening,start_minute:1080,end_minute:1320,break_minutes:0,grace_minutes:0,weekdays:[1,2,3,4,5,6,7],source:'TEST'}]});
   await tx.shiftAssignment.create({data:{id:assignment,employee_id:key,shift_id:shift,starts_on:new Date('2040-01-01'),ends_on:new Date('2040-01-31'),source:'TEST'}});
   await tx.employmentContract.create({data:{id:key+'-contract',employee_id:key,title:key,starts_on:new Date('2040-01-01'),base_salary:'10000000',status:'ACTIVE',source:'TEST'}});owned.add(key+'-contract');
   await tx.reviewCycle.create({data:{id:cycle,name:cycle,starts_on:new Date('2040-01-01'),ends_on:new Date('2040-12-31'),source:'TEST'}});
  });
 }));
 afterAll(()=>withDb(cleanup));

 it('corrects missing checkout, locks scoped timesheet, calculates/locks own payroll and safely reopens',async()=>{
  const attendance=await call(admin,'attendance/manual',{employee_id:key,action:'CHECK_IN',occurred_at:'2040-01-02T08:30:00+07:00',reason:'Lifecycle manual test'});
  const sheet=await call(admin,'timesheets',{name:key+'-sheet',starts_on:'2040-01-01',ends_on:'2040-01-31'});
  await action(admin,'timesheets',sheet.id,'review');await expect(action(admin,'timesheets',sheet.id,'lock')).rejects.toMatchObject({code:'MISSING_CHECKOUT'});
  expect((await call(self,'timesheets/'+sheet.id)).items).toEqual([{employee_id:key,recorded_days:1,worked_minutes:0,late_minutes:30,early_minutes:0,missing_checkout:1}]);
  expect((await call(outsider,'timesheets/'+sheet.id)).items).toEqual([]);
  const correction=await call(self,'corrections',{employee_id:key,attendance_id:attendance.id,requested_in:'2040-01-02T08:00:00+07:00',requested_out:'2040-01-02T17:00:00+07:00',reason:'Forgot checkout in isolated test'});
  await action(self,'corrections',correction.id,'submit');await action(manager,'corrections',correction.id,'approve');
  expect(await call(self,'attendance/'+attendance.id)).toMatchObject({worked_minutes:480,late_minutes:0,source:'MANUAL'});
  expect((await call(self,'timesheets/'+sheet.id)).items[0]).toMatchObject({employee_id:key,worked_minutes:480,missing_checkout:0});
  await expect(action(self,'corrections',correction.id,'cancel')).rejects.toMatchObject({code:'NEW_CORRECTION_REQUIRED'});
  expect(await withDb(()=>db().auditEvent.count({where:{resource_id:attendance.id,action:'correct'}}))).toBe(1);
  await action(admin,'timesheets',sheet.id,'lock');
  await expect(call(admin,'attendance/manual',{employee_id:key,action:'CHECK_IN',occurred_at:'2040-01-03T08:00:00+07:00',reason:'Locked period negative'})).rejects.toMatchObject({code:'TIMESHEET_LOCKED'});
  await call(admin,'payroll-components',{employee_id:key,name:'Test allowance',amount:'100000',kind:'ALLOWANCE',reason:'Lifecycle allowance'});
  const payroll=await call(admin,'payroll',{name:key+'-payroll',timesheet_id:sheet.id});await action(admin,'payroll',payroll.id,'calculate');
  const payReader={...self,capabilities:['payroll:read']};
  expect((await withDb(()=>runTool(payReader,{name:'get_my_payroll',args:{}}))).total).toBe(0);
  await expect(call(self,'payroll/'+payroll.id)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await action(admin,'payroll',payroll.id,'review');await action(admin,'payroll',payroll.id,'lock');
  const own=await call(self,'payroll/'+payroll.id);expect(own.items).toHaveLength(1);expect(own.items[0]).toMatchObject({employee_id:key,worked_minutes:480,allowance_amount:'100000'});
  for(const field of ['base_amount','allowance_amount','adjustment_amount','total_amount'])expect(own.items[0][field]).toMatch(/^-?\d+$/);
  expect(BigInt(own.items[0].total_amount)).toBe(BigInt(own.items[0].base_amount)+BigInt(own.items[0].allowance_amount)+BigInt(own.items[0].adjustment_amount));
  const tool=await withDb(()=>runTool(payReader,{name:'get_my_payroll',args:{}}));expect(tool.total).toBe(1);expect(tool.items[0]).toMatchObject({employee_id:key,period_id:payroll.id});
  const csv=await(await response(self,'payroll-components/export?employee_id='+key)).text();expect(csv).toContain('amount');expect(csv).toContain('100000');expect(csv).not.toContain('NV002');
  expect(await(await response(self,'contracts/export?employee_id='+key)).text()).not.toContain('base_salary');
  await expect(action(admin,'timesheets',sheet.id,'reopen',{reason:'Locked payroll negative'})).rejects.toMatchObject({code:'PAYROLL_LOCKED'});
  await expect(call(admin,'payroll/'+payroll.id,{name:'forbidden'},'PATCH')).rejects.toMatchObject({code:'DRAFT_REQUIRED'});
  await action(admin,'payroll',payroll.id,'reopen',{reason:'Lifecycle reopen'});await action(admin,'timesheets',sheet.id,'reopen',{reason:'Lifecycle source correction'});
  expect(await withDb(()=>db().payrollItem.count({where:{period_id:payroll.id}}))).toBe(0);
 },60000);

 it('keeps draft manager assessment private then publishes after self submission',async()=>{
  const review=await call(self,'performance',{employee_id:key,cycle_id:cycle,self_comment:'My measured work'});
  await call(manager,'performance/'+review.id,{score:4,manager_comment:'Unpublished manager assessment'},'PATCH');
  expect(await call(self,'performance/'+review.id)).not.toHaveProperty('manager_comment');
  expect(await call(self,'performance/'+review.id,{self_comment:'Updated own reflection'},'PATCH')).not.toHaveProperty('score');
  await expect(call(self,'performance/'+review.id,{score:5},'PATCH')).rejects.toMatchObject({code:'MANAGER_FIELDS_DENIED'});
  await expect(action(manager,'performance',review.id,'publish')).rejects.toMatchObject({code:'REVIEW_INCOMPLETE'});
  expect(await action(self,'performance',review.id,'submit')).not.toHaveProperty('manager_comment');
  await action(manager,'performance',review.id,'publish');expect(await call(self,'performance/'+review.id)).toMatchObject({status:'PUBLISHED',score:4,manager_comment:'Unpublished manager assessment'});
  await expect(call(manager,'performance/'+review.id,{score:3},'PATCH')).rejects.toMatchObject({code:'REVIEW_PUBLISHED'});
 });

 it('revalidates changed shift on OT submit and approval before allowing cancel',async()=>{
  const assigned=await call(admin,'schedule',{employee_id:key,shift_id:shift,starts_on:'2040-02-01',ends_on:'2040-12-31'});
  const ot=await call(self,'overtime',{employee_id:key,starts_at:'2040-02-02T18:00:00+07:00',ends_at:'2040-02-02T19:00:00+07:00',reason:'Lifecycle OT request'});
  await call(admin,'schedule/'+assigned.id,{shift_id:evening},'PATCH');await expect(action(self,'overtime',ot.id,'submit')).rejects.toMatchObject({code:'OT_OVERLAPS_REGULAR_SHIFT'});
  await call(admin,'schedule/'+assigned.id,{shift_id:shift},'PATCH');await action(self,'overtime',ot.id,'submit');
  await call(admin,'schedule/'+assigned.id,{shift_id:evening},'PATCH');await expect(action(manager,'overtime',ot.id,'approve')).rejects.toMatchObject({code:'OT_OVERLAPS_REGULAR_SHIFT'});
  await call(admin,'schedule/'+assigned.id,{shift_id:shift},'PATCH');expect(await action(manager,'overtime',ot.id,'approve')).toMatchObject({status:'APPROVED'});
  expect(await action(self,'overtime',ot.id,'cancel')).toMatchObject({status:'CANCELLED'});
 });

 it('allows reasoned balance adjustment without altering usage or another employee scope',async()=>{
  const balance=await call(admin,'leave-balances',{employee_id:key,type_id:'leave-annual',year:2040,granted:12,reason:'Initial lifecycle entitlement'});
  await withDb(()=>db().leaveBalance.update({where:{id:balance.id},data:{used:2}})); // Explicit business-state fixture; never biometric data.
  await expect(call(admin,'leave-balances/'+balance.id,{granted:1,reason:'Below used negative'},'PATCH')).rejects.toMatchObject({code:'GRANT_BELOW_USED'});
  await expect(call(self,'leave-balances/'+balance.id,{granted:99,reason:'Unauthorized increase'},'PATCH')).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  await expect(call(admin,'leave-balances/'+balance.id,{granted:15},'PATCH')).rejects.toThrow();
  expect(await call(admin,'leave-balances/'+balance.id,{granted:15,reason:'Annual adjustment approved'},'PATCH')).toMatchObject({granted:15,used:2});
  await expect(call(admin,'leave-balances/'+balance.id,{year:2041,reason:'Year immutable negative'},'PATCH')).rejects.toMatchObject({code:'BALANCE_PERIOD_IMMUTABLE'});
  expect(await withDb(()=>db().auditEvent.findFirst({where:{resource_id:balance.id,action:'update'},orderBy:{created_at:'desc'}}))).toMatchObject({reason:'Annual adjustment approved'});
 });

 it('owns notification reads and revokes real sessions when an isolated user role changes',async()=>{
  const notice=await withDb(()=>db().notification.findFirst({where:{user_id:uid}}));expect(notice).toBeTruthy();
  await expect(action(outsider,'notifications',notice!.id,'read')).rejects.toMatchObject({code:'PERMISSION_DENIED'});
  expect((await action(self,'notifications',notice!.id,'read')).read_at).not.toBeNull();
  const token=crypto.randomUUID()+crypto.randomUUID(),sessionId=await tokenHash(token);
  await withDb(()=>db().session.create({data:{id:sessionId,user_id:uid,expires_at:new Date(Date.now()+60000)}}));
  const request=new Request('http://127.0.0.1:3000/api/auth/me',{headers:{Cookie:'abc_session='+token}});
  expect(await withDb(()=>actorFromRequest(request))).toMatchObject({id:uid,role:'EMPLOYEE'});
  const changed=await call(admin,'users/'+uid,{role:'MANAGER',capabilities:[]},'PATCH');expect(changed).toMatchObject({role:'MANAGER'});expect(changed).not.toHaveProperty('password_hash');
  await expect(withDb(()=>actorFromRequest(request))).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  expect(await withDb(()=>db().session.count({where:{user_id:uid}}))).toBe(0);
 });
});
