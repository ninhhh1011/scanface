import 'dotenv/config';
import {it,expect} from 'vitest';
import {withDb,db} from '../src/server/db';
import {hrRoute} from '../src/server/hr';
const actor={id:'user-admin',email:'admin@abc.example',employee_id:null,role:'SUPER_ADMIN',capabilities:[]};
it('headcount movement report applies hire-date range',()=>withDb(async()=>{
 const result=await hrRoute(new Request('http://127.0.0.1:3000/api/hr/reports?kind=headcount&from=2100-01-01&to=2100-01-31'),actor);
 expect((await result.json()).total).toBe(0);
}));
it('OT report includes the first seven hours of a Vietnam business day',()=>withDb(async()=>{
 const id=crypto.randomUUID();await db().overtimeRequest.create({data:{id,employee_id:'NV003',starts_at:new Date('2050-01-03T01:00:00+07:00'),ends_at:new Date('2050-01-03T02:00:00+07:00'),reason:'Report timezone regression',source:'TEST'}});
 try{
  const result=await hrRoute(new Request('http://127.0.0.1:3000/api/hr/reports?kind=overtime&from=2050-01-03&to=2050-01-03'),actor);
  expect((await result.json()).items.map((row:{id:string})=>row.id)).toContain(id);
 }finally{await db().overtimeRequest.delete({where:{id}});}
}));
