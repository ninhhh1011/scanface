import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
const dir='prisma/migrations/202609130001_initial';mkdirSync(dir,{recursive:true});
const initial='prisma/migrations/0001_initial.sql';
if(existsSync(initial))renameSync(initial,`${dir}/migration.sql`);
const file=`${dir}/migration.sql`;let sql=readFileSync(file,'utf8');
if(!sql.includes('CREATE EXTENSION'))sql='CREATE EXTENSION IF NOT EXISTS vector;\nCREATE EXTENSION IF NOT EXISTS btree_gist;\n'+sql;
const refs={users:{employee_id:'employees'},sessions:{user_id:'users'},employees:{department_id:'departments',position_id:'positions',manager_id:'employees'},contracts:{employee_id:'employees'},shift_assignments:{employee_id:'employees',shift_id:'shifts'},attendance_sessions:{employee_id:'employees',shift_id:'shifts'},attendance_events:{employee_id:'employees',session_id:'attendance_sessions',proof_id:'face_verifications'},attendance_corrections:{employee_id:'employees',attendance_id:'attendance_sessions'},leave_balances:{employee_id:'employees',type_id:'leave_types'},leave_requests:{employee_id:'employees',type_id:'leave_types'},leave_ledger:{request_id:'leave_requests',employee_id:'employees',type_id:'leave_types'},overtime_requests:{employee_id:'employees'},payroll_periods:{timesheet_id:'timesheet_periods'},payroll_items:{period_id:'payroll_periods',employee_id:'employees'},salary_components:{employee_id:'employees'},documents:{employee_id:'employees',contract_id:'contracts',owner_id:'users'},announcements:{author_id:'users'},notifications:{user_id:'users'},performance_reviews:{employee_id:'employees',cycle_id:'review_cycles'},face_profiles:{employee_id:'employees'},face_templates:{profile_id:'face_profiles'},enrollment_consents:{employee_id:'employees',actor_id:'users'},face_challenges:{employee_id:'employees',actor_id:'users'},face_verifications:{employee_id:'employees',challenge_id:'face_challenges'},knowledge_documents:{owner_id:'users'},document_versions:{document_id:'knowledge_documents',file_id:'documents'},document_chunks:{version_id:'document_versions'},ingestion_jobs:{version_id:'document_versions'},chat_sessions:{user_id:'users'},chat_messages:{session_id:'chat_sessions'}};
if(!sql.includes('-- Domain constraints')){
sql+='\n-- Domain constraints\n';
for(const [table,fields]of Object.entries(refs))for(const [field,target]of Object.entries(fields))sql+=`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${field}_fkey" FOREIGN KEY ("${field}") REFERENCES "${target}"(id) ON DELETE RESTRICT;\n`;
sql+=`ALTER TABLE shift_assignments ADD CONSTRAINT no_assignment_overlap EXCLUDE USING gist (employee_id WITH =, daterange(starts_on,ends_on,'[]') WITH &&);
ALTER TABLE shift_assignments ADD CHECK (ends_on >= starts_on);
ALTER TABLE shifts ADD CHECK (start_minute BETWEEN 0 AND 1439 AND end_minute BETWEEN 0 AND 1439 AND break_minutes >= 0 AND grace_minutes >= 0);
ALTER TABLE attendance_sessions ADD CHECK (check_out IS NULL OR check_out >= check_in);
CREATE UNIQUE INDEX one_open_attendance ON attendance_sessions(employee_id) WHERE check_out IS NULL;
ALTER TABLE leave_balances ADD CHECK (used >= 0 AND used <= granted);
ALTER TABLE leave_requests ADD CHECK (ends_on >= starts_on AND days > 0);
ALTER TABLE leave_requests ADD CONSTRAINT no_active_leave_overlap EXCLUDE USING gist (employee_id WITH =, daterange(starts_on,ends_on,'[]') WITH &&) WHERE (status IN ('SUBMITTED','APPROVED'));
ALTER TABLE overtime_requests ADD CHECK (ends_at > starts_at);
ALTER TABLE overtime_requests ADD CONSTRAINT no_active_ot_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status IN ('SUBMITTED','APPROVED'));
ALTER TABLE performance_reviews ADD CHECK (score IS NULL OR score BETWEEN 1 AND 5);
ALTER TABLE timesheet_periods ADD CHECK (ends_on >= starts_on);
ALTER TABLE timesheet_periods ADD CONSTRAINT no_timesheet_overlap EXCLUDE USING gist (daterange(starts_on,ends_on,'[]') WITH &&);
ALTER TABLE users ADD CHECK (role IN ('SUPER_ADMIN','HR_ADMIN','MANAGER','EMPLOYEE'));
`;}
writeFileSync(file,sql);writeFileSync('prisma/migrations/migration_lock.toml','provider = "postgresql"\n');
console.log('Initial migration finalized with real foreign keys and overlap/attendance constraints.');
