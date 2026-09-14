import { z } from 'zod';
import type { Prisma } from '@prisma/client';
export const settingSchemas={
 attendance_policy:z.object({early_checkin_minutes:z.number().int().min(0).max(240).default(240),max_session_hours:z.number().int().min(1).max(36).default(36)}).strict(),
 leave_policy:z.object({max_request_days:z.number().int().min(1).max(366).default(366)}).strict(),
 payroll_policy:z.object({prorate_base:z.boolean().default(false),standard_minutes:z.number().int().min(1).max(44640).default(10560)}).strict(),
};
export async function businessSettings<K extends keyof typeof settingSchemas>(tx:Prisma.TransactionClient,key:K){
 const row=await tx.setting.findUnique({where:{key}});
 return settingSchemas[key].parse(row?.value??{}) as z.output<typeof settingSchemas[K]>;
}
