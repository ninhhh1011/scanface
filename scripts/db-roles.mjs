import {readFileSync,writeFileSync} from 'node:fs';
import {syncWebConfig} from './setup.mjs';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
if(process.env.APP_ENV==='production'&&!process.argv.includes('--provision'))throw new Error('Use a database owner explicitly with --provision for project roles');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const credential=randomBytes(32).toString('hex');
try{
 const exists=await pool.query("SELECT 1 FROM pg_roles WHERE rolname='abc_ai'");
 if(!exists.rowCount)await pool.query(`CREATE ROLE abc_ai LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
 const database=(await pool.query('SELECT current_database() AS name')).rows[0].name;
 await pool.query('GRANT CONNECT ON DATABASE "'+database.replaceAll('"','""')+'" TO abc_ai');
 await pool.query('GRANT USAGE ON SCHEMA public TO abc_ai');
 await pool.query('GRANT SELECT (id,status) ON employees TO abc_ai');
 await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON face_profiles,face_templates,enrollment_consents,face_challenges,face_verifications,service_nonces TO abc_ai');
 await pool.query('GRANT INSERT ON audit_events TO abc_ai');
 await pool.query('REVOKE UPDATE ON knowledge_documents,document_versions,ingestion_jobs FROM abc_ai');
 await pool.query('GRANT SELECT ON knowledge_documents,document_versions,ingestion_jobs TO abc_ai');
 await pool.query('GRANT UPDATE(status) ON knowledge_documents TO abc_ai');
 await pool.query('GRANT UPDATE(status,content_hash) ON document_versions TO abc_ai');
 await pool.query('GRANT UPDATE(status,attempts,error_code,locked_at,available_at,updated_at,checkpoint) ON ingestion_jobs TO abc_ai');
 await pool.query('GRANT SELECT,INSERT,DELETE ON document_chunks TO abc_ai');
 await pool.query('GRANT EXECUTE ON FUNCTION face_session_scope(text,text,text) TO abc_ai');
 if(!exists.rowCount){const url=new URL(process.env.DATABASE_URL);url.username='abc_ai';url.password=credential;let env=readFileSync('.env','utf8');env=env.replace(/^AI_DATABASE_URL=.*\r?\n?/m,'');writeFileSync('.env',env.trimEnd()+'\nAI_DATABASE_URL='+url.toString()+'\n',{mode:0o600});}
 syncWebConfig();
 const checks=await pool.query("SELECT has_table_privilege('abc_ai','payroll_items','UPDATE') AS payroll_write,has_column_privilege('abc_ai','users','password_hash','SELECT') AS passwords_read,has_table_privilege('abc_ai','employees','UPDATE') AS employee_write");
 if(Object.values(checks.rows[0]).some(Boolean))throw new Error('AI_ROLE_EXCESSIVE_PRIVILEGES');
 console.log('AI restricted role provisioned; payroll writes, employee writes and password reads denied. Secret stored in ignored .env only.');
}finally{await pool.end();}
