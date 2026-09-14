import { config } from 'dotenv';
import { describe,it,expect,vi } from 'vitest';
import { withDb,db } from '../src/server/db';
import { knowledgeRoute } from '../src/server/ai/knowledge';
config({path:'.env',quiet:true});
const storage=vi.hoisted(()=>({removeStoredFile:vi.fn()}));
vi.mock('../src/server/files',()=>storage);
const actor={id:'user-hr',email:'hr@abc.example',role:'HR_ADMIN',employee_id:'NV006',capabilities:['knowledge:write','documents:sensitive']};
describe.skipIf(process.env.RUN_AI_DB_TESTS!=='1')('real DB knowledge lifecycle, explicitly fake storage fixture, no vectors',()=>{
  it('refuses premature publish; reindex/deactivate/delete persist, cleanup is retryable',()=>withDb(async()=>{
    const id=crypto.randomUUID(),file_id=crypto.randomUUID(),version_id=crypto.randomUUID(),origin='http://127.0.0.1:3000';
    function req(action:string,method='POST',body?:object){return new Request(`${origin}/api/knowledge/${id}${action?'/'+action:''}`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
    try{
      await db().$transaction(async tx=>{
        await tx.document.create({data:{id:file_id,owner_id:actor.id,title:'Test-only storage fixture',filename:'test.txt',mime_type:'text/plain',size:1,storage_key:`test-only/${file_id}`,classification:'CONFIDENTIAL'}});
        await tx.knowledgeDocument.create({data:{id,title:'Test-only KB lifecycle',owner_id:actor.id,classification:'CONFIDENTIAL',allowed_roles:['HR_ADMIN']}});
        await tx.documentVersion.create({data:{id:version_id,document_id:id,version:'test',effective_from:new Date('2026-01-01'),file_id}});
      });
      await expect(knowledgeRoute(req('publish','POST',{version_id}),actor,[id,'publish'])).rejects.toMatchObject({code:'KNOWLEDGE_NOT_READY'});
      await knowledgeRoute(req('deactivate'),actor,[id,'deactivate']);
      await knowledgeRoute(req('reindex','POST',{version_id}),actor,[id,'reindex']);
      expect((await db().knowledgeDocument.findUniqueOrThrow({where:{id}})).status).toBe('DRAFT');
      await knowledgeRoute(req('deactivate'),actor,[id,'deactivate']);
      expect((await db().ingestionJob.findUniqueOrThrow({where:{version_id}})).status).toBe('INACTIVE');
      storage.removeStoredFile.mockRejectedValueOnce(new Error('Test storage unavailable'));
      const pending=await knowledgeRoute(req('','DELETE'),actor,[id]);expect(pending.status).toBe(202);expect((await pending.json()).storage_cleanup_pending).toBe(true);
      expect((await db().document.findUniqueOrThrow({where:{id:file_id}})).deleted_at).not.toBeNull();
      storage.removeStoredFile.mockResolvedValue(undefined);
      const retry=await knowledgeRoute(req('','DELETE'),actor,[id]);expect(retry.status).toBe(200);expect(storage.removeStoredFile).toHaveBeenCalledWith(`test-only/${file_id}`);
    }finally{
      await db().ingestionJob.deleteMany({where:{version_id}});await db().documentChunk.deleteMany({where:{version_id}});await db().documentVersion.deleteMany({where:{id:version_id}});await db().knowledgeDocument.deleteMany({where:{id}});await db().document.deleteMany({where:{id:file_id}});
    }
  }),30000);
});
