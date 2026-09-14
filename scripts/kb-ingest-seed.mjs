import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const origin=new URL(process.env.APP_URL??'http://127.0.0.1:3000').origin;
const credentials=JSON.parse(await readFile('.local/credentials.json','utf8'));
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'hr@abc.example',password:credentials['hr@abc.example']})});
if(!login.ok)throw new Error(`LOGIN_FAILED:${login.status}`);
const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('LOGIN_COOKIE_MISSING');
async function call(route,options={}){
  const response=await fetch(origin+route,{...options,headers:{Origin:origin,Cookie:cookie,...options.headers},signal:AbortSignal.timeout(60000)});
  const data=await response.json();if(!response.ok)throw new Error(`KB_API:${response.status}:${data.error?.code}`);return data;
}
const existing=[];for(let page=1;;page++){const batch=await call('/api/knowledge?page='+page);existing.push(...batch.items);if(existing.length>=batch.total)break;}
const results=[];
for(const filename of (await readdir('data/seed/policies')).filter(f=>f.endsWith('.md')).sort()){
  const content=await readFile(path.join('data/seed/policies',filename),'utf8'),title=content.split('\n')[0].replace(/^#\s*/,'').trim();
  const present=existing.find(d=>d.title===title);
  if(present){results.push({filename,id:present.id,status:'EXISTS',versions:present.versions.map(v=>({id:v.id,status:v.status,job_status:v.job?.status}))});continue;}
  const form=new FormData();form.set('file',new File([content],filename,{type:'text/markdown'}));form.set('title',title);form.set('version','1.0');form.set('effective_from','2026-09-01T00:00:00+07:00');
  form.set('classification',filename.startsWith('10-')?'CONFIDENTIAL':'GENERAL');
  form.set('allowed_roles',JSON.stringify(filename.startsWith('10-')?['SUPER_ADMIN','HR_ADMIN']:['SUPER_ADMIN','HR_ADMIN','MANAGER','EMPLOYEE']));
  results.push({filename,...await call('/api/knowledge',{method:'POST',body:form})});
}
await mkdir('artifacts/verification',{recursive:true});
await writeFile('artifacts/verification/kb-seed-upload.json',JSON.stringify({at:new Date().toISOString(),results,indexing:'Separate real embedding worker; no automatic publish'},null,2));
console.log(JSON.stringify({uploaded:results.filter(r=>r.status==='QUEUED').length,existing:results.filter(r=>r.status==='EXISTS').length,total:results.length,indexing:'PENDING_WORKER_OR_CONFIGURATION'}));
