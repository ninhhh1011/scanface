import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { config } from 'dotenv';
import pg from 'pg';
import { it,expect } from 'vitest';
config({path:'.env',quiet:true});

it.skipIf(process.env.RUN_SECURITY_HTTP_TESTS!=='1')('actual Workers HTTP denies cross-scope, CSRF, forged biometric proof and revoked sessions',async()=>{
 const origin=new URL(process.env.APP_URL??'http://127.0.0.1:3000').origin;
 const credentials=JSON.parse(await readFile('.local/credentials.json','utf8'));
 const results:{path:string;method:string;status:number}[]=[];
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 const cookies:Record<string,string>={};let fileId:string|undefined,passed=false;
 async function call(path:string,role='',method='GET',body?:object|string,requestOrigin=origin){
  const response=await fetch(origin+path,{method,headers:{Origin:requestOrigin,...(cookies[role]?{Cookie:cookies[role]}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  results.push({path,method,status:response.status});
  if(response.status!==413){expect(response.headers.get('cache-control')??'').toContain('no-store');expect(response.headers.get('x-content-type-options')??'').toBe('nosniff');}return response;
 }
 function noSecrets(value:unknown){
  if(Array.isArray(value)){value.forEach(noSecrets);return;}
  if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
   expect(['password_hash','storage_key','session_id','ciphertext','embedding','encrypted_template','api_key','service_auth_key','face_encryption_key']).not.toContain(key.toLowerCase());noSecrets(child);
  }
 }
 try{
  for(const path of ['/api/hr/employees','/api/hr/attendance','/api/hr/payroll','/api/hr/users','/api/hr/audit','/api/files/unknown','/api/knowledge'])expect((await call(path)).status).toBe(401);
  expect((await call('/api/face/attendance','','POST',{proof_id:'fabricated',action:'CHECK_IN'})).status).toBe(401);
  for(const role of ['admin','employee','manager']){
   const response=await call('/api/auth/login','','POST',{email:role+'@abc.example',password:credentials[role+'@abc.example']});expect(response.status).toBe(200);
   const header=response.headers.get('set-cookie')??'';expect(header).toContain('HttpOnly');expect(header).toContain('SameSite=Lax');
   cookies[role]=header.split(';')[0];expect(cookies[role]).not.toBe('');
   const me=await call('/api/auth/me',role);expect(me.status).toBe(200);noSecrets(await me.json());
  }
  expect((await call('/api/hr/departments','admin','POST',{name:'Must never exist'},'https://untrusted.example')).status).toBe(403);
  expect((await call('/api/auth/logout','employee','POST',{},'')).status).toBe(403);
  expect((await call('/api/auth/me','employee')).status).toBe(200);
  expect((await call('/api/hr/employees/NV006','employee')).status).toBe(403);
  expect((await call('/api/hr/employees/NV006','manager')).status).toBe(403);
  for(const role of ['employee','manager'])for(const resource of ['attendance','payroll-components','documents']){
   const response=await call(`/api/hr/${resource}?employee_id=NV006`,role);expect(response.status).toBe(200);expect((await response.json()).items).toEqual([]);
  }
  const record=(await pool.query('SELECT id FROM attendance_sessions WHERE employee_id=$1 LIMIT 1',['NV006'])).rows[0];expect(record).toBeTruthy();
  expect((await call('/api/hr/attendance/'+record.id,'employee')).status).toBe(403);
  expect((await call('/api/hr/attendance/'+record.id,'manager')).status).toBe(403);
  const contract=(await pool.query('SELECT id FROM contracts WHERE employee_id=$1 LIMIT 1',['NV006'])).rows[0];expect(contract).toBeTruthy();
  for(const role of ['employee','manager'])expect((await call('/api/hr/contracts/'+contract.id,role)).status).toBe(403);
  expect((await call('/api/hr/users','employee')).status).toBe(403);
  expect((await call('/api/hr/audit','manager')).status).toBe(403);
  const exported=await call('/api/hr/attendance/export?employee_id=NV006','employee');expect(exported.status).toBe(200);expect(await exported.text()).not.toContain('NV006');
  const form=new FormData();form.set('file',new File(['Private HTTP ACL fixture'],'acl.txt',{type:'text/plain'}));form.set('title','Security HTTP ACL fixture');form.set('employee_id','NV006');
  const upload=await fetch(origin+'/api/files',{method:'POST',headers:{Origin:origin,Cookie:cookies.admin},body:form,signal:AbortSignal.timeout(30000)});results.push({path:'/api/files',method:'POST',status:upload.status});expect(upload.status).toBe(201);
  const uploaded=await upload.json();noSecrets(uploaded);fileId=uploaded.id;expect(fileId).toBeTruthy();
  expect((await call('/api/files/'+fileId,'admin')).status).toBe(200);
  for(const role of ['employee','manager']){
   expect((await call('/api/files/'+fileId,role)).status).toBe(403);
   expect((await call('/api/files/'+fileId,role,'DELETE')).status).toBe(403);
  }
  noSecrets(await(await call('/api/hr/users','admin')).json());noSecrets(await(await call('/api/hr/employees','admin')).json());
  const ownContracts=await(await call('/api/hr/contracts','employee')).json();for(const row of ownContracts.items)expect(row).not.toHaveProperty('base_salary');
  const proofId='fabricated-http-'+crypto.randomUUID();
  for(let attempt=0;attempt<2;attempt++){const response=await call('/api/face/attendance','employee','POST',{proof_id:proofId,action:'CHECK_IN'});expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('INVALID_PROOF');}
  expect((await call('/api/face/attendance','employee','POST',{proof_id:proofId,action:'CHECK_IN',employee_id:'NV006',isLive:true})).status).toBe(422);
  expect((await call('/api/face/challenge','employee','POST',{employee_id:'NV006',action:'CHECK_IN',consent:true})).status).toBe(403);
  expect((await call('/api/face/challenge','employee','POST',{action:'CHECK_IN',consent:true,isLive:true})).status).toBe(422);
  expect(Number((await pool.query('SELECT count(*) AS count FROM attendance_events WHERE proof_id=$1',[proofId])).rows[0].count)).toBe(0);
  expect((await call('/api/face/verify','employee','POST','x'.repeat(14*1024*1024+1))).status).toBe(413);
  expect((await call('/api/auth/logout','employee','POST',{})).status).toBe(200);
  expect((await call('/api/auth/me','employee')).status).toBe(401);
  expect((await call('/api/hr/leave','employee','POST',{})).status).toBe(401);
  delete cookies.employee;
  passed=true;
 }finally{
  try{
   if(fileId)expect((await call('/api/files/'+fileId,'admin','DELETE')).status).toBe(200);
   for(const role of ['admin','manager','employee'])if(cookies[role])expect((await call('/api/auth/logout',role,'POST',{})).status).toBe(200);
  }catch(error){passed=false;throw error;}finally{
   await pool.end();await mkdir('artifacts/verification',{recursive:true});
   await writeFile('artifacts/verification/security-http.json',JSON.stringify({at:new Date().toISOString(),status:passed?'IMPLEMENTED_AND_VERIFIED':'FAILED',classification:'Actual Workers HTTP and PostgreSQL; fabricated proof only tests rejection; no enrollment or provider success',results},null,2));
  }
 }
},180000);
