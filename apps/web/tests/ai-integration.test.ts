import { config } from 'dotenv';
import { describe,it,expect } from 'vitest';
import { withDb,db } from '../src/server/db';
import { runTool,morningStatistics } from '../src/server/ai/tools';
import { employeeIds } from '../src/server/policy';
import { permissionHash } from '../src/server/ai/workflow';
import { readChunk } from '../src/server/ai/knowledge';
config({path:'.env',quiet:true});
const employee={id:'user-employee',email:'employee@abc.example',role:'EMPLOYEE',employee_id:'NV002',capabilities:[]};
const manager={id:'user-manager',email:'manager@abc.example',role:'MANAGER',employee_id:'NV001',capabilities:[]};
const hr={id:'user-hr',email:'hr@abc.example',role:'HR_ADMIN',employee_id:'NV006',capabilities:['hr:read','hr:write','payroll:read','documents:sensitive','knowledge:write']};
describe.skipIf(process.env.RUN_AI_DB_TESTS!=='1')('real PostgreSQL HR tools; no LLM/embedding success claimed',()=>{
  it('uses real self-scope and denies a sibling object ID',()=>withDb(async()=>{
    const profile=await runTool(employee,{name:'get_my_profile',args:{}});expect(profile.items.map(x=>x.id)).toEqual(['NV002']);
    await expect(runTool(employee,{name:'get_employee_allowed_profile',args:{employee_id:'NV003'}})).rejects.toMatchObject({status:403});
  }));
  it('keeps manager rows/counts inside current team, including missing enrollment',()=>withDb(async()=>{
    const ids=await employeeIds(manager),result=await runTool(manager,{name:'get_face_enrollment_status',args:{missing_only:true}});
    expect(result.items.every(x=>ids.includes(String(x.id)))).toBe(true);
    const enrolled=await db().faceProfile.count({where:{employee_id:{in:ids},status:'ENROLLED'}});expect(result.total).toBe(ids.length-enrolled);
    const outside=await db().employee.findFirst({where:{id:{notIn:ids}}});expect(outside).not.toBeNull();
    await expect(runTool(manager,{name:'get_recent_attendance',args:{employee_id:outside!.id}})).rejects.toMatchObject({status:403});
  }));
  it('executes every allowlisted read tool against migrated schema',()=>withDb(async()=>{
    for(const name of ['get_my_profile','get_my_attendance','get_my_leave_balance','get_team_attendance','get_recent_attendance','get_pending_approvals','get_contract_expiries','get_face_enrollment_status','get_department_statistics','get_employee_allowed_profile','get_my_payroll'] as const){
      const result=await runTool(hr,{name,args:{from:'2026-09-13',to:'2026-09-13'}});expect(result.tool).toBe(name);expect(result.total).toBeGreaterThanOrEqual(0);
    }
    await runTool(manager,{name:'get_team_attendance',args:{missing_only:true}});
  }),20000);
  it('hash changes on permission downgrade and evidence-free sources stay inaccessible',()=>withDb(async()=>{
    expect(await permissionHash(hr)).not.toBe(await permissionHash({...hr,capabilities:[]}));
    await expect(readChunk(employee,'nonexistent-chunk')).rejects.toMatchObject({status:404});
    const stats=await morningStatistics(employee);expect(stats.headcount).toBeLessThanOrEqual(1);
  }));
});
