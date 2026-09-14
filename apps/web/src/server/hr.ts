import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { AppError,csvCell,day } from './domain';
import { can,requireCapability,employeeScope,employeeIds,authorizeEmployee,type Actor } from './policy';
import { resources,store,roles,capabilities,projectRow } from './resources';
import { locked,validateWrite,workflow,attendance } from './workflows';
import { audit } from './audit';
import { hashPassword } from './password';
import { businessSettings,settingSchemas } from './business-settings';
const querySchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),page_size:z.coerce.number().int().min(1).max(100).default(20),search:z.string().max(100).optional(),status:z.string().max(30).optional(),department_id:z.string().max(100).optional(),employee_id:z.string().max(100).optional(),contract_id:z.string().max(100).optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),sort:z.string().max(30).optional(),order:z.enum(['asc','desc']).default('asc'),kind:z.enum(['attendance','leave','overtime','headcount','contracts']).optional()}).strict();
type Query=z.infer<typeof querySchema>;
async function scope(actor:Actor,resource:string):Promise<Record<string,unknown>>{
 const type=resources[resource]?.scope;
 if(resource==='notifications')return {user_id:actor.id};
 if(type==='admin'){requireCapability(actor,'system:manage');return {};}
 if(type==='self')return employeeScope(actor);
 if(resource==='payroll-components'&&!can(actor,'payroll:read'))return {employee_id:actor.employee_id??'__none__'};
 if(type==='employee')return {employee_id:{in:await employeeIds(actor)}};
 if(type==='payroll')return can(actor,'payroll:read')?{}:{status:'LOCKED'};
 if(type==='announcement')return can(actor,'hr:write')?{}:{status:'PUBLISHED',audience:{has:actor.role}};
 if(type==='document')return {deleted_at:null,AND:[{OR:[{employee_id:{in:await employeeIds(actor)}},{employee_id:null,owner_id:actor.id}]},...(!can(actor,'documents:sensitive')?[{OR:[{classification:{not:'IDENTITY'}},{employee_id:actor.employee_id??'__none__'}]}]:[])]};
 return {};
}
function safeSelect(resource:string,actor:Actor){
 if(resource==='users')return {id:true,email:true,employee_id:true,role:true,capabilities:true,locked:true,created_at:true};
 if(resource==='contracts'&&!can(actor,'payroll:read'))return {id:true,employee_id:true,title:true,starts_on:true,ends_on:true,status:true,source:true,created_at:true};
 if(resource==='documents')return {id:true,employee_id:true,contract_id:true,owner_id:true,title:true,filename:true,mime_type:true,size:true,classification:true,created_at:true};
 return undefined;
}
async function list(actor:Actor,resource:string,query:Query,exporting=false){
 const definition=resources[resource];if(!definition)throw new AppError('NOT_FOUND',404);
 const where:Record<string,unknown>={AND:[await scope(actor,resource)]};const and=where.AND as Record<string,unknown>[];
 if(query.search&&definition.search)and.push({OR:definition.search.map(field=>({[field]:{contains:query.search,mode:'insensitive'}}))});
 if(query.status)and.push({status:query.status});
 if(query.employee_id){if(definition.scope==='self')and.push({id:query.employee_id});else if(['employee','document'].includes(definition.scope??''))and.push({employee_id:query.employee_id});}
 if(query.contract_id&&resource==='documents')and.push({contract_id:query.contract_id});
 if(query.department_id){const ids=(await db().employee.findMany({where:{AND:[employeeScope(actor),{department_id:query.department_id}]},select:{id:true}})).map(x=>x.id);and.push(definition.scope==='self'?{id:{in:ids}}:{employee_id:{in:ids}});}
 if(query.from&&query.to&&query.from>query.to)throw new AppError('INVALID_DATE_RANGE');
 const dates:Record<string,string>={employees:'hire_date',attendance:'work_date',leave:'starts_on',overtime:'starts_at',contracts:'ends_on',schedule:'starts_on',audit:'created_at'};
 if((query.from||query.to)&&['schedule','leave'].includes(resource))and.push({...(query.from?{ends_on:{gte:new Date(query.from)}}:{}),...(query.to?{starts_on:{lte:new Date(query.to)}}:{})});
 else if((query.from||query.to)&&dates[resource]){
  const date=(value:string)=>new Date(value+(['overtime','audit'].includes(resource)?'T00:00:00+07:00':'T00:00:00Z'));
  and.push({[dates[resource]]:{...(query.from?{gte:date(query.from)}:{}),...(query.to?{lt:new Date(+date(query.to)+86400_000)}:{})}});
 }
 const order=definition.sort??'id';const sort=query.sort??order;
 if(![order,...(definition.search??[])].includes(sort))throw new AppError('INVALID_SORT');
 const model=store(db(),resource);const total=await model.count({where});
 if(exporting&&total>10000)throw new AppError('EXPORT_TOO_LARGE_USE_FILTER',422);
 const items=await model.findMany({where,orderBy:{[sort]:query.order},take:exporting?10000:query.page_size,skip:exporting?0:(query.page-1)*query.page_size,select:safeSelect(resource,actor)});
 if(resource==='employees'){const profiles=await db().faceProfile.findMany({where:{employee_id:{in:items.map(x=>x.id)}},select:{employee_id:true,status:true,sample_count:true,updated_at:true}});for(const item of items)item.face_profile=profiles.find(x=>x.employee_id===item.id)??null;}
 if(resource==='performance'&&!can(actor,'hr:write'))for(const item of items){if(item.employee_id===actor.employee_id&&item.status!=='PUBLISHED'){delete item.manager_comment;delete item.score;}}
 return {items,total,page:query.page,page_size:query.page_size};
}
export async function dashboard(actor:Actor){
 const ids=await employeeIds(actor);const today=day();const now=new Date();
 const [headcount,checked_in,late,pendingLeave,pendingOt,contracts,face,recent,notices]=await Promise.all([
  db().employee.count({where:{id:{in:ids},status:{not:'ARCHIVED'}}}),
  db().attendanceSession.count({where:{employee_id:{in:ids},work_date:new Date(today)}}),
  db().attendanceSession.count({where:{employee_id:{in:ids},work_date:new Date(today),late_minutes:{gt:0}}}),
  db().leaveRequest.count({where:{employee_id:{in:ids.filter(x=>x!==actor.employee_id)},status:'SUBMITTED'}}),
  db().overtimeRequest.count({where:{employee_id:{in:ids.filter(x=>x!==actor.employee_id)},status:'SUBMITTED'}}),
  db().employmentContract.count({where:{employee_id:{in:ids},status:'ACTIVE',ends_on:{gte:now,lte:new Date(+now+30*86400_000)}}}),
  db().faceProfile.count({where:{employee_id:{in:ids},status:'ENROLLED'}}),
  db().attendanceSession.findMany({where:{employee_id:{in:ids}},orderBy:{check_in:'desc'},take:5}),
  db().announcement.findMany({where:{status:'PUBLISHED',audience:{has:actor.role}},orderBy:{created_at:'desc'},take:4})]);
 return {headcount,checked_in,late,pending_approvals:pendingLeave+pendingOt,expiring_contracts:contracts,face_enrolled:face,recent_attendance:recent,announcements:notices,as_of:now.toISOString(),timezone:'Asia/Ho_Chi_Minh'};
}
async function options(actor:Actor){
 const [employees,departments,positions,shifts,leave_types,review_cycles,timesheets]=await Promise.all([db().employee.findMany({where:employeeScope(actor),select:{id:true,code:true,full_name:true,department_id:true,manager_id:true,status:true},orderBy:{code:'asc'}}),db().department.findMany(),db().position.findMany(),db().shift.findMany(),db().leaveType.findMany(),db().reviewCycle.findMany(),db().timesheetPeriod.findMany()]);
 return {employees,departments,positions,shifts,leave_types,review_cycles,timesheets};
}
async function detail(actor:Actor,resource:string,id:string){
 const row=await store(db(),resource).findFirst({where:{AND:[{id},await scope(actor,resource)]},select:safeSelect(resource,actor)});if(!row)throw new AppError('PERMISSION_DENIED',403);
 if(resource==='employees')row.face_profile=await db().faceProfile.findUnique({where:{employee_id:id},select:{id:true,status:true,model_version:true,sample_count:true,updated_at:true}});
 if(resource==='payroll')row.items=await db().payrollItem.findMany({where:{period_id:id,...(!can(actor,'payroll:read')?{employee_id:actor.employee_id??'__none__'}:{})}});
 if(resource==='timesheets'){
  const where={employee_id:{in:await employeeIds(actor)},work_date:{gte:row.starts_on as Date,lte:row.ends_on as Date}};
  const [totals,missing]=await Promise.all([
   db().attendanceSession.groupBy({by:['employee_id'],where,_sum:{worked_minutes:true,late_minutes:true,early_minutes:true},_count:{_all:true}}),
   db().attendanceSession.groupBy({by:['employee_id'],where:{...where,check_out:null},_count:{_all:true}}),
  ]);
  row.items=totals.map(item=>({employee_id:item.employee_id,recorded_days:item._count._all,worked_minutes:item._sum.worked_minutes??0,late_minutes:item._sum.late_minutes??0,early_minutes:item._sum.early_minutes??0,missing_checkout:missing.find(x=>x.employee_id===item.employee_id)?._count._all??0}));
 }
 if(resource==='performance'&&row.employee_id===actor.employee_id&&row.status!=='PUBLISHED'&&!can(actor,'hr:write')){delete row.manager_comment;delete row.score;}
 return row;
}
async function save(actor:Actor,resource:string,id:string|undefined,input:unknown){
 const definition=resources[resource];if(!definition?.schema)throw new AppError('METHOD_NOT_ALLOWED',405);
 if(definition.write)requireCapability(actor,definition.write);
 const parsed=(id?definition.schema.partial():definition.schema).parse(input) as Record<string,unknown>;
 return locked(async tx=>{
  const model=store(tx,resource);const previous=id?await model.findUnique({where:{id}}):null;
  if(id&&!previous)throw new AppError('NOT_FOUND',404);
  if(previous?.employee_id)await authorizeEmployee(actor,previous.employee_id);
  if(resource==='employees'&&parsed.status==='ARCHIVED')throw new AppError('USE_ARCHIVE_ACTION',409);
  if(id&&['timesheets','payroll'].includes(resource)&&previous!.status!=='DRAFT')throw new AppError('DRAFT_REQUIRED',409);
  const merged={...previous,...parsed};await validateWrite(tx,actor,resource,merged,previous??undefined,parsed);
  const data:Record<string,unknown>={...parsed,...(resource==='leave'?{days:merged.days}:{}),...(resource==='announcements'&&!id?{author_id:actor.id}:{})};
  if(resource==='leave-balances')delete data.reason;
  if(resource==='users'){
   if(id===actor.id)throw new AppError('SELF_ADMIN_CHANGE_DENIED',409);
   if(id&&data.role&&data.role!==previous?.role&&data.capabilities===undefined)data.capabilities=(await tx.setting.findUnique({where:{key:'role:'+String(data.role)}}))?.value??[];
   const password=data.new_password;delete data.new_password;
   if(!id&&!password)throw new AppError('PASSWORD_REQUIRED');
   if(password)data.password_hash=await hashPassword(String(password));
   if(id)await tx.session.deleteMany({where:{user_id:id}});
  }
  const result=id?await model.update({where:{id},data}):await model.create({data});
  if(resource==='payroll'&&id&&parsed.timesheet_id&&parsed.timesheet_id!==previous?.timesheet_id)await tx.payrollItem.deleteMany({where:{period_id:id}});
  if(resource==='employees'&&!id){const types=await tx.leaveType.findMany();await tx.leaveBalance.createMany({data:types.map(t=>({employee_id:result.id,type_id:t.id,year:new Date().getUTCFullYear(),granted:t.annual_days}))});}
  if(resource==='leave-types'&&!id){const employees=await tx.employee.findMany({where:{status:{not:'ARCHIVED'}},select:{id:true}});await tx.leaveBalance.createMany({data:employees.map(e=>({employee_id:e.id,type_id:result.id,year:new Date().getUTCFullYear(),granted:Number(result.annual_days)}))});}
  await audit(tx,actor,id?'update':'create',resource,result.id,{reason:typeof parsed.reason==='string'?parsed.reason:undefined,before:previous?JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(previous).filter(([k])=>!['password_hash','capabilities'].includes(k))))):undefined,after:{fields:Object.keys(parsed).filter(k=>!k.includes('password')),...(resource==='leave-balances'?{granted:Number(result.granted)}:{})}});
  return projectRow(actor,resource,result);
 },actor);
}
function parseCsv(text:string){
 if(text.length>2_000_000)throw new AppError('CSV_TOO_LARGE');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw new AppError('CSV_UNCLOSED_QUOTE');row.push(cell.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);return rows;
}
async function importEmployees(actor:Actor,input:unknown){
 requireCapability(actor,'hr:write');const {csv,commit}=z.object({csv:z.string().max(2_000_000),commit:z.boolean()}).strict().parse(input);
 const [headers,...lines]=parseCsv(csv);if(!headers||lines.length>500||!lines.length)throw new AppError('INVALID_CSV');
 const required=['code','full_name','email','department_id','position_id','hire_date'];if(required.some(h=>!headers.includes(h))||new Set(headers).size!==headers.length)throw new AppError('INVALID_CSV_HEADERS');
 const rows:{row:number;valid:boolean;data?:Record<string,unknown>;errors:string[]}[]=[];const seen=new Set<string>();
 for(let index=0;index<lines.length;index++){
  const errors:string[]=[];const raw=Object.fromEntries(headers.map((h,i)=>[h,lines[index][i]??'']));for(const k of ['phone','manager_id'])if(raw[k]==='')delete raw[k];
  const parsed=resources.employees.schema!.safeParse(raw);if(!parsed.success)errors.push(...parsed.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`));
  else{for(const key of [String(raw.code),String(raw.email).toLowerCase()]){if(seen.has(key))errors.push('Trùng mã hoặc email trong CSV');seen.add(key);}if(await db().employee.findFirst({where:{OR:[{code:raw.code},{email:raw.email}]}}))errors.push('Mã hoặc email đã tồn tại');if(!await db().department.findUnique({where:{id:raw.department_id}}))errors.push('Phòng ban không tồn tại');if(!await db().position.findUnique({where:{id:raw.position_id}}))errors.push('Chức vụ không tồn tại');if(raw.manager_id&&!await db().employee.findUnique({where:{id:raw.manager_id}}))errors.push('Quản lý không tồn tại');}
  rows.push({row:index+2,valid:!errors.length,data:parsed.success?parsed.data as Record<string,unknown>:undefined,errors});
 }
 const valid=rows.every(x=>x.valid);if(commit&&!valid)throw new AppError('CSV_VALIDATION_FAILED',422);
 if(commit)await locked(async tx=>{for(const row of rows){const result=await tx.employee.create({data:row.data as Prisma.EmployeeUncheckedCreateInput});await audit(tx,actor,'import','employees',result.id);const types=await tx.leaveType.findMany();await tx.leaveBalance.createMany({data:types.map(t=>({employee_id:result.id,type_id:t.id,year:new Date().getUTCFullYear(),granted:t.annual_days}))});}},actor);
 return {rows,valid,...(commit?{committed:rows.length}:{})};
}
async function systemSettings(actor:Actor,resource:string,id:string|undefined,request:Request){
 requireCapability(actor,'system:manage');
 if(resource==='roles'){
  if(request.method==='GET')return {items:await Promise.all(roles.map(async role=>({id:role,role,capabilities:role==='SUPER_ADMIN'?[...capabilities]:(await db().setting.findUnique({where:{key:'role:'+role}}))?.value??[]}))),total:roles.length,page:1,page_size:20};
  if(!id||id==='SUPER_ADMIN'||!roles.includes(id as typeof roles[number]))throw new AppError('INVALID_ROLE');
  const input=z.object({capabilities:z.array(z.enum(capabilities))}).strict().parse(await request.json());
  return locked(async tx=>{await tx.setting.upsert({where:{key:'role:'+id},create:{key:'role:'+id,value:input.capabilities},update:{value:input.capabilities}});const users=await tx.user.findMany({where:{role:id},select:{id:true}});await tx.user.updateMany({where:{role:id},data:{capabilities:input.capabilities}});await tx.session.deleteMany({where:{user_id:{in:users.map(x=>x.id)}}});await audit(tx,actor,'role-capabilities','role',id,{after:{capabilities:input.capabilities}});return {ok:true};},actor);
 }
 if(request.method==='GET')return {items:await Promise.all((Object.keys(settingSchemas) as (keyof typeof settingSchemas)[]).map(async key=>({key,value:await businessSettings(db(),key)}))),total:3,page:1,page_size:100};
 const input=z.object({key:z.enum(['attendance_policy','leave_policy','payroll_policy']),value:z.record(z.string().max(100),z.union([z.string().max(1000),z.number().finite(),z.boolean()]))}).strict().parse(await request.json());
 const value=settingSchemas[input.key].parse(input.value);
 return locked(async tx=>{const result=await tx.setting.upsert({where:{key:input.key},create:{key:input.key,value},update:{value}});await audit(tx,actor,'update','settings',input.key);return result;},actor);
}
export async function hrRoute(request:Request,actor:Actor){
 const [resource,id,action]=new URL(request.url).pathname.slice('/api/hr/'.length).split('/');
 const query=querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
 if(resource==='options'&&request.method==='GET')return Response.json(await options(actor));
 if(resource==='dashboard'&&request.method==='GET')return Response.json(await dashboard(actor));
 if(['roles','settings'].includes(resource))return Response.json(await systemSettings(actor,resource,id,request));
 if(resource==='reports'&&request.method==='GET'){const kind=query.kind??'attendance';return Response.json({...await list(actor,kind==='headcount'?'employees':kind,query),kind,as_of:new Date().toISOString(),timezone:'Asia/Ho_Chi_Minh'});}
 if(resource==='employees'&&id==='template'&&request.method==='GET')return new Response('code,full_name,email,department_id,position_id,hire_date,manager_id\r\n',{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="employees-template.csv"'}});
 if(resource==='employees'&&id==='import'&&request.method==='POST')return Response.json(await importEmployees(actor,await request.json()));
 if(resource==='attendance'&&id==='manual'&&request.method==='POST'){
  requireCapability(actor,'hr:write');const data=z.object({employee_id:z.string(),action:z.enum(['CHECK_IN','CHECK_OUT']),occurred_at:z.iso.datetime({offset:true}).transform(x=>new Date(x)),reason:z.string().trim().min(3).max(2000)}).strict().parse(await request.json());await authorizeEmployee(actor,data.employee_id);
  return Response.json(await locked(tx=>attendance(tx,actor,{...data,source:'MANUAL'}),actor),{status:201});
 }
 if(!resources[resource])throw new AppError('NOT_FOUND',404);
 if(request.method==='GET'){
  if(id==='export'){const result=await list(actor,resource,query,true);const keys=result.items.length?Object.keys(result.items[0]).filter(k=>result.items[0][k]==null||typeof result.items[0][k]!=='object'||result.items[0][k] instanceof Date||Prisma.Decimal.isDecimal(result.items[0][k])):['id'];return new Response('\uFEFF'+[keys.map(csvCell).join(','),...result.items.map(item=>keys.map(k=>csvCell(item[k])).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${resource}.csv"`}});}
  return Response.json(id?await detail(actor,resource,id):await list(actor,resource,query));
 }
 if(request.method==='POST'&&id&&action)return Response.json(await workflow(actor,resource,id,action,await request.json()));
 if(request.method==='POST'&&!id)return Response.json(await save(actor,resource,undefined,await request.json()),{status:201});
 if(request.method==='PATCH'&&id)return Response.json(await save(actor,resource,id,await request.json()));
 throw new AppError('METHOD_NOT_ALLOWED',405);
}
