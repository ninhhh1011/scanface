import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { Actor,can,requireCapability } from '../policy';
import { AppError } from '../domain';
import { audit } from '../audit';
import { rateLimit } from '../auth';
import { embedQuery } from './provider';
export const metadataSchema=z.object({title:z.string().trim().min(1).max(180),classification:z.enum(['GENERAL','CONFIDENTIAL']),allowed_roles:z.array(z.enum(['SUPER_ADMIN','HR_ADMIN','MANAGER','EMPLOYEE'])).min(1).max(4)}).strict();
const effectiveDate=z.union([z.iso.date(),z.iso.datetime({offset:true}),z.date()]).pipe(z.coerce.date());
export const versionSchema=z.object({version:z.string().trim().min(1).max(40),effective_from:effectiveDate,effective_to:effectiveDate.optional()}).strict().refine(v=>!v.effective_to||v.effective_to>v.effective_from,'Effective end must follow start');
export function knowledgeAcl(actor:Actor){return {...(actor.role==='SUPER_ADMIN'?{}:{allowed_roles:{has:actor.role}}),...(can(actor,'documents:sensitive')?{}:{classification:'GENERAL'})};}
export const currentVersion=(now=new Date())=>({status:'READY',effective_from:{lte:now},OR:[{effective_to:null},{effective_to:{gt:now}}]});
export type Citation={id:string;title:string;section:string|null;page:number|null;url:string};
export type Evidence=Citation & {content:string;document_id:string;version_id:string;version:string};
function citation(row:Omit<Evidence,'url'>):Evidence{return {...row,url:`/api/knowledge/chunks/${encodeURIComponent(row.id)}`};}
export async function readChunk(actor:Actor,id:string):Promise<Evidence>{
  async function denied():Promise<never>{await audit(db(),actor,'knowledge-source','document-chunk',id,{result:'DENIED',reason:'SOURCE_NOT_ACCESSIBLE'});throw new AppError('NOT_FOUND',404);}
  const chunk=await db().documentChunk.findUnique({where:{id},select:{id:true,version_id:true,content:true,section:true,page:true}});
  if(!chunk)return denied();
  const version=await db().documentVersion.findFirst({where:{id:chunk.version_id,...currentVersion()}});
  if(!version)return denied();
  const doc=await db().knowledgeDocument.findFirst({where:{id:version.document_id,active_version_id:version.id,status:'ACTIVE',...knowledgeAcl(actor)}});
  if(!doc)return denied();
  return citation({...chunk,title:doc.title,document_id:doc.id,version:version.version});
}
export async function retrieve(actor:Actor,query:string,signal?:AbortSignal):Promise<Evidence[]>{
  const embedding=await embedQuery(query,signal),vector=JSON.stringify(embedding.vector),now=new Date();
  // One materialized ACL set is shared by both branches; neither branch can retrieve unauthorized chunks.
  const rows=await db().$queryRaw<Omit<Evidence,'url'>[]>(Prisma.sql`
    WITH eligible AS MATERIALIZED (
      SELECT c.id,c.version_id,c.content,c.section,c.page,c.embedding,d.id AS document_id,d.title,v.version
      FROM document_chunks c JOIN document_versions v ON v.id=c.version_id
      JOIN knowledge_documents d ON d.id=v.document_id
      WHERE d.status='ACTIVE' AND d.active_version_id=v.id AND v.status='READY'
      AND v.effective_from<=${now} AND (v.effective_to IS NULL OR v.effective_to>${now})
      AND (${actor.role==='SUPER_ADMIN'} OR ${actor.role}=ANY(d.allowed_roles))
      AND (${can(actor,'documents:sensitive')} OR d.classification='GENERAL')
      AND c.embedding_model=${embedding.model} AND c.embedding_dimension=${embedding.dimension}
      AND vector_dims(c.embedding)=${embedding.dimension}
    ), semantic AS (
      SELECT id,row_number() OVER (ORDER BY embedding <=> ${vector}::vector) AS rank FROM eligible
      WHERE embedding <=> ${vector}::vector < 0.65 ORDER BY embedding <=> ${vector}::vector LIMIT 12
    ), lexical AS (
      SELECT id,row_number() OVER (ORDER BY ts_rank(to_tsvector('simple',content),plainto_tsquery('simple',${query})) DESC) AS rank
      FROM eligible WHERE to_tsvector('simple',content) @@ plainto_tsquery('simple',${query}) LIMIT 12
    ), scores AS (
      SELECT id,sum(score) AS score FROM (SELECT id,1.0/(60+rank) AS score FROM semantic UNION ALL SELECT id,1.0/(60+rank) AS score FROM lexical) ranked GROUP BY id
    ) SELECT e.id,e.version_id,left(e.content,3000) AS content,e.section,e.page,e.document_id,e.title,e.version
      FROM scores s JOIN eligible e ON e.id=s.id ORDER BY s.score DESC,e.id LIMIT 6`);
  await audit(db(),actor,'ai-retrieval','knowledge',null,{after:{chunk_ids:rows.map(r=>r.id)}});
  return rows.map(citation);
}
async function documentDetail(actor:Actor,id:string,includeDeleted=false){
  const manage=can(actor,'knowledge:write');
  const doc=await db().knowledgeDocument.findFirst({where:{id,...(!includeDeleted?{status:{not:'DELETED'}}:{}),...(!manage?{status:'ACTIVE',...knowledgeAcl(actor)}:{})}});
  if(!doc)throw new AppError('NOT_FOUND',404);
  const versions=await db().documentVersion.findMany({where:{document_id:id,...(!manage?{id:doc.active_version_id??'__none__',...currentVersion()}: {})},orderBy:{created_at:'desc'},take:50});
  const jobs=manage?await db().ingestionJob.findMany({where:{version_id:{in:versions.map(v=>v.id)}},select:{version_id:true,status:true,attempts:true,error_code:true,updated_at:true}}):[];
  return {...doc,versions:versions.map(v=>({...v,job:jobs.find(j=>j.version_id===v.id)??null}))};
}
async function uploadVersion(actor:Actor,form:FormData,id?:string){
  requireCapability(actor,'knowledge:write');await rateLimit('knowledge-upload:'+actor.id,20,3600);
  const file=form.get('file');if(!(file instanceof File)||!/\.(txt|md|pdf|docx)$/i.test(file.name))throw new AppError('UNSUPPORTED_FILE_TYPE',422);
  const version=versionSchema.parse({version:form.get('version'),effective_from:form.get('effective_from'),...(form.get('effective_to')?{effective_to:form.get('effective_to')}: {})});
  let metadata:z.infer<typeof metadataSchema>|undefined;
  if(id){const doc=await documentDetail(actor,id);if(doc.versions.some(v=>v.version===version.version))throw new AppError('VERSION_EXISTS',409);}
  else{
    let roles:unknown;try{roles=JSON.parse(String(form.get('allowed_roles')));}catch{throw new AppError('VALIDATION_ERROR',422);}
    metadata=metadataSchema.parse({title:form.get('title'),classification:form.get('classification'),allowed_roles:roles});
  }
  const {storeFile}=await import('../files');
  const stored=await storeFile(actor,file,{title:metadata?.title??`Phiên bản ${version.version}`,classification:'CONFIDENTIAL'});
  try{return await db().$transaction(async tx=>{
    const doc=id?await tx.knowledgeDocument.findUniqueOrThrow({where:{id}}):await tx.knowledgeDocument.create({data:{...metadata!,owner_id:actor.id}});
    if(doc.status==='DELETED')throw new AppError('NOT_FOUND',404);
    if(doc.status==='INACTIVE')await tx.knowledgeDocument.update({where:{id:doc.id},data:{status:'DRAFT',active_version_id:null}});
    const v=await tx.documentVersion.create({data:{...version,document_id:doc.id,file_id:stored.id}});
    await tx.ingestionJob.create({data:{version_id:v.id}});
    await audit(tx,actor,'knowledge-upload','knowledge',doc.id,{after:{version_id:v.id,file_id:stored.id}});
    return {id:doc.id,version_id:v.id,status:'QUEUED'};
  });}catch(error){const {deleteFile}=await import('../files');await deleteFile(actor,stored.id).catch(()=>undefined);throw error;}
}
export async function knowledgeRoute(request:Request,actor:Actor,parts:string[]){
  if(!['GET','HEAD'].includes(request.method)){requireCapability(actor,'knowledge:write');await rateLimit('knowledge-mutation:'+actor.id,30,60);}
  const [id,action]=parts;
  if(id==='chunks'&&action&&request.method==='GET')return Response.json(await readChunk(actor,action));
  if(!id&&request.method==='POST')return Response.json(await uploadVersion(actor,await request.formData()),{status:201});
  if(!id&&request.method==='GET'){
    const url=new URL(request.url),page=z.coerce.number().int().min(1).max(1000).parse(url.searchParams.get('page')??1),page_size=z.coerce.number().int().min(1).max(100).parse(url.searchParams.get('page_size')??20),search=z.string().max(180).parse(url.searchParams.get('search')??'');
    const manage=can(actor,'knowledge:write');
    const where={status:{not:'DELETED'},...(search?{title:{contains:search,mode:'insensitive' as const}}:{}),...(!manage?{status:'ACTIVE',...knowledgeAcl(actor)}:{})};
    const docs=await db().knowledgeDocument.findMany({where,orderBy:{created_at:'desc'},skip:(page-1)*page_size,take:page_size});
    return Response.json({items:await Promise.all(docs.map(d=>documentDetail(actor,d.id))),total:await db().knowledgeDocument.count({where}),page,page_size});
  }
  if(id&&!action&&request.method==='GET')return Response.json(await documentDetail(actor,id));
  requireCapability(actor,'knowledge:write');
  if(id&&action==='preview'&&request.method==='GET'){
    const doc=await documentDetail(actor,id),version_id=new URL(request.url).searchParams.get('version_id');
    if(!version_id||!doc.versions.some(v=>v.id===version_id))throw new AppError('NOT_FOUND',404);
    const where={version_id},total=await db().documentChunk.count({where});
    return Response.json({version_id,chunks:await db().documentChunk.findMany({where,select:{id:true,ordinal:true,content:true,section:true,page:true},orderBy:{ordinal:'asc'},take:30}),total,truncated:total>30});
  }
  if(id&&!action&&request.method==='POST')return Response.json(await uploadVersion(actor,await request.formData(),id),{status:201});
  if(!id)throw new AppError('NOT_FOUND',404);
  const doc=await documentDetail(actor,id,request.method==='DELETE');
  if(!action&&request.method==='PATCH'){
    const data=metadataSchema.partial().parse(await request.json());
    await db().$transaction(async tx=>{await tx.knowledgeDocument.update({where:{id},data});await audit(tx,actor,'knowledge-metadata','knowledge',id,{after:data});});
    return Response.json(await documentDetail(actor,id));
  }
  if((!action&&request.method==='DELETE')||(action==='deactivate'&&request.method==='POST')){
    const files=await db().$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM knowledge_documents WHERE id=${id} FOR UPDATE`;
      const versions=await tx.documentVersion.findMany({where:{document_id:id},select:{id:true,file_id:true}}),versionIds=versions.map(v=>v.id);
      const sources=await tx.document.findMany({where:{id:{in:versions.map(v=>v.file_id)}},select:{id:true,storage_key:true}});
      await tx.ingestionJob.updateMany({where:{version_id:{in:versionIds}},data:{status:'INACTIVE',locked_at:null}});
      await tx.knowledgeDocument.update({where:{id},data:{status:request.method==='DELETE'?'DELETED':'INACTIVE',active_version_id:null}});
      if(request.method==='DELETE'){await tx.documentVersion.updateMany({where:{document_id:id},data:{status:'INACTIVE'}});await tx.documentChunk.deleteMany({where:{version_id:{in:versionIds}}});await tx.document.updateMany({where:{id:{in:sources.map(f=>f.id)}},data:{deleted_at:new Date()}});}
      await audit(tx,actor,request.method==='DELETE'?'knowledge-delete':'knowledge-deactivate','knowledge',id);
      return sources;
    });
    if(request.method==='DELETE'){
      const {removeStoredFile}=await import('../files'),removed=await Promise.allSettled(files.map(f=>removeStoredFile(f.storage_key)));
      if(removed.some(r=>r.status==='rejected')){
        await audit(db(),actor,'knowledge-storage-cleanup','knowledge',id,{result:'PENDING',reason:'STORAGE_UNAVAILABLE'});
        return Response.json({ok:false,deleted:true,storage_cleanup_pending:true,retry:'DELETE same knowledge ID'},{status:202});
      }
    }
    return Response.json({ok:true});
  }
  if(request.method==='POST'&&['publish','reindex'].includes(action)){
    const input=z.object({version_id:z.string().min(1).max(80)}).strict().parse(await request.json());
    const version=doc.versions.find(v=>v.id===input.version_id);if(!version)throw new AppError('NOT_FOUND',404);
    await db().$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM knowledge_documents WHERE id=${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM document_versions WHERE id=${version.id} FOR UPDATE`;
      const v=await tx.documentVersion.findUniqueOrThrow({where:{id:version.id}}),job=await tx.ingestionJob.findUnique({where:{version_id:v.id}});
      if(action==='publish'){
        const valid=await tx.$queryRaw<{total:bigint;valid:bigint;variants:bigint}[]>`SELECT count(*) AS total,count(*) FILTER (WHERE embedding IS NOT NULL AND vector_dims(embedding)=embedding_dimension AND embedding_model<>'') AS valid,count(DISTINCT (embedding_model,embedding_dimension)) AS variants FROM document_chunks WHERE version_id=${v.id}`;
        if(v.status!=='READY'||job?.status!=='READY'||Number(valid[0].total)===0||valid[0].valid!==valid[0].total||Number(valid[0].variants)!==1||v.effective_from>new Date()||(v.effective_to&&v.effective_to<=new Date()))throw new AppError('KNOWLEDGE_NOT_READY',409);
        await tx.knowledgeDocument.update({where:{id},data:{status:'ACTIVE',active_version_id:v.id}});
      }else{
        if(job?.status==='PROCESSING')throw new AppError('JOB_IN_PROGRESS',409);
        await tx.documentVersion.update({where:{id:v.id},data:{status:'UPLOADED'}});
        if(doc.active_version_id===v.id||doc.status==='INACTIVE')await tx.knowledgeDocument.update({where:{id},data:{status:'DRAFT',active_version_id:null}});
        await tx.ingestionJob.upsert({where:{version_id:v.id},create:{version_id:v.id},update:{status:'QUEUED',attempts:0,error_code:null,checkpoint:Prisma.JsonNull,locked_at:null,available_at:new Date()}});
      }
      await audit(tx,actor,'knowledge-'+action,'knowledge',id,{after:{version_id:v.id}});
    });return Response.json(await documentDetail(actor,id));
  }
  throw new AppError('NOT_FOUND',404);
}
