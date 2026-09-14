import 'dotenv/config';
import { describe,it,expect } from 'vitest';
import { withDb,db } from '../src/server/db';
import { projectRow } from '../src/server/resources';
import { locked,validateWrite,workflow } from '../src/server/workflows';
import { authorizeFile,deleteFile } from '../src/server/files';
import { businessSettings,settingSchemas } from '../src/server/business-settings';
import { hrRoute } from '../src/server/hr';
import type { Actor } from '../src/server/policy';
const admin:Actor={id:'user-admin',email:'admin@abc.example',role:'SUPER_ADMIN',employee_id:null,capabilities:[]};
const limited:Actor={id:'user-hr',email:'hr@abc.example',role:'HR_ADMIN',employee_id:'NV006',capabilities:['hr:read','hr:write']};
const employee:Actor={id:'user-employee',email:'employee@abc.example',role:'EMPLOYEE',employee_id:'NV002',capabilities:[]};
describe('review regressions with real PostgreSQL',()=>{
 it('projects salary and unpublished review fields on mutation responses',()=>{
  expect(projectRow(limited,'contracts',{id:'x',base_salary:'999'})).not.toHaveProperty('base_salary');
  expect(projectRow(employee,'performance',{id:'x',employee_id:'NV002',status:'SUBMITTED',score:5,manager_comment:'Private until publish'})).not.toHaveProperty('manager_comment');
 });
 it('limited HR PATCH contract cannot leak salary and cannot bypass reasoned termination',()=>withDb(async()=>{
  const id=crypto.randomUUID();await db().employmentContract.create({data:{id,employee_id:'NV002',title:'Regression temporary',starts_on:new Date('2026-01-01'),base_salary:'1000000'}});
  try{
   const response=await hrRoute(new Request('http://127.0.0.1:3000/api/hr/contracts/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Updated temporary'})}),limited);
   expect(await response.json()).not.toHaveProperty('base_salary');
   await expect(validateWrite(db(),limited,'contracts',{employee_id:'NV002',status:'TERMINATED'},undefined,{status:'TERMINATED'})).rejects.toMatchObject({code:'USE_TERMINATE_ACTION'});
  }finally{await db().auditEvent.deleteMany({where:{resource_id:id}});await db().employmentContract.delete({where:{id}});}
 }));
 it('knowledge capability alone cannot read unrelated owner private HR file',()=>withDb(async()=>{
  const id=crypto.randomUUID();await db().document.create({data:{id,owner_id:'user-hr',title:'ACL-only test metadata',filename:'test.txt',mime_type:'text/plain',size:1,storage_key:'acl-test/'+id,classification:'CONFIDENTIAL'}});
  try{await expect(authorizeFile({...employee,capabilities:['knowledge:write']},id)).rejects.toMatchObject({code:'PERMISSION_DENIED'});}finally{await db().document.delete({where:{id}});}
 }));
 it('expired queued actor is denied at transaction boundary',()=>withDb(async()=>{
  await expect(locked(async()=>true,{...admin,session_id:'revoked-session'})).rejects.toMatchObject({code:'SESSION_REVOKED'});
 }));
 it('knowledge editor cannot delete an employee attachment even within read scope',()=>withDb(async()=>{
  const id=crypto.randomUUID();await db().document.create({data:{id,owner_id:'user-hr',employee_id:'NV002',title:'Private attachment test',filename:'test.txt',mime_type:'text/plain',size:1,storage_key:'test/'+id}});
  try{await expect(deleteFile({...employee,capabilities:['knowledge:write']},id)).rejects.toMatchObject({code:'PERMISSION_DENIED'});}finally{await db().document.delete({where:{id}});}
 }));
 it('validated policy is read by leave service and payroll remains integer VND',()=>withDb(async()=>{
  expect(settingSchemas.payroll_policy.safeParse({standard_minutes:0}).success).toBe(false);
  const previous=await db().setting.findUnique({where:{key:'leave_policy'}});
  await db().setting.upsert({where:{key:'leave_policy'},create:{key:'leave_policy',value:{max_request_days:1}},update:{value:{max_request_days:1}}});
  try{
   expect(await businessSettings(db(),'leave_policy')).toEqual({max_request_days:1});
   await expect(validateWrite(db(),admin,'leave',{employee_id:'NV002',starts_on:new Date('2026-10-05'),ends_on:new Date('2026-10-06')})).rejects.toMatchObject({code:'LEAVE_RANGE_EXCEEDS_POLICY'});
  }finally{if(previous)await db().setting.update({where:{key:'leave_policy'},data:{value:previous.value!}});else await db().setting.delete({where:{key:'leave_policy'}});}
 }));
 it('approved leave cannot be cancelled through a locked timesheet',()=>withDb(async()=>{
  const id=crypto.randomUUID();await db().timesheetPeriod.create({data:{id,name:'Locked leave regression',starts_on:new Date('2026-07-01'),ends_on:new Date('2026-07-31'),status:'LOCKED',source:'TEST'}});
  await db().leaveRequest.create({data:{id,employee_id:'NV002',type_id:'leave-annual',starts_on:new Date('2026-07-06'),ends_on:new Date('2026-07-06'),days:1,reason:'Locked regression only',status:'APPROVED',source:'TEST'}});
  try{await expect(workflow(admin,'leave',id,'cancel',{})).rejects.toMatchObject({code:'TIMESHEET_LOCKED'});}finally{await db().leaveRequest.delete({where:{id}});await db().timesheetPeriod.delete({where:{id}});}
 }));
 it('announcement retry does not duplicate persisted notifications',()=>withDb(async()=>{
  const id=crypto.randomUUID();await db().announcement.create({data:{id,title:id,body:'Publication retry test',audience:['EMPLOYEE'],author_id:admin.id}});
  try{
   await workflow(admin,'announcements',id,'publish',{});
   const first=await db().notification.count({where:{title:id}});expect(first).toBeGreaterThan(0);
   await workflow(admin,'announcements',id,'publish',{});
   expect(await db().notification.count({where:{title:id}})).toBe(first);
  }finally{await db().notification.deleteMany({where:{title:id}});await db().auditEvent.deleteMany({where:{resource_id:id}});await db().announcement.delete({where:{id}});}
 }));
 it('OT inside the previous overnight window is rejected',()=>withDb(async()=>{
  const eid=crypto.randomUUID(),sid=crypto.randomUUID();
  await db().employee.create({data:{id:eid,code:eid,full_name:'OT test only',email:eid+'@example.invalid',department_id:'dept-1',position_id:'position-1',hire_date:new Date('2026-01-01'),source:'TEST'}});
  await db().shift.create({data:{id:sid,name:'Overnight test',start_minute:1320,end_minute:360,weekdays:[1,2,3,4,5],source:'TEST'}});
  await db().shiftAssignment.create({data:{id:sid,employee_id:eid,shift_id:sid,starts_on:new Date('2026-01-01'),ends_on:new Date('2026-12-31'),source:'TEST'}});
  try{await expect(validateWrite(db(),admin,'overtime',{employee_id:eid,starts_at:new Date('2026-09-15T02:00:00+07:00'),ends_at:new Date('2026-09-15T04:00:00+07:00')})).rejects.toMatchObject({code:'OT_OVERLAPS_REGULAR_SHIFT'});}finally{await db().shiftAssignment.delete({where:{id:sid}});await db().shift.delete({where:{id:sid}});await db().employee.delete({where:{id:eid}});}
 }));
 it('reopening source timesheet invalidates payroll and forbids stale locking',()=>withDb(async()=>{
  const sid=crypto.randomUUID(),pid=crypto.randomUUID();
  await db().timesheetPeriod.create({data:{id:sid,name:'Regression period',starts_on:new Date('2026-06-01'),ends_on:new Date('2026-06-30'),status:'LOCKED',source:'TEST'}});
  await db().payrollPeriod.create({data:{id:pid,name:'Regression payroll',timesheet_id:sid,source:'TEST'}});
  try{
   await workflow(admin,'payroll',pid,'calculate',{});expect(await db().payrollItem.count({where:{period_id:pid}})).toBeGreaterThan(0);
   await workflow(admin,'timesheets',sid,'reopen',{reason:'Regression invalidates source'});
   expect(await db().payrollItem.count({where:{period_id:pid}})).toBe(0);
   await expect(workflow(admin,'payroll',pid,'review',{})).rejects.toMatchObject({code:'LOCKED_TIMESHEET_REQUIRED'});
  }finally{await db().payrollItem.deleteMany({where:{period_id:pid}});await db().payrollPeriod.delete({where:{id:pid}});await db().timesheetPeriod.delete({where:{id:sid}});await db().auditEvent.deleteMany({where:{resource_id:{in:[sid,pid]}}});}
 }));
});
