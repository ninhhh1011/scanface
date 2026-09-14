import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
const origin=process.env.APP_URL??'http://127.0.0.1:3000';
const credentials=JSON.parse(readFileSync('.local/credentials.json','utf8'));
const results=[];
const cleanup=[];
let cookie='';
async function call(path,body,method=body?'POST':'GET'){
 const response=await fetch(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body&&method!=='GET'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={non_json_length:text.length};}
 results.push({path,method,status:response.status,data});
 return {response,data};
}
try{
 let result=await call('/api/healthz');assert.equal(result.response.status,200);
 result=await call('/api/auth/me');assert.equal(result.response.status,401);
 result=await call('/api/auth/login',{email:'admin@abc.example',password:credentials['admin@abc.example']});assert.equal(result.response.status,200,JSON.stringify(result.data));
 cookie=result.response.headers.get('set-cookie')?.split(';')[0]??'';assert.ok(cookie);assert.match(result.response.headers.get('set-cookie'),/HttpOnly/);
 result=await call('/api/auth/me');assert.equal(result.data.user.role,'SUPER_ADMIN');assert.ok(!('password_hash'in result.data.user));
 result=await call('/api/compatibility');assert.equal(result.response.status,200,JSON.stringify(result.data));assert.equal(result.data.vector_distance,0);assert.ok(result.data.employees>=20);
 const compatibility=result.data;assert.equal(compatibility.python.models_ready,true);
 result=await call('/api/hr/departments',{name:'Worker transaction smoke '+crypto.randomUUID()});assert.equal(result.response.status,201,JSON.stringify(result.data));cleanup.push({table:'departments',id:result.data.id});
 result=await call('/api/hr/departments/'+result.data.id);assert.equal(result.response.status,200);
 const form=new FormData();form.set('file',new File(['Private Worker upload evidence'],'smoke.txt',{type:'text/plain'}));form.set('title','Worker private storage smoke');
 const upload=await fetch(origin+'/api/files',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:form});const uploaded=await upload.json();assert.equal(upload.status,201,JSON.stringify(uploaded));cleanup.push({table:'documents',id:uploaded.id});
 let download=await fetch(origin+'/api/files/'+uploaded.id,{headers:{Cookie:cookie}});assert.equal(await download.text(),'Private Worker upload evidence');
 const denied=await fetch(origin+'/api/files/'+uploaded.id);assert.equal(denied.status,401);
 result=await call('/api/files/'+uploaded.id,undefined,'DELETE');assert.equal(result.response.status,200);
 results.push({path:'/api/files',private_upload_download:true,unauthorized_status:denied.status});
 if(!process.env.LLM_API_KEY){result=await call('/api/assistant',{message:'Hôm nay tôi chấm công lúc mấy giờ?'});assert.equal(result.response.status,503);assert.equal(result.data.error.code,'AI_NOT_CONFIGURED');}
 console.log(JSON.stringify({checks:results.length,status:'PASS_RUNTIME_SLICE',compatibility,provider_integration:process.env.LLM_API_KEY?'IMPLEMENTED_NOT_VERIFIED':'NEEDS_CONFIGURATION'}));
}finally{
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{for(const item of cleanup){await pool.query('DELETE FROM audit_events WHERE resource_id=$1',[item.id]);if(item.table==='departments')await pool.query('DELETE FROM departments WHERE id=$1',[item.id]);else await pool.query('DELETE FROM documents WHERE id=$1 AND deleted_at IS NOT NULL',[item.id]);}}finally{await pool.end();}
 writeFileSync('artifacts/verification/compatibility-smoke.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
}
