import { z } from 'zod';
import { AppError } from '../domain';
export const routes=['POLICY','PERSONAL_HR','TEAM_HR','ATTENDANCE','LEAVE','CONTRACT','HR_ANALYTICS','MIXED','UNSUPPORTED'] as const;
export const toolNames=['get_my_profile','get_my_attendance','get_my_leave_balance','get_team_attendance','get_recent_attendance','get_pending_approvals','get_contract_expiries','get_face_enrollment_status','get_department_statistics','get_employee_allowed_profile','get_my_payroll'] as const;
const date=z.iso.date();
export const toolArgsSchema=z.object({employee_id:z.string().min(1).max(80).optional(),date:date.optional(),from:date.optional(),to:date.optional(),days:z.number().int().min(1).max(90).optional(),limit:z.number().int().min(1).max(30).optional(),missing_only:z.boolean().optional()}).strict().default({});
export const planSchema=z.object({route:z.enum(routes),query:z.string().max(1000).default(''),tools:z.array(z.object({name:z.enum(toolNames),args:toolArgsSchema.default({})}).strict()).max(4).default([])}).strict().superRefine((p,c)=>{
  if((p.route==='POLICY'||p.route==='UNSUPPORTED')&&p.tools.length)c.addIssue({code:'custom',message:'Route cannot use HR tools'});
  if(p.route==='MIXED'&&(!p.tools.length||!p.query.trim()))c.addIssue({code:'custom',message:'Mixed requires policy and tools'});
  if(!['POLICY','UNSUPPORTED'].includes(p.route)&&!p.tools.length)c.addIssue({code:'custom',message:'HR routes require scoped evidence tools'});
});
export type ToolCall=z.infer<typeof planSchema>['tools'][number];
export const answerSchema=z.object({answer:z.string().min(1).max(6000),citation_ids:z.array(z.string().min(1).max(80)).max(8).default([])}).strict();
// Detection is defense in depth; SQL scope and field projection are the security boundary.
const sensitive=/(?:password_hash|private.key|SERVICE_AUTH_KEY|FACE_ENCRYPTION_KEY|DATABASE_URL|LLM_API_KEY|EMBEDDING_API_KEY|face[_ ](?:embedding|template)s?|raw[_ ]frames?|sk-[a-zA-Z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY)/i;
export function checkInput(value:string){
  const message=z.string().trim().min(1).max(2000).parse(value);
  if(sensitive.test(message)||/(?:ignore|bỏ qua).{0,30}(?:instructions|chỉ dẫn|hướng dẫn)|dump\s+salari|(?:system|developer)\s+prompt/i.test(message))throw new AppError('AI_INPUT_REJECTED',422,'Yêu cầu vượt quá phạm vi tra cứu nhân sự.');
  return message;
}
export function safeText(value:string){
  // oxlint-disable-next-line no-control-regex -- reject control characters before rendering model text.
  if(sensitive.test(value)||/[<>]|(?:https?:|data:|javascript:|file:|www\.)|!\[|\]\(/i.test(value)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new AppError('AI_OUTPUT_REJECTED',502);
  return value;
}
export function validateAnswer(value:unknown,evidenceIds:string[],policy:boolean){
  const output=answerSchema.parse(value);safeText(output.answer);
  if(output.citation_ids.some(id=>!evidenceIds.includes(id))||(policy&&evidenceIds.length>0&&!output.citation_ids.length))throw new AppError('INVALID_CITATION',502);
  return output;
}
