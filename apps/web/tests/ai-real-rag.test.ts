import { config } from 'dotenv';
import { it,expect } from 'vitest';
import { withDb,db } from '../src/server/db';
import { tokenHash } from '../src/server/password';
import { api } from '../src/server/http';
import { assistantRoute } from '../src/server/ai/workflow';
config({path:'.env',quiet:true});
it.skipIf(process.env.RUN_AI_PROVIDER_TESTS!=='1'||!process.env.LLM_API_KEY||!process.env.EMBEDDING_API_KEY)('REAL provider + real embeddings + published policy citation end to end',async()=>{
  const raw=crypto.randomUUID(),id=await tokenHash(raw),origin=process.env.APP_URL??'http://127.0.0.1:3000';let chatId:string|undefined;
  await withDb(async()=>{expect(await db().knowledgeDocument.count({where:{status:'ACTIVE'}})).toBeGreaterThan(0);await db().session.create({data:{id,user_id:'user-hr',expires_at:new Date(Date.now()+120000)}});});
  try{
    const route=api(assistantRoute),headers={Origin:origin,Cookie:`abc_session=${raw}`,'Content-Type':'application/json'};
    const response=await route(new Request(origin+'/api/assistant',{method:'POST',headers,body:JSON.stringify({message:'Quy định đi muộn hiện tại thế nào?'})})),result=await response.json();
    expect(response.status).toBe(200);chatId=result.session_id;expect(result.route).toBe('POLICY');expect(result.citations.length).toBeGreaterThan(0);
    for(const citation of result.citations){const source=await route(new Request(origin+citation.url,{headers}));expect(source.status).toBe(200);expect((await source.json()).id).toBe(citation.id);}
  }finally{
    await withDb(async()=>{await db().session.deleteMany({where:{id}});if(chatId){await db().chatMessage.deleteMany({where:{session_id:chatId}});await db().chatSession.deleteMany({where:{id:chatId}});}});
  }
},90000);
