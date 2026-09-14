import {existsSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {loadEnvFile} from 'node:process';
import pg from 'pg';

if (existsSync('.env')) loadEnvFile('.env');
const checks = [];
const add = (name, status, detail) => checks.push({name, status, ...(detail ? {detail} : {})});
const present = names => names.filter(name => !process.env[name]);
function report(status, exitCode, filename='doctor.json') {
  const result = {at:new Date().toISOString(),status,checks};
  mkdirSync('artifacts/verification',{recursive:true});
  writeFileSync('artifacts/verification/'+filename,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  process.exitCode=exitCode;
}
const required = present(['APP_URL','DATABASE_URL','AUTH_SECRET','SERVICE_AUTH_KEY','FACE_ENCRYPTION_KEY','AI_SERVICE_URL']);
add('core_configuration', required.length ? 'FAIL' : 'PASS', required.length ? {missing:required} : undefined);
if (process.argv.includes('--deploy')) {
  const missing = present(['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','AI_DATABASE_URL']);
  const https = ['APP_URL','AI_SERVICE_URL'].every(name=>{
    try { const url=new URL(process.env[name]); return url.protocol==='https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname); } catch { return false; }
  });
  const production=process.env.APP_ENV==='production';
  add('deployment_configuration',!missing.length && https && production ? 'PASS' : 'BLOCKED',{missing,https,production});
  add('online_acceptance','NOT_RUN','Configuration check only; no provisioning, deployment, webcam or online success inferred');
  report('DEPLOYMENT_PENDING',required.length?1:missing.length||!https||!production?2:0,'deploy-check.json');
  process.exit(process.exitCode);
}
add('node', Number(process.versions.node.split('.')[0]) >= 22 ? 'PASS' : 'FAIL', process.versions.node);
for (const [name, executable, args] of [['docker','docker',['--version']],['python','services/ai/.venv/Scripts/python.exe',['--version']]]) {
  const result = spawnSync(executable,args,{encoding:'utf8',timeout:10000,windowsHide:true});
  add(name,result.status === 0 ? 'PASS' : 'FAIL',result.status === 0 ? result.stdout.trim() : 'Unavailable; see README setup');
}
const design = createHash('sha256').update(readFileSync('reviews.io-design.md')).digest('hex');
add('design_unchanged',design === 'f2e405a9bf15ff732b1834007c4c2f7e393514b5cfa6cb659031e1b9bcc41edb' ? 'PASS' : 'FAIL');
let storedFileId;
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
try {
  const result = await pool.query("SELECT version() AS version, '[1,0,0]'::vector <=> '[1,0,0]'::vector AS distance");
  add('postgres_pgvector',Number(result.rows[0].distance) === 0 ? 'PASS' : 'FAIL');
  const count = await pool.query("SELECT (SELECT count(*) FROM employees)::int AS employees, (SELECT count(*) FROM face_profiles WHERE status='ENROLLED')::int AS enrolled, (SELECT count(*) FROM document_chunks)::int AS chunks");
  add('persistent_records','OBSERVED',count.rows[0]);
  const jobs = await pool.query('SELECT status,error_code,count(*)::int AS count FROM ingestion_jobs GROUP BY status,error_code');
  add('ingestion_jobs','OBSERVED',jobs.rows);
  const files = await pool.query('SELECT id FROM documents WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1');
  storedFileId = files.rows[0]?.id;
} catch { add('postgres_pgvector','FAIL','Database or migration unavailable'); }
finally { await pool.end(); }
try {
  const response = await fetch(process.env.AI_SERVICE_URL+'/readyz',{headers:{Authorization:'Bearer '+process.env.SERVICE_AUTH_KEY},signal:AbortSignal.timeout(10000)});
  const state = await response.json();
  add('python_model_readiness',response.ok && state.models_ready && state.inference_checked && state.database_ready && state.encryption_ready ? 'PASS' : 'FAIL',Object.fromEntries(['status','models_ready','inference_checked','database_ready','encryption_ready','model_version','dimension'].map(key=>[key,state[key]])));
} catch { add('python_model_readiness','FAIL','Service unavailable'); }
const origin = process.env.APP_URL;
let cookie;
try {
  const health = await fetch(origin+'/api/healthz',{signal:AbortSignal.timeout(10000)});
  add('web_reachable',health.ok ? 'PASS' : 'FAIL');
  if (existsSync('.local/credentials.json')) {
    const credentials = JSON.parse(readFileSync('.local/credentials.json','utf8'));
    const login = await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'admin@abc.example',password:credentials['admin@abc.example']}),signal:AbortSignal.timeout(30000)});
    cookie = login.headers.get('set-cookie')?.split(';')[0];
    add('web_database_session',login.ok && cookie ? 'PASS' : 'FAIL');
    if (cookie && storedFileId) {
      const response = await fetch(origin+'/api/files/'+storedFileId,{headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)});
      const bytes = (await response.arrayBuffer()).byteLength;
      const denied = await fetch(origin+'/api/files/'+storedFileId,{signal:AbortSignal.timeout(10000)});
      add('private_storage_read',response.ok && bytes > 0 && denied.status === 401 ? 'PASS' : 'FAIL');
    } else add('private_storage_read','NOT_RUN','Run the upload/download smoke after seed documents are uploaded');
  } else add('web_database_session','NOT_RUN','Local seed credentials absent; use authenticated online smoke');
} catch { add('web_reachable','FAIL','Web runtime unavailable'); }
finally { if(cookie) { try { await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie},signal:AbortSignal.timeout(10000)}); } catch {} } }
for (const prefix of ['LLM','EMBEDDING']) {
  const missing = present([prefix+'_PROVIDER',prefix+'_BASE_URL',prefix+'_API_KEY',prefix+'_MODEL',...(prefix==='EMBEDDING'?['EMBEDDING_DIMENSION']:[])]);
  add(prefix.toLowerCase()+'_provider',missing.length ? 'BLOCKED' : 'NOT_RUN',missing.length ? {missing} : 'Configured; run explicitly authorized real provider evaluation');
}
add('human_face_acceptance','BLOCKED','Consent and webcam enrollment/evaluation by NV001–NV003 and an unknown participant required; health checks do not capture faces');
const failures = checks.filter(check=>check.status==='FAIL').length;
const pending = checks.filter(check=>['BLOCKED','NOT_RUN'].includes(check.status)).length;
report(failures?'FAIL':pending?'CORE_READY_WITH_PENDING_GATES':'PASS',failures?1:0);
