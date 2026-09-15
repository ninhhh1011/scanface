import { db } from './db';
import { can,authorizeEmployee,type Actor } from './policy';
import { AppError } from './domain';
import { audit } from './audit';
import type { Document } from '@prisma/client';
import { locked } from './workflows';
type Bucket={put(key:string,value:ArrayBuffer,options?:unknown):Promise<unknown>;get(key:string):Promise<{body:ReadableStream}|null>;delete(key:string):Promise<void>};
async function bucket():Promise<Bucket>{const {env}=await import('cloudflare:workers');const b=(env as unknown as {PRIVATE_FILES?:Bucket})?.PRIVATE_FILES;if(!b)throw new AppError('STORAGE_UNAVAILABLE',503);return b;}
const types:Record<string,string>={txt:'text/plain',md:'text/markdown',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
export async function storeFile(actor:Actor,file:File,metadata:{title:string;employee_id?:string;classification?:string;contract_id?:string}){
  if(!can(actor,'hr:write')&&!can(actor,'knowledge:write'))throw new AppError('PERMISSION_DENIED',403);
  if(metadata.employee_id)await authorizeEmployee(actor,metadata.employee_id);
  if(metadata.employee_id&&!can(actor,'hr:write'))throw new AppError('PERMISSION_DENIED',403);
  const classification=metadata.classification??'GENERAL';
  if(!['GENERAL','CONFIDENTIAL','IDENTITY'].includes(classification))throw new AppError('INVALID_CLASSIFICATION');
  if(classification==='IDENTITY'&&!can(actor,'documents:sensitive'))throw new AppError('PERMISSION_DENIED',403);
  if(!metadata.title.trim()||metadata.title.length>200)throw new AppError('INVALID_TITLE');
  if(metadata.contract_id){const contract=await db().employmentContract.findUnique({where:{id:metadata.contract_id}});if(!contract||contract.employee_id!==metadata.employee_id)throw new AppError('INVALID_CONTRACT');}
  const ext=file.name.toLowerCase().split('.').at(-1)!;
  if(!types[ext]||file.size===0||file.size>10*1024*1024)throw new AppError('UNSUPPORTED_FILE_OR_SIZE',422);
  const bytes=await file.arrayBuffer();const magic=new Uint8Array(bytes).slice(0,8);
  if((ext==='pdf'&&new TextDecoder().decode(magic.slice(0,5))!=='%PDF-')||(ext==='docx'&&(magic[0]!==80||magic[1]!==75))||(['jpg','jpeg'].includes(ext)&&(magic[0]!==255||magic[1]!==216))||(ext==='png'&&(magic[0]!==137||magic[1]!==80)))throw new AppError('FILE_TYPE_MISMATCH',422);
  const id=crypto.randomUUID(),storage_key=`private/${id}`;const storage=await bucket();
  await storage.put(storage_key,bytes);
  try{return await locked(async tx=>{const result=await tx.document.create({data:{id,owner_id:actor.id,employee_id:metadata.employee_id,contract_id:metadata.contract_id,title:metadata.title,filename:file.name.slice(0,180).replace(/[\r\n\\/]/g,'_'),mime_type:types[ext],size:bytes.byteLength,storage_key,classification}});await audit(tx,actor,'upload','document',id);return result;},actor);}catch(error){await storage.delete(storage_key);throw error;}
}
export async function authorizeFile(actor:Actor,id:string){
  const record=await db().document.findFirst({where:{id,deleted_at:null}});if(!record)throw new AppError('NOT_FOUND',404);
  if(record.employee_id)await authorizeEmployee(actor,record.employee_id);
  else if(record.owner_id!==actor.id&&!(can(actor,'knowledge:write')&&await db().documentVersion.count({where:{file_id:id}})))throw new AppError('PERMISSION_DENIED',403);
  if(record.classification==='IDENTITY'&&!can(actor,'documents:sensitive')&&record.employee_id!==actor.employee_id)throw new AppError('PERMISSION_DENIED',403);
  return record;
}
export async function fileResponse(record:Document){
  const object=await(await bucket()).get(record.storage_key);if(!object)throw new AppError('STORAGE_UNAVAILABLE',503);
  return new Response(object.body,{headers:{'Content-Type':record.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`,'X-File-Name':encodeURIComponent(record.filename),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function readFile(actor:Actor,id:string){return fileResponse(await authorizeFile(actor,id));}
export async function deleteFile(actor:Actor,id:string){
  const record=await authorizeFile(actor,id);if(!can(actor,'hr:write')&&!can(actor,'knowledge:write'))throw new AppError('PERMISSION_DENIED',403);
  if(record.employee_id&&!can(actor,'hr:write'))throw new AppError('PERMISSION_DENIED',403);
  if(await db().documentVersion.count({where:{file_id:id}}))throw new AppError('KNOWLEDGE_FILE_IN_USE',409);
  await locked(async tx=>{await tx.document.update({where:{id},data:{deleted_at:new Date()}});await audit(tx,actor,'delete','document',id);},actor);
  await(await bucket()).delete(record.storage_key);
}
export async function removeStoredFile(storage_key:string){await(await bucket()).delete(storage_key);}
