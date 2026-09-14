import {loadEnvFile} from 'node:process';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
loadEnvFile('.env');
const original=new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(original.hostname),'Local PostgreSQL only');
const database='abc_hrm_verify_'+randomBytes(8).toString('hex');
const owner=new pg.Pool({connectionString:original.toString()});
const isolated=new URL(original);isolated.pathname='/'+database;
const results=[];let created=false,pool;
mkdirSync('artifacts/verification',{recursive:true});
try{
 await owner.query(`CREATE DATABASE "${database}"`);created=true;
 const env={...process.env,DATABASE_URL:isolated.toString()};
 function run(name,args){
  const command=process.platform==='win32'?'cmd.exe':'npm';
  const argv=process.platform==='win32'?['/d','/s','/c','npm',...args]:args;
  const result=spawnSync(command,argv,{env,encoding:'utf8',windowsHide:true,timeout:120000});
  writeFileSync('artifacts/verification/fresh-'+name+'.log',(result.stdout??'')+(result.stderr??''));
  assert.equal(result.status,0,name+' failed; inspect log');results.push({name,exit_code:result.status});
 }
 run('migrate',['run','db:migrate']);run('seed',['run','db:seed']);
 pool=new pg.Pool({connectionString:isolated.toString()});
 let counts=(await pool.query('SELECT (SELECT count(*) FROM employees)::int employees,(SELECT count(*) FROM face_templates)::int templates,(SELECT count(*) FROM face_profiles)::int profiles,(SELECT count(*) FROM attendance_sessions WHERE check_out IS NULL)::int incomplete')).rows[0];
 assert.deepEqual(counts,{employees:20,templates:0,profiles:0,incomplete:1});
 await pool.query("UPDATE employees SET full_name='Persisted setup verification edit' WHERE id='NV001'");
 run('reseed',['run','db:seed']);
 assert.equal((await pool.query("SELECT full_name FROM employees WHERE id='NV001'")).rows[0].full_name,'Persisted setup verification edit');
 assert.equal((await pool.query('SELECT count(*)::int count FROM employees')).rows[0].count,20);
 results.push({name:'idempotence_preserves_edit',status:'PASS'}, {name:'fresh_counts',...counts});
 console.log('Fresh migrations +20 employees +zero biometrics +idempotent seed: PASS');
}catch(error){process.exitCode=1;results.push({name:'fresh_setup',status:'FAIL',error:error instanceof Error?error.name:'Error'});console.error('Fresh setup failed; inspect verification artifacts.');}
finally{
 await pool?.end();
 if(created){assert.match(database,/^abc_hrm_verify_[a-f0-9]{16}$/);await owner.query(`DROP DATABASE "${database}"`);}
 await owner.end();
 writeFileSync('artifacts/verification/fresh-setup.json',JSON.stringify({at:new Date().toISOString(),results,temporary_database_removed:created},null,2));
}
