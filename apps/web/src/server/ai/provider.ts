import { z } from 'zod';
import { config } from '../config';
import { AppError } from '../domain';
export function providerConfig(kind:'LLM'|'EMBEDDING'){
  const provider=config(`${kind}_PROVIDER`),base=config(`${kind}_BASE_URL`),key=config(`${kind}_API_KEY`),model=config(`${kind}_MODEL`);
  if(!['openai','openai-compatible'].includes(provider)||!base||!key||!model)throw new AppError('AI_NOT_CONFIGURED',503,'Chưa cấu hình nhà cung cấp AI.');
  let url:URL;try{url=new URL(base);}catch{throw new AppError('AI_NOT_CONFIGURED',503);}
  if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','host.docker.internal'].includes(url.hostname))))throw new AppError('AI_NOT_CONFIGURED',503);
  return {base:base.replace(/\/$/,''),key,model};
}
async function request(kind:'LLM'|'EMBEDDING',path:string,payload:object,signal?:AbortSignal){
  const p=providerConfig(kind);
  try{
    const response=await fetch(p.base+path,{method:'POST',headers:{Authorization:`Bearer ${p.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:p.model,...payload}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),redirect:'error'});
    if(!response.ok)throw new AppError('AI_PROVIDER_UNAVAILABLE',503);
    const reader=response.body?.getReader();if(!reader)throw new AppError('AI_PROVIDER_INVALID',502);
    const parts:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256_000){await reader.cancel();throw new AppError('AI_PROVIDER_INVALID',502);}parts.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  }catch(error){if(error instanceof AppError)throw error;throw new AppError('AI_PROVIDER_UNAVAILABLE',503);}
}
export async function generateJson<T>(instruction:string,input:unknown,schema:z.ZodType<T>,signal?:AbortSignal):Promise<T>{
  const raw=await request('LLM','/chat/completions',{messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_object'},max_completion_tokens:2000,stream:false,store:false},signal);
  const response=z.object({choices:z.array(z.object({finish_reason:z.literal('stop'),message:z.object({content:z.string().max(24000)})})).length(1)}).safeParse(raw);
  if(!response.success)throw new AppError('AI_PROVIDER_INVALID',502);
  try{return schema.parse(JSON.parse(response.data.choices[0].message.content));}catch{throw new AppError('AI_PROVIDER_INVALID',502);}
}
export async function embedQuery(text:string,signal?:AbortSignal){
  const model=providerConfig('EMBEDDING').model,dimension=Number(config('EMBEDDING_DIMENSION'));
  if(!Number.isInteger(dimension)||dimension<1||dimension>8192)throw new AppError('AI_NOT_CONFIGURED',503);
  const raw=await request('EMBEDDING','/embeddings',{input:[text],encoding_format:'float'},signal);
  const parsed=z.object({data:z.array(z.object({index:z.union([z.literal(0),z.undefined(),z.null()]).optional(),embedding:z.array(z.number().finite()).length(dimension)})).length(1)}).safeParse(raw);
  if(!parsed.success||parsed.data.data[0].embedding.every(x=>x===0))throw new AppError('AI_EMBEDDING_INVALID',502);
  return {model,dimension,vector:parsed.data.data[0].embedding};
}
