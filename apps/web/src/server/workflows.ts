import type { Prisma } from '@prisma/client';
import { db } from './db';
import { AppError,day,shiftWindow,attendanceMinutes,transition,workdays } from './domain';
import { authorizeApproval,authorizeEmployee,can,requireCapability,type Actor } from './policy';
import { audit } from './audit';
import { businessSettings } from './business-settings';
import { store,projectRow,type Row } from './resources';
type Tx=Prisma.TransactionClient;
// ponytail: one HR transaction lock for the small company; partition by employee/period if throughput demands it.
export async function locked<T>(fn:(tx:Tx)=>Promise<T>,actor?:Actor){return db().$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('abc-hr-workflows'))`;
 if(actor?.session_id){const rows=await tx.$queryRaw<{role:string;employee_id:string|null;capabilities:string[]}[]>`SELECT u.role,u.employee_id,u.capabilities FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=${actor.session_id} AND u.id=${actor.id} AND NOT u.locked AND s.expires_at>now() FOR SHARE OF s,u`;const current=rows[0];if(!current||current.role!==actor.role||current.employee_id!==actor.employee_id||JSON.stringify([...current.capabilities].sort())!==JSON.stringify([...actor.capabilities].sort()))throw new AppError('SESSION_REVOKED',401);}
 return fn(tx);
},{timeout:20000});}
export async function ensurePeriodOpen(tx:Tx,date:Date){if(await tx.timesheetPeriod.findFirst({where:{starts_on:{lte:date},ends_on:{gte:date},status:'LOCKED'}}))throw new AppError('TIMESHEET_LOCKED',409);}
export async function attendance(tx:Tx,actor:Actor,input:{employee_id:string;action:'CHECK_IN'|'CHECK_OUT';occurred_at:Date;source:'MANUAL'|'FACE';reason?:string;proof_id?:string}){
 const employee=await tx.employee.findUnique({where:{id:input.employee_id}});if(!employee||employee.status!=='ACTIVE')throw new AppError('EMPLOYEE_NOT_ACTIVE',409);
 const policy=await businessSettings(tx,'attendance_policy');
 const when=input.occurred_at;let record=await tx.attendanceSession.findFirst({where:{employee_id:employee.id,check_out:null}});
 if(input.action==='CHECK_OUT'){
  if(!record)throw new AppError('CHECK_IN_REQUIRED',409);
  await ensurePeriodOpen(tx,record.work_date);if(when<record.check_in)throw new AppError('CHECK_OUT_BEFORE_IN',409);
  if(+when-+record.check_in>policy.max_session_hours*3600_000)throw new AppError('CORRECTION_REQUIRED',409);
  const shift=await tx.shift.findUniqueOrThrow({where:{id:record.shift_id}});
  record=await tx.attendanceSession.update({where:{id:record.id},data:{check_out:when,...attendanceMinutes(record.check_in,when,shiftWindow(record.work_date.toISOString().slice(0,10),shift),shift)}});
 }else{
  if(record)throw new AppError('ALREADY_CHECKED_IN',409);
  const businessDay=day(when),previousDay=day(new Date(+when-86400_000));
  const assignments=await tx.shiftAssignment.findMany({where:{employee_id:employee.id,starts_on:{lte:new Date(businessDay)},ends_on:{gte:new Date(previousDay)}}});
  let selected:{shift:Awaited<ReturnType<typeof tx.shift.findUniqueOrThrow>>;date:string}|undefined;
  for(const a of assignments){const shift=await tx.shift.findUniqueOrThrow({where:{id:a.shift_id}});for(const date of [previousDay,businessDay]){const workDate=new Date(date);const w=shiftWindow(date,shift);if(a.starts_on<=workDate&&a.ends_on>=workDate&&shift.weekdays.includes(workDate.getUTCDay()||7)&&when>=new Date(+w.start-policy.early_checkin_minutes*60_000)&&when<=w.end)selected={shift,date};}}
  if(!selected)throw new AppError('NO_ACTIVE_SHIFT',409);
  const work_date=new Date(selected.date);await ensurePeriodOpen(tx,work_date);
  if(await tx.attendanceSession.findUnique({where:{employee_id_work_date_shift_id:{employee_id:employee.id,work_date,shift_id:selected.shift.id}}}))throw new AppError('SHIFT_ALREADY_RECORDED',409);
  record=await tx.attendanceSession.create({data:{employee_id:employee.id,shift_id:selected.shift.id,work_date,check_in:when,source:input.source,...attendanceMinutes(when,null,shiftWindow(selected.date,selected.shift),selected.shift)}});
 }
 await tx.attendanceEvent.create({data:{employee_id:employee.id,session_id:record.id,action:input.action,occurred_at:when,source:input.source,proof_id:input.proof_id,actor_id:actor.id,reason:input.reason}});
 await audit(tx,actor,input.action,'attendance',record.id,{reason:input.reason,after:{source:input.source,occurred_at:when.toISOString()}});return record;
}
export async function validateWrite(tx:Tx,actor:Actor,resource:string,data:Record<string,unknown>,previous?:Row,changed:Record<string,unknown>=data,asTransition=false){
 const employee_id=data.employee_id as string|undefined;
 if(employee_id){const e=await authorizeEmployee(actor,employee_id);if(e.status==='ARCHIVED')throw new AppError('EMPLOYEE_ARCHIVED',409);if(previous?.employee_id&&previous.employee_id!==employee_id)throw new AppError('EMPLOYEE_IMMUTABLE',409);}
 if(['leave','overtime','corrections'].includes(resource)&&!asTransition){
  if(employee_id!==actor.employee_id&&!can(actor,'hr:write'))throw new AppError('PERMISSION_DENIED',403);
  if(previous&&previous.status!=='DRAFT')throw new AppError('DRAFT_REQUIRED',409);
 }
 if(data.starts_on&&data.ends_on&&+new Date(data.ends_on as Date)<+new Date(data.starts_on as Date))throw new AppError('INVALID_DATE_RANGE');
 if(resource==='employees'){
  if(previous&&data.code!==undefined&&data.code!==previous.code)throw new AppError('CODE_IMMUTABLE');
  if(data.manager_id){let manager=String(data.manager_id);const seen=new Set<string>(previous?[previous.id]:[]);while(manager){if(seen.has(manager))throw new AppError('MANAGER_CYCLE');seen.add(manager);const e=await tx.employee.findUnique({where:{id:manager}});if(!e||e.status!=='ACTIVE')throw new AppError('INVALID_MANAGER');manager=e.manager_id??'';}}
 }
 if(resource==='contracts'){
  if('base_salary'in changed)requireCapability(actor,'payroll:write');
  if(changed.status==='TERMINATED')throw new AppError('USE_TERMINATE_ACTION',409);
 }
 if(resource==='leave-balances'){
  if(typeof changed.reason!=='string'||changed.reason.trim().length<3)throw new AppError('REASON_REQUIRED');
  if(previous&&(data.type_id!==previous.type_id||data.year!==previous.year))throw new AppError('BALANCE_PERIOD_IMMUTABLE',409);
  if(Number(data.granted)<Number(previous?.used??0))throw new AppError('GRANT_BELOW_USED',409);
 }
 if(resource==='shifts'){if(previous&&await tx.attendanceSession.count({where:{shift_id:previous.id}}))throw new AppError('SHIFT_IN_USE_CREATE_NEW',409);if(Number(data.start_minute)===Number(data.end_minute))throw new AppError('ZERO_LENGTH_SHIFT');}
 if(resource==='schedule'){
  const from=data.starts_on as Date,to=data.ends_on as Date;
  if(await tx.timesheetPeriod.findFirst({where:{status:'LOCKED',starts_on:{lte:to},ends_on:{gte:from}}}))throw new AppError('TIMESHEET_LOCKED',409);
 }
 if(resource==='leave'){
  const from=data.starts_on as Date,to=data.ends_on as Date;
  if(from.getUTCFullYear()!==to.getUTCFullYear())throw new AppError('SPLIT_LEAVE_BY_YEAR');
  const policy=await businessSettings(tx,'leave_policy');if((+to-+from)/86400_000+1>policy.max_request_days)throw new AppError('LEAVE_RANGE_EXCEEDS_POLICY',422);
  let days=0;for(let date=+from;date<=+to;date+=86400_000){if(date-+from>366*86400_000)throw new AppError('INVALID_DATE_RANGE');const assignment=await tx.shiftAssignment.findFirst({where:{employee_id:employee_id!,starts_on:{lte:new Date(date)},ends_on:{gte:new Date(date)}}});if(!assignment)throw new AppError('LEAVE_SCHEDULE_REQUIRED');const shift=await tx.shift.findUniqueOrThrow({where:{id:assignment.shift_id}});days+=workdays(new Date(date).toISOString(),new Date(date).toISOString(),shift.weekdays);}
  if(!days)throw new AppError('NO_WORKDAYS');data.days=days;
 }
 if(resource==='overtime'){
  const start=data.starts_at as Date,end=data.ends_at as Date;
  if(+end<=+start||+end-+start>16*3600_000)throw new AppError('INVALID_OT_RANGE');
  for(let date=+new Date(day(new Date(+start-86400_000)));date<=+new Date(day(end));date+=86400_000){const assignment=await tx.shiftAssignment.findFirst({where:{employee_id:employee_id!,starts_on:{lte:new Date(date)},ends_on:{gte:new Date(date)}}});
   if(assignment){const shift=await tx.shift.findUniqueOrThrow({where:{id:assignment.shift_id}});const w=shiftWindow(new Date(date).toISOString().slice(0,10),shift);if(shift.weekdays.includes(new Date(date).getUTCDay()||7)&&start<w.end&&end>w.start)throw new AppError('OT_OVERLAPS_REGULAR_SHIFT');}}
 }
 if(resource==='corrections'){
  const record=await tx.attendanceSession.findUnique({where:{id:String(data.attendance_id)}});if(!record||record.employee_id!==employee_id)throw new AppError('INVALID_ATTENDANCE');await ensurePeriodOpen(tx,record.work_date);
  if(data.requested_out&&+new Date(data.requested_out as Date)<+new Date(data.requested_in as Date))throw new AppError('INVALID_DATE_RANGE');
 }
 if(resource==='performance'){
  if(employee_id===actor.employee_id){if(changed.manager_comment!==undefined||changed.score!==undefined)throw new AppError('MANAGER_FIELDS_DENIED',403);if(previous&&previous.status!=='DRAFT')throw new AppError('DRAFT_REQUIRED',409);}
  else{await authorizeApproval(actor,employee_id!);if(changed.self_comment!==undefined)throw new AppError('SELF_REVIEW_FIELD_DENIED',403);if(previous?.status==='PUBLISHED')throw new AppError('REVIEW_PUBLISHED',409);}
 }
 if(resource==='announcements'&&!previous)data.author_id=actor.id;
}
export async function workflow(actor:Actor,resource:string,id:string,action:string,input:Record<string,unknown>){
 return locked(async tx=>{
  const model=store(tx,resource);const row=await model.findUnique({where:{id}});if(!row)throw new AppError('NOT_FOUND',404);
  if(row.employee_id)await authorizeEmployee(actor,row.employee_id);
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  if(['reject','reopen','terminate','archive'].includes(action)&&reason.length<3)throw new AppError('REASON_REQUIRED');
  let data:Record<string,unknown>={};
  if(['leave','overtime','corrections'].includes(resource)){
   if(['approve','reject'].includes(action))await authorizeApproval(actor,row.employee_id!);
   else if(row.employee_id!==actor.employee_id&&!can(actor,'hr:write'))throw new AppError('PERMISSION_DENIED',403);
   if(resource==='corrections'&&row.status==='APPROVED'&&action==='cancel')throw new AppError('NEW_CORRECTION_REQUIRED',409);
   if(['leave','overtime'].includes(resource)&&(action==='approve'||(action==='cancel'&&row.status==='APPROVED'))){
    const from=resource==='leave'?row.starts_on as Date:new Date(day(row.starts_at as Date));
    const to=resource==='leave'?row.ends_on as Date:new Date(day(row.ends_at as Date));
    if(await tx.timesheetPeriod.findFirst({where:{status:'LOCKED',starts_on:{lte:to},ends_on:{gte:from}}}))throw new AppError('TIMESHEET_LOCKED',409);
   }
   if(['submit','approve'].includes(action)){
    const checked={...row};await validateWrite(tx,actor,resource,checked,undefined,{},true);
    if(resource==='leave'&&checked.days!==row.days)throw new AppError('SCHEDULE_CHANGED_RESUBMIT',409);
   }
   const status=transition(row.status!,action);data={status};
   if(['approve','reject'].includes(action)){data.reviewer_id=actor.id;data.review_reason=reason;}
   if(resource==='leave'&&(action==='approve'||(action==='cancel'&&row.status==='APPROVED'))){
    if(action==='cancel'&&+new Date(row.starts_on as Date)<=Date.now()&&!can(actor,'hr:write'))throw new AppError('HR_CANCELLATION_REQUIRED',403);
    const days=Number(row.days),delta=action==='approve'?days:-days;
    const balance=await tx.leaveBalance.findUnique({where:{employee_id_type_id_year:{employee_id:row.employee_id!,type_id:String(row.type_id),year:new Date(row.starts_on as Date).getUTCFullYear()}}});
    if(!balance||balance.used+delta>balance.granted||balance.used+delta<0)throw new AppError('INSUFFICIENT_LEAVE_BALANCE',409);
    await tx.leaveBalance.update({where:{id:balance.id},data:{used:{increment:delta}}});
    await tx.leaveLedger.create({data:{request_id:id,employee_id:row.employee_id!,type_id:String(row.type_id),delta,action}});
   }
   if(resource==='corrections'&&action==='approve'){
    const before=await tx.attendanceSession.findUniqueOrThrow({where:{id:String(row.attendance_id)}});await ensurePeriodOpen(tx,before.work_date);
    const shift=await tx.shift.findUniqueOrThrow({where:{id:before.shift_id}});const check_in=new Date(row.requested_in as Date),check_out=row.requested_out?new Date(row.requested_out as Date):null;
    await tx.attendanceSession.update({where:{id:before.id},data:{check_in,check_out,...attendanceMinutes(check_in,check_out,shiftWindow(before.work_date.toISOString().slice(0,10),shift),shift),source:'MANUAL'}});
    await audit(tx,actor,'correct','attendance',before.id,{reason:String(row.reason),before:{check_in:before.check_in.toISOString(),check_out:before.check_out?.toISOString()??null,source:before.source},after:{check_in:check_in.toISOString(),check_out:check_out?.toISOString()??null,source:'MANUAL'}});
   }
  }else if(resource==='employees'&&action==='archive'){
   requireCapability(actor,'hr:write');data={status:'ARCHIVED',end_date:new Date()};
   await tx.session.deleteMany({where:{user_id:{in:(await tx.user.findMany({where:{employee_id:id},select:{id:true}})).map(u=>u.id)}}});
   await tx.user.updateMany({where:{employee_id:id},data:{locked:true}});
   await tx.faceVerification.updateMany({where:{employee_id:id,consumed_at:null},data:{consumed_at:new Date()}});
  }else if(resource==='contracts'&&action==='terminate'){requireCapability(actor,'hr:write');data={status:'TERMINATED'};
  }else if(resource==='timesheets'){
   requireCapability(actor,'hr:write');data={status:transition(row.status!,action)};
   if(action==='reopen'){
    if(await tx.payrollPeriod.findFirst({where:{timesheet_id:id,status:'LOCKED'}}))throw new AppError('PAYROLL_LOCKED',409);
    const linked=await tx.payrollPeriod.findMany({where:{timesheet_id:id},select:{id:true}});await tx.payrollItem.deleteMany({where:{period_id:{in:linked.map(x=>x.id)}}});await tx.payrollPeriod.updateMany({where:{timesheet_id:id},data:{status:'DRAFT'}});
   }
   if(action==='lock'&&await tx.attendanceSession.count({where:{work_date:{gte:row.starts_on as Date,lte:row.ends_on as Date},check_out:null}}))throw new AppError('MISSING_CHECKOUT',409);
  }else if(resource==='payroll'){
   requireCapability(actor,'payroll:write');
   if(action==='calculate'){if(row.status!=='DRAFT')throw new AppError('DRAFT_REQUIRED',409);await calculatePayroll(tx,id,String(row.timesheet_id));data={status:'DRAFT'};}
   else{if(['review','lock'].includes(action)){const sheet=await tx.timesheetPeriod.findUniqueOrThrow({where:{id:String(row.timesheet_id)}});if(sheet.status!=='LOCKED')throw new AppError('LOCKED_TIMESHEET_REQUIRED',409);if(!await tx.payrollItem.count({where:{period_id:id}}))throw new AppError('CALCULATE_REQUIRED',409);}data={status:transition(row.status!,action)};}
  }else if(resource==='performance'){
   if(action==='submit'){if(row.employee_id!==actor.employee_id)throw new AppError('PERMISSION_DENIED',403);data={status:transition(row.status!,action)};}
   else if(action==='publish'){await authorizeApproval(actor,row.employee_id!);if(row.status!=='SUBMITTED'||row.score==null||!row.manager_comment)throw new AppError('REVIEW_INCOMPLETE',409);data={status:'PUBLISHED'};}
   else throw new AppError('INVALID_TRANSITION',409);
  }else if(resource==='announcements'){
   requireCapability(actor,'hr:write');if(!['publish','archive'].includes(action))throw new AppError('INVALID_TRANSITION');data={status:action==='publish'?'PUBLISHED':'ARCHIVED'};
   if(action==='publish'&&row.status==='PUBLISHED')return projectRow(actor,resource,row);
   if(action==='publish'&&row.status!=='DRAFT')throw new AppError('DRAFT_REQUIRED',409);
   if(action==='publish'){const users=await tx.user.findMany({where:{role:{in:row.audience as string[]},locked:false},select:{id:true}});await tx.notification.createMany({data:users.map(user=>({id:crypto.randomUUID(),user_id:user.id,title:String(row.title),href:'/announcements?record_id='+encodeURIComponent(id)}))});}
  }else if(resource==='notifications'&&action==='read'){
   if(row.user_id!==actor.id)throw new AppError('PERMISSION_DENIED',403);data={read_at:new Date()};
  }else if(resource==='users'){
   requireCapability(actor,'system:manage');if(id===actor.id)throw new AppError('SELF_ADMIN_CHANGE_DENIED',409);
   if(action==='lock'||action==='unlock')data={locked:action==='lock'};
   else if(action==='reset-credential'){if(typeof input.new_password!=='string'||input.new_password.length<12||input.new_password.length>128)throw new AppError('INVALID_PASSWORD');const {hashPassword}=await import('./password');data={password_hash:await hashPassword(input.new_password)};}
   else throw new AppError('INVALID_ACTION');await tx.session.deleteMany({where:{user_id:id}});
  }else throw new AppError('INVALID_ACTION',404);
  const result=await model.update({where:{id},data});
  await audit(tx,actor,action,resource,id,{reason,before:{status:row.status??null},after:{status:String(data.status??'UPDATED')}});
  if(row.employee_id&&['approve','reject'].includes(action)){const users=await tx.user.findMany({where:{employee_id:row.employee_id},select:{id:true}});await tx.notification.createMany({data:users.map(u=>({id:crypto.randomUUID(),user_id:u.id,title:`${resource==='leave'?'Đơn nghỉ phép':resource==='overtime'?'Đơn OT':'Yêu cầu sửa công'}: ${action==='approve'?'Đã duyệt':'Từ chối'}`,href:`/${resource}?record_id=${encodeURIComponent(id)}`}))});}
  return projectRow(actor,resource,result);
 },actor);
}
async function calculatePayroll(tx:Tx,period_id:string,timesheet_id:string){
 const period=await tx.timesheetPeriod.findUniqueOrThrow({where:{id:timesheet_id}});if(period.status!=='LOCKED')throw new AppError('LOCKED_TIMESHEET_REQUIRED',409);
 const policy=await businessSettings(tx,'payroll_policy');
 await tx.payrollItem.deleteMany({where:{period_id}});
 const employees=await tx.employee.findMany({where:{status:{not:'ARCHIVED'}}});
 for(const employee of employees){
  const contract=await tx.employmentContract.findFirst({where:{employee_id:employee.id,status:'ACTIVE',starts_on:{lte:period.ends_on},OR:[{ends_on:null},{ends_on:{gte:period.starts_on}}]},orderBy:{starts_on:'desc'}});
  const components=await tx.salaryComponent.findMany({where:{employee_id:employee.id}});
  const sums=await tx.attendanceSession.aggregate({where:{employee_id:employee.id,work_date:{gte:period.starts_on,lte:period.ends_on}},_sum:{worked_minutes:true}});
  const sessions=await tx.attendanceSession.findMany({where:{employee_id:employee.id,work_date:{gte:period.starts_on,lte:period.ends_on},check_out:{not:null}}});
  const ots=await tx.overtimeRequest.findMany({where:{employee_id:employee.id,status:'APPROVED',starts_at:{gte:new Date(period.starts_on.toISOString().slice(0,10)+'T00:00:00+07:00')},ends_at:{lte:new Date(+period.ends_on+86400_000-7*3600_000)}}});
  let overtime_minutes=0;for(const ot of ots)for(const s of sessions){const shift=await tx.shift.findUniqueOrThrow({where:{id:s.shift_id}});const window=shiftWindow(s.work_date.toISOString().slice(0,10),shift);const start=Math.max(+ot.starts_at,+s.check_in),end=Math.min(+ot.ends_at,+s.check_out!);const overlap=Math.max(0,Math.min(end,+window.end)-Math.max(start,+window.start));overtime_minutes+=Math.max(0,Math.floor((end-start-overlap)/60_000));}
  const sum=(kind:string)=>components.filter(x=>x.kind===kind).reduce((n,x)=>n+BigInt(x.amount.toFixed(0)),0n);
  const baseComponents=sum('BASE'),fixedBase=baseComponents||BigInt(contract?.base_salary.toFixed(0)??'0');
  const base=policy.prorate_base?fixedBase*BigInt(Math.min(sums._sum.worked_minutes??0,policy.standard_minutes))/BigInt(policy.standard_minutes):fixedBase;
  const allowance=sum('ALLOWANCE'),adjustment=sum('ADJUSTMENT');
  const data={base_amount:base.toString(),allowance_amount:allowance.toString(),adjustment_amount:adjustment.toString(),total_amount:(base+allowance+adjustment).toString(),worked_minutes:sums._sum.worked_minutes??0,overtime_minutes};
  await tx.payrollItem.upsert({where:{period_id_employee_id:{period_id,employee_id:employee.id}},create:{period_id,employee_id:employee.id,...data},update:data});
 }
}
