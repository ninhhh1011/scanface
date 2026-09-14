import { z } from 'zod';
import { db } from '../db';
import { Actor,can,employeeIds,authorizeEmployee } from '../policy';
import { AppError,day } from '../domain';
import { audit } from '../audit';
import { ToolCall,toolArgsSchema } from './guards';
const profile={id:true,code:true,full_name:true,department_id:true,position_id:true,manager_id:true,status:true,hire_date:true} as const;
const attendance={id:true,employee_id:true,work_date:true,check_in:true,check_out:true,late_minutes:true,early_minutes:true,worked_minutes:true,source:true} as const;
const resultSchema=z.object({tool:z.string(),as_of:z.iso.datetime(),timezone:z.literal('Asia/Ho_Chi_Minh'),from:z.iso.date().nullable(),to:z.iso.date().nullable(),total:z.number().int().nonnegative(),truncated:z.boolean(),items:z.array(z.record(z.string(),z.unknown())).max(30)}).strict();
export async function runTool(actor:Actor,call:ToolCall){
  const args=toolArgsSchema.parse(call.args??{}),today=day(),from=args.from??args.date??(call.name==='get_recent_attendance'?new Date(+new Date(today)-30*86400_000).toISOString().slice(0,10):today),to=args.to??args.date??(call.name==='get_contract_expiries'?new Date(+new Date(from)+(args.days??30)*86400_000).toISOString().slice(0,10):call.name==='get_recent_attendance'?today:from);
  if(to<from||+new Date(to)-+new Date(from)>90*86400_000)throw new AppError('INVALID_DATE_RANGE',422);
  if(call.name==='get_team_attendance'&&args.missing_only&&to!==from)throw new AppError('SINGLE_DATE_REQUIRED',422);
  const limit=args.limit??20;
  let ids=await employeeIds(actor);
  if(args.employee_id){await authorizeEmployee(actor,args.employee_id);ids=ids.filter(id=>id===args.employee_id);}
  if(call.name.startsWith('get_my_')){
    if(!actor.employee_id||(args.employee_id&&args.employee_id!==actor.employee_id))throw new AppError('PERMISSION_DENIED',403);
    ids=ids.filter(id=>id===actor.employee_id);
  }
  if(['get_team_attendance','get_pending_approvals','get_department_statistics'].includes(call.name)&&actor.role!=='MANAGER'&&!can(actor,'hr:read'))throw new AppError('PERMISSION_DENIED',403);
  if(call.name==='get_my_payroll'&&!can(actor,'payroll:read'))throw new AppError('PERMISSION_DENIED',403);
  const scope={employee_id:{in:ids}},dateRange={gte:new Date(from+'T00:00:00Z'),lte:new Date(to+'T00:00:00Z')};
  const result=await db().$transaction(async tx=>{
    await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
    let items:object[]=[],total=0;
    switch(call.name){
      case 'get_my_profile':case 'get_employee_allowed_profile':{
        const where={id:{in:ids}};items=await tx.employee.findMany({where,select:profile,orderBy:{code:'asc'},take:limit});total=await tx.employee.count({where});break;
      }
      case 'get_my_attendance':case 'get_recent_attendance':case 'get_team_attendance':{
        if(call.name==='get_team_attendance'&&args.missing_only){
          const approved=await tx.leaveRequest.findMany({where:{...scope,status:'APPROVED',starts_on:{lte:dateRange.lte},ends_on:{gte:dateRange.gte}},select:{employee_id:true}});
          const checked=await tx.attendanceSession.findMany({where:{...scope,work_date:dateRange},select:{employee_id:true}});
          const assignments=await tx.shiftAssignment.findMany({where:{...scope,starts_on:{lte:dateRange.gte},ends_on:{gte:dateRange.gte}},select:{employee_id:true,shift_id:true}});
          const shifts=await tx.shift.findMany({where:{id:{in:assignments.map(a=>a.shift_id)},weekdays:{has:new Date(from).getUTCDay()||7}},select:{id:true}});
          const scheduled=assignments.filter(a=>shifts.some(s=>s.id===a.shift_id)).map(a=>a.employee_id);
          const missing=ids.filter(id=>scheduled.includes(id)&&!checked.some(x=>x.employee_id===id)&&!approved.some(x=>x.employee_id===id));
          total=missing.length;items=await tx.employee.findMany({where:{id:{in:missing}},select:profile,take:limit,orderBy:{code:'asc'}});
        }else{
          const where={...scope,work_date:dateRange};total=await tx.attendanceSession.count({where});
          items=await tx.attendanceSession.findMany({where,select:attendance,take:limit,orderBy:{check_in:'desc'}});
        }break;
      }
      case 'get_my_leave_balance':{
        const where={...scope,year:new Date(from).getUTCFullYear()};total=await tx.leaveBalance.count({where});
        items=await tx.leaveBalance.findMany({where,select:{employee_id:true,type_id:true,year:true,granted:true,used:true},take:limit});break;
      }
      case 'get_pending_approvals':{
        const where={employee_id:{in:ids.filter(id=>id!==actor.employee_id)},status:'SUBMITTED'};
        const counts=await Promise.all([tx.leaveRequest.count({where}),tx.overtimeRequest.count({where}),tx.attendanceCorrection.count({where})]);
        items=[{leave:counts[0],overtime:counts[1],attendance_corrections:counts[2]}];total=1;break;
      }
      case 'get_contract_expiries':{
        const where={...scope,status:'ACTIVE',ends_on:dateRange};
        total=await tx.employmentContract.count({where});items=await tx.employmentContract.findMany({where,select:{id:true,employee_id:true,title:true,starts_on:true,ends_on:true,status:true},take:limit,orderBy:{ends_on:'asc'}});break;
      }
      case 'get_face_enrollment_status':{
        const enrolled=await tx.faceProfile.findMany({where:{...scope,status:'ENROLLED'},select:{employee_id:true}});
        const selected=args.missing_only?ids.filter(id=>!enrolled.some(e=>e.employee_id===id)):ids;
        total=selected.length;items=(await tx.employee.findMany({where:{id:{in:selected}},select:{id:true,code:true,full_name:true},orderBy:{code:'asc'},take:limit})).map(e=>({...e,status:enrolled.some(x=>x.employee_id===e.id)?'ENROLLED':'NOT_ENROLLED'}));break;
      }
      case 'get_department_statistics':{
        const grouped=await tx.employee.groupBy({by:['department_id','status'],where:{id:{in:ids}},_count:{_all:true},orderBy:[{department_id:'asc'},{status:'asc'}]});
        total=grouped.length;items=grouped.slice(0,limit).map(g=>({department_id:g.department_id,status:g.status,count:g._count._all}));break;
      }
      case 'get_my_payroll':{
        const periods=await tx.payrollPeriod.findMany({where:{status:'LOCKED'},select:{id:true}});
        const where={...scope,period_id:{in:periods.map(period=>period.id)}};total=await tx.payrollItem.count({where});items=(await tx.payrollItem.findMany({where,select:{period_id:true,employee_id:true,base_amount:true,allowance_amount:true,adjustment_amount:true,total_amount:true,worked_minutes:true,overtime_minutes:true},take:limit})).map(x=>({...x,base_amount:x.base_amount.toString(),allowance_amount:x.allowance_amount.toString(),adjustment_amount:x.adjustment_amount.toString(),total_amount:x.total_amount.toString()}));break;
      }
      default:throw new AppError('AI_TOOL_NOT_ALLOWED',422);
    }
    await audit(tx,actor,'ai-tool',call.name,null,{after:{from,to,returned:items.length,total}});
    const dated=['get_my_attendance','get_recent_attendance','get_team_attendance','get_contract_expiries'].includes(call.name);
    return {tool:call.name,as_of:new Date().toISOString(),timezone:'Asia/Ho_Chi_Minh',from:dated?from:null,to:dated?to:null,total,truncated:total>items.length,items};
  },{timeout:7000});
  return resultSchema.parse(JSON.parse(JSON.stringify(result)));
}
export async function morningStatistics(actor:Actor){
  const ids=await employeeIds(actor),date=new Date(day()+'T00:00:00Z');
  return db().$transaction(async tx=>{
    const employee_id={in:ids};
    const [headcount,checked_in,late,pending_leave,expiring_contracts]=await Promise.all([
      tx.employee.count({where:{id:{in:ids},status:'ACTIVE'}}),tx.attendanceSession.count({where:{employee_id,work_date:date}}),
      tx.attendanceSession.count({where:{employee_id,work_date:date,late_minutes:{gt:0}}}),tx.leaveRequest.count({where:{employee_id,status:'SUBMITTED'}}),
      tx.employmentContract.count({where:{employee_id,status:'ACTIVE',ends_on:{gte:date,lte:new Date(+date+30*86400_000)}}})]);
    await audit(tx,actor,'ai-brief','statistics',null);
    return {headcount,checked_in,late,pending_leave,expiring_contracts,date:day(),timezone:'Asia/Ho_Chi_Minh',as_of:new Date().toISOString()};
  },{timeout:7000});
}
