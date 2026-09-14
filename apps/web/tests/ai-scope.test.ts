import { describe,it,expect,vi,beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({employee:{findMany:vi.fn(),findFirst:vi.fn()},attendanceSession:{findMany:vi.fn(),count:vi.fn()},auditEvent:{create:vi.fn()},$executeRaw:vi.fn()}));
vi.mock('../src/server/db',()=>({db:()=>({...mocks,$transaction:async(fn:(tx:typeof mocks)=>unknown)=>fn(mocks)})}));
import { runTool } from '../src/server/ai/tools';
const actor={id:'u2',email:'u2@example.test',role:'EMPLOYEE',employee_id:'NV002',capabilities:[]};
describe('SQL tool scope (mocked database, no provider)',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.employee.findMany.mockResolvedValue([{id:'NV002'}]);mocks.employee.findFirst.mockResolvedValue(null);mocks.attendanceSession.findMany.mockResolvedValue([]);mocks.attendanceSession.count.mockResolvedValue(0);});
  it('denies cross-user object IDs before fetching attendance',async()=>{
    await expect(runTool(actor,{name:'get_my_attendance',args:{employee_id:'NV003'}})).rejects.toMatchObject({status:403});
    expect(mocks.attendanceSession.findMany).not.toHaveBeenCalled();
  });
  it('denies employee team aggregate and payroll without capability',async()=>{
    await expect(runTool(actor,{name:'get_team_attendance',args:{}})).rejects.toMatchObject({status:403});
    await expect(runTool(actor,{name:'get_my_payroll',args:{}})).rejects.toMatchObject({status:403});
  });
  it('projects own attendance fields and bounds results in SQL',async()=>{
    const result=await runTool(actor,{name:'get_my_attendance',args:{}});
    const query=mocks.attendanceSession.findMany.mock.calls[0][0];
    expect(query.where.employee_id).toEqual({in:['NV002']});expect(query.take).toBe(20);
    expect(query.select.check_in).toBe(true);expect(query.select.employee).toBeUndefined();
    expect(result.timezone).toBe('Asia/Ho_Chi_Minh');expect(mocks.auditEvent.create).toHaveBeenCalled();
  });
  it('manager recent attendance stays restricted to derived IDs',async()=>{
    await runTool({...actor,role:'MANAGER'},{name:'get_recent_attendance',args:{limit:5}});
    expect(mocks.attendanceSession.findMany.mock.calls[0][0].where.employee_id).toEqual({in:['NV002']});
  });
});
