import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { AppError } from './domain';
import { can,type Actor } from './policy';
const id=z.string().min(1).max(100),text=z.string().trim().min(1).max(200),reason=z.string().trim().min(3).max(2000);
const date=z.iso.date().transform(v=>new Date(v+'T00:00:00Z'));
const timestamp=z.iso.datetime({offset:true}).transform(v=>new Date(v));
const money=z.union([z.string(),z.number().int().safe()]).transform(String).pipe(z.string().regex(/^-?\d{1,15}$/));
const employee={employee_id:id};
export const roles=['SUPER_ADMIN','HR_ADMIN','MANAGER','EMPLOYEE'] as const;
export const capabilities=['system:manage','hr:read','hr:write','payroll:read','payroll:write','documents:sensitive','knowledge:write'] as const;
export type Resource={model:string;schema?:z.ZodObject;scope?:'employee'|'self'|'admin'|'payroll'|'announcement'|'document';search?:string[];sort?:string;write?:string};
export const resources:Record<string,Resource>={
 employees:{model:'employee',scope:'self',search:['code','full_name','email'],sort:'code',write:'hr:write',schema:z.object({code:text,full_name:text,email:z.email().max(254).toLowerCase(),phone:z.string().max(30).nullable().optional(),department_id:id,position_id:id,manager_id:id.nullable().optional(),hire_date:date,end_date:date.nullable().optional(),status:z.enum(['ACTIVE','ON_LEAVE','ARCHIVED']).optional()}).strict()},
 departments:{model:'department',search:['name'],write:'hr:write',schema:z.object({name:text}).strict()},
 positions:{model:'position',search:['name'],write:'hr:write',schema:z.object({name:text}).strict()},
 contracts:{model:'employmentContract',scope:'employee',search:['title'],write:'hr:write',schema:z.object({...employee,title:text,starts_on:date,ends_on:date.nullable().optional(),base_salary:money,status:z.enum(['DRAFT','ACTIVE','EXPIRED','TERMINATED']).optional()}).strict()},
 shifts:{model:'shift',search:['name'],write:'hr:write',schema:z.object({name:text,start_minute:z.number().int().min(0).max(1439),end_minute:z.number().int().min(0).max(1439),break_minutes:z.number().int().min(0).max(240),grace_minutes:z.number().int().min(0).max(60),weekdays:z.array(z.number().int().min(1).max(7)).min(1).max(7)}).strict()},
 schedule:{model:'shiftAssignment',scope:'employee',write:'hr:write',schema:z.object({...employee,shift_id:id,starts_on:date,ends_on:date}).strict()},
 attendance:{model:'attendanceSession',scope:'employee',sort:'work_date'},
 corrections:{model:'attendanceCorrection',scope:'employee',schema:z.object({...employee,attendance_id:id,requested_in:timestamp,requested_out:timestamp.nullable().optional(),reason}).strict()},
 timesheets:{model:'timesheetPeriod',write:'hr:write',schema:z.object({name:text,starts_on:date,ends_on:date}).strict()},
 leave:{model:'leaveRequest',scope:'employee',schema:z.object({...employee,type_id:id,starts_on:date,ends_on:date,reason}).strict()},
 'leave-types':{model:'leaveType',write:'hr:write',schema:z.object({name:text,annual_days:z.number().int().min(0).max(366),paid:z.boolean()}).strict()},
 'leave-balances':{model:'leaveBalance',scope:'employee',write:'hr:write',schema:z.object({...employee,type_id:id,year:z.number().int().min(1900).max(2200),granted:z.number().int().min(0).max(366),reason}).strict()},
 overtime:{model:'overtimeRequest',scope:'employee',schema:z.object({...employee,starts_at:timestamp,ends_at:timestamp,reason}).strict()},
 payroll:{model:'payrollPeriod',scope:'payroll',write:'payroll:write',schema:z.object({name:text,timesheet_id:id}).strict()},
 'payroll-components':{model:'salaryComponent',scope:'employee',write:'payroll:write',schema:z.object({...employee,name:text,amount:money,kind:z.enum(['BASE','ALLOWANCE','ADJUSTMENT']),reason}).strict()},
 performance:{model:'performanceReview',scope:'employee',schema:z.object({...employee,cycle_id:id,self_comment:z.string().max(4000).nullable().optional(),manager_comment:z.string().max(4000).nullable().optional(),score:z.number().int().min(1).max(5).nullable().optional()}).strict()},
 'review-cycles':{model:'reviewCycle',write:'hr:write',schema:z.object({name:text,starts_on:date,ends_on:date}).strict()},
 documents:{model:'document',scope:'document',search:['title']},
 announcements:{model:'announcement',scope:'announcement',search:['title'],write:'hr:write',schema:z.object({title:text,body:z.string().min(1).max(20000),audience:z.array(z.enum(roles)).min(1)}).strict()},
 notifications:{model:'notification',scope:'admin'},
 users:{model:'user',scope:'admin',search:['email'],write:'system:manage',schema:z.object({email:z.email().max(254).toLowerCase(),employee_id:id.nullable().optional(),role:z.enum(roles),capabilities:z.array(z.enum(capabilities)),new_password:z.string().min(12).max(128).optional()}).strict()},
 audit:{model:'auditEvent',scope:'admin',sort:'created_at'},
};
export type Row=Record<string,unknown>&{id:string;employee_id?:string;status?:string};
export function projectRow(actor:Actor,resource:string,row:Row){
 const safe={...row};delete safe.password_hash;delete safe.storage_key;
 if(resource==='contracts'&&!can(actor,'payroll:read'))delete safe.base_salary;
 if(resource==='performance'&&row.employee_id===actor.employee_id&&row.status!=='PUBLISHED'&&!can(actor,'hr:write')){delete safe.manager_comment;delete safe.score;}
 return safe;
}
export type Store={findMany(args:Record<string,unknown>):Promise<Row[]>;findFirst(args:Record<string,unknown>):Promise<Row|null>;findUnique(args:Record<string,unknown>):Promise<Row|null>;count(args:Record<string,unknown>):Promise<number>;create(args:Record<string,unknown>):Promise<Row>;update(args:Record<string,unknown>):Promise<Row>};
export function store(tx:Prisma.TransactionClient,resource:string):Store{
  const entry=resources[resource];if(!entry)throw new AppError('NOT_FOUND',404);
  return (tx as unknown as Record<string,Store>)[entry.model];
}
