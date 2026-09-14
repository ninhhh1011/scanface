import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { it,expect } from 'vitest';
config({path:'.env',quiet:true});
it.skipIf(process.env.RUN_AI_HTTP_TESTS!=='1')('real Workers preview auth, knowledge persistence, missing provider and source denial',async()=>{
  const origin=process.env.APP_URL??'http://127.0.0.1:3000',credentials=JSON.parse(await readFile('.local/credentials.json','utf8')),results:object[]=[];
  let cookie='';
  async function call(path:string,body?:object){
    const response=await fetch(origin+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(30000)});
    results.push({path,status:response.status});return response;
  }
  try{
    expect((await call('/api/assistant',{message:'Giờ chấm công của tôi?'})).status).toBe(401);
    const login=await call('/api/auth/login',{email:'hr@abc.example',password:credentials['hr@abc.example']});expect(login.status).toBe(200);cookie=login.headers.get('set-cookie')?.split(';')[0]??'';expect(cookie).not.toBe('');
    const list=await call('/api/knowledge');expect(list.status).toBe(200);expect(list.headers.get('cache-control')).toContain('no-store');
    const knowledge=await list.json();expect(knowledge.total).toBeGreaterThanOrEqual(10);expect(knowledge.items.some((d:{title:string})=>d.title==='Quy định chấm công ABC')).toBe(true);
    const policy=knowledge.items.find((d:{title:string})=>d.title==='Quy định chấm công ABC');
    if(policy.versions[0].status!=='READY')expect((await call(`/api/knowledge/${policy.id}/publish`,{version_id:policy.versions[0].id})).status).toBe(409);
    if(!process.env.LLM_API_KEY){const answer=await call('/api/assistant',{message:'Tôi còn bao nhiêu ngày phép?'});expect(answer.status).toBe(503);expect((await answer.json()).error.code).toBe('AI_NOT_CONFIGURED');const brief=await call('/api/assistant/brief');expect(brief.status).toBe(200);expect((await brief.json()).source).toBe('SYSTEM');}
    expect((await call('/api/knowledge/chunks/nonexistent-chunk')).status).toBe(404);
  }finally{await mkdir('artifacts/verification',{recursive:true});await writeFile('artifacts/verification/ai-workers-smoke.json',JSON.stringify({at:new Date().toISOString(),results},null,2));}
},90000);
