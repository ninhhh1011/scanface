import { existsSync,writeFileSync,readFileSync,mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { withDb,db } from '../../apps/web/src/server/db';
import { hashPassword } from '../../apps/web/src/server/password';
import { shiftWindow,attendanceMinutes } from '../../apps/web/src/server/domain';
const reference=process.env.SEED_REFERENCE_DATE;
if(!reference||!/^\d{4}-\d{2}-\d{2}$/.test(reference))throw new Error('SEED_REFERENCE_DATE required');
const date=new Date(reference+'T00:00:00Z');
const plus=(days:number)=>new Date(+date+days*86400_000);
const names=['An','Bình','Chi','Dũng','Hà','Hải','Hân','Hòa','Huy','Khánh','Lan','Linh','Minh','Nam','Ngân','Ngọc','Phúc','Quân','Thảo','Trang'];
mkdirSync('.local',{recursive:true});
const credentialFile='.local/credentials.json';
const credentials:Record<string,string>=existsSync(credentialFile)?JSON.parse(readFileSync(credentialFile,'utf8')):{};
for(const account of ['admin','hr','manager','employee'])credentials[account+'@abc.example']??=randomBytes(18).toString('base64url');
writeFileSync(credentialFile,JSON.stringify(credentials,null,2),{mode:0o600});
await withDb(async()=>{
const client=db();
const existingReference=await client.setting.findUnique({where:{key:'seed_reference_date'}});
if(existingReference&&existingReference.value!==reference)throw new Error('SEED_REFERENCE_DATE_MISMATCH: reuse the original reference date; no implicit reset');
await client.setting.upsert({where:{key:'seed_reference_date'},create:{key:'seed_reference_date',value:reference},update:{}});
for(let i=0;i<4;i++)await client.department.upsert({where:{id:`dept-${i+1}`},create:{id:`dept-${i+1}`,name:['Ban điều hành','Nhân sự','Công nghệ','Kinh doanh'][i],source:'SEED'},update:{}});
for(let i=0;i<4;i++)await client.position.upsert({where:{id:`position-${i+1}`},create:{id:`position-${i+1}`,name:['Trưởng nhóm','Chuyên viên','Kỹ sư','Nhân viên'][i],source:'SEED'},update:{}});
for(let i=1;i<=20;i++){
 const code=`NV${String(i).padStart(3,'0')}`;const group=Math.floor((i-1)/5)+1;const manager=(group-1)*5+1;
 await client.employee.upsert({where:{id:code},create:{id:code,code,full_name:`Nguyễn ${names[i-1]} (mẫu)`,email:code.toLowerCase()+'@abc.example',department_id:`dept-${group}`,position_id:`position-${i===manager?1:group===3?3:2}`,manager_id:i===manager?null:`NV${String(manager).padStart(3,'0')}`,hire_date:plus(-365-i),source:'SEED'},update:{}});
}
const accounts=[{name:'admin',role:'SUPER_ADMIN',employee_id:null,capabilities:['system:manage','hr:read','hr:write','payroll:read','payroll:write','documents:sensitive','knowledge:write']},{name:'hr',role:'HR_ADMIN',employee_id:'NV006',capabilities:['hr:read','hr:write','payroll:read','payroll:write','documents:sensitive','knowledge:write']},{name:'manager',role:'MANAGER',employee_id:'NV001',capabilities:[]},{name:'employee',role:'EMPLOYEE',employee_id:'NV002',capabilities:[]}];
for(const a of accounts)await client.setting.upsert({where:{key:'role:'+a.role},create:{key:'role:'+a.role,value:a.capabilities},update:{}});
for(const a of accounts)await client.user.upsert({where:{email:`${a.name}@abc.example`},create:{id:`user-${a.name}`,email:`${a.name}@abc.example`,password_hash:await hashPassword(credentials[`${a.name}@abc.example`]),employee_id:a.employee_id,role:a.role,capabilities:a.capabilities},update:{}});
const shift={id:'shift-office',name:'Hành chính',start_minute:480,end_minute:1020,break_minutes:60,grace_minutes:5,weekdays:[1,2,3,4,5],source:'SEED'};
await client.shift.upsert({where:{id:shift.id},create:shift,update:{}});
await client.leaveType.upsert({where:{id:'leave-annual'},create:{id:'leave-annual',name:'Phép năm',annual_days:12},update:{}});
await client.reviewCycle.upsert({where:{id:'cycle-seed'},create:{id:'cycle-seed',name:'Đánh giá quý — dữ liệu mẫu',starts_on:plus(-60),ends_on:plus(30),source:'SEED'},update:{}});
for(let i=1;i<=20;i++){
const id=`NV${String(i).padStart(3,'0')}`;
await client.shiftAssignment.upsert({where:{id:`schedule-${id}`},create:{id:`schedule-${id}`,employee_id:id,shift_id:shift.id,starts_on:plus(-60),ends_on:plus(365),source:'SEED'},update:{}});
await client.employmentContract.upsert({where:{id:`contract-${id}`},create:{id:`contract-${id}`,employee_id:id,title:'Hợp đồng lao động mẫu',starts_on:plus(-180),ends_on:plus(i<=3?i*7:180),base_salary:String(12000000+i*500000),status:'ACTIVE',source:'SEED'},update:{}});
await client.leaveBalance.upsert({where:{employee_id_type_id_year:{employee_id:id,type_id:'leave-annual',year:date.getUTCFullYear()}},create:{employee_id:id,type_id:'leave-annual',year:date.getUTCFullYear(),granted:12},update:{}});
await client.performanceReview.upsert({where:{id:`review-${id}`},create:{id:`review-${id}`,employee_id:id,cycle_id:'cycle-seed',self_comment:i<5?'Đã hoàn thành các nhiệm vụ được giao.':null,status:i<5?'SUBMITTED':'DRAFT',source:'SEED'},update:{}});
for(let ago=30;ago>=1;ago--){const d=plus(-ago);if([0,6].includes(d.getUTCDay()))continue;
 const key=`attendance-${id}-${d.toISOString().slice(0,10)}`;const w=shiftWindow(d.toISOString().slice(0,10),shift);
 const latestWorkday=plus(-1);while([0,6].includes(latestWorkday.getUTCDay()))latestWorkday.setUTCDate(latestWorkday.getUTCDate()-1);
 const check_in=new Date(+w.start+(i%7===0?12:0)*60_000);const check_out=+d===+latestWorkday&&i===20?null:w.end;
 await client.attendanceSession.upsert({where:{id:key},create:{id:key,employee_id:id,shift_id:shift.id,work_date:d,check_in,check_out,...attendanceMinutes(check_in,check_out,w,shift),source:'SEED'},update:{}});
}
}
await client.timesheetPeriod.upsert({where:{id:'timesheet-seed'},create:{id:'timesheet-seed',name:'Kỳ công mẫu 30 ngày',starts_on:plus(-30),ends_on:plus(-1),status:'DRAFT',source:'SEED'},update:{}});
await client.payrollPeriod.upsert({where:{id:'payroll-seed'},create:{id:'payroll-seed',name:'Tổng hợp nội bộ mẫu',timesheet_id:'timesheet-seed',source:'SEED'},update:{}});
await client.leaveRequest.upsert({where:{id:'leave-pending'},create:{id:'leave-pending',employee_id:'NV002',type_id:'leave-annual',starts_on:plus(2),ends_on:plus(2),days:1,reason:'Việc gia đình — dữ liệu mẫu',status:'SUBMITTED',source:'SEED'},update:{}});
await client.overtimeRequest.upsert({where:{id:'ot-pending'},create:{id:'ot-pending',employee_id:'NV003',starts_at:new Date(reference+'T11:00:00Z'),ends_at:new Date(reference+'T13:00:00Z'),reason:'Hoàn thành kế hoạch — dữ liệu mẫu',status:'SUBMITTED',source:'SEED'},update:{}});
const nextWorkday=plus(1);while([0,6].includes(nextWorkday.getUTCDay()))nextWorkday.setUTCDate(nextWorkday.getUTCDate()+1);
await client.$transaction(async tx=>{
 if(!await tx.leaveRequest.findUnique({where:{id:'leave-approved-seed'}})){
  await tx.leaveRequest.create({data:{id:'leave-approved-seed',employee_id:'NV004',type_id:'leave-annual',starts_on:nextWorkday,ends_on:nextWorkday,days:1,reason:'Nghỉ phép đã duyệt — dữ liệu mẫu',status:'APPROVED',reviewer_id:'user-manager',source:'SEED'}});
  await tx.leaveBalance.update({where:{employee_id_type_id_year:{employee_id:'NV004',type_id:'leave-annual',year:date.getUTCFullYear()}},data:{used:{increment:1}}});
  await tx.leaveLedger.create({data:{id:'ledger-approved-seed',request_id:'leave-approved-seed',employee_id:'NV004',type_id:'leave-annual',delta:1,action:'approve'}});
 }
});
await client.overtimeRequest.upsert({where:{id:'ot-approved-seed'},create:{id:'ot-approved-seed',employee_id:'NV004',starts_at:new Date(plus(-1).toISOString().slice(0,10)+'T03:00:00Z'),ends_at:new Date(plus(-1).toISOString().slice(0,10)+'T05:00:00Z'),reason:'OT đã duyệt, chưa đối chiếu công thực tế — mẫu',status:'APPROVED',reviewer_id:'user-manager',source:'SEED'},update:{}});
await client.announcement.upsert({where:{id:'announcement-seed'},create:{id:'announcement-seed',title:'Chào mừng đến với ABC HRM',body:'Dữ liệu nghiệp vụ mẫu phục vụ kiểm thử. Đăng ký khuôn mặt chỉ sau khi bạn đồng ý và chụp thật.',audience:['SUPER_ADMIN','HR_ADMIN','MANAGER','EMPLOYEE'],status:'PUBLISHED',author_id:'user-hr',source:'SEED'},update:{}});
// Correct the initial weekend reference fixture once; never rewrite user attendance or manual corrections.
await client.$transaction(async tx=>{
 if(await tx.setting.findUnique({where:{key:'seed_incomplete_checkout_v1'}}))return;
 const latest=plus(-1);while([0,6].includes(latest.getUTCDay()))latest.setUTCDate(latest.getUTCDate()-1);
 const id=`attendance-NV020-${latest.toISOString().slice(0,10)}`;
 const record=await tx.attendanceSession.findUnique({where:{id}});
 if(record?.source==='SEED'&&record.check_out?.getTime()===shiftWindow(latest.toISOString().slice(0,10),shift).end.getTime()&&!await tx.attendanceEvent.count({where:{session_id:id}})&&!await tx.attendanceCorrection.count({where:{attendance_id:id}}))await tx.attendanceSession.update({where:{id},data:{check_out:null,worked_minutes:0,early_minutes:0}});
 await tx.setting.create({data:{key:'seed_incomplete_checkout_v1',value:true}});
});
console.log(JSON.stringify({employees:await client.employee.count(),seed_employees:await client.employee.count({where:{source:'SEED'}}),face_profiles:await client.faceProfile.count(),face_templates:await client.faceTemplate.count(),reference_date:reference,credentials_file:credentialFile}));
});
