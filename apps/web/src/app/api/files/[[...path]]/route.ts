import { api } from '../../../../server/http';
import { actorFromRequest,rateLimit } from '../../../../server/auth';
import { storeFile,readFile,deleteFile } from '../../../../server/files';
import { AppError } from '../../../../server/domain';
const handler=api(async request=>{
 const actor=await actorFromRequest(request);const id=new URL(request.url).pathname.split('/')[3];
 if(request.method==='GET'&&id)return readFile(actor,id);
 if(request.method==='DELETE'&&id){await deleteFile(actor,id);return Response.json({ok:true});}
 if(request.method==='POST'&&!id){await rateLimit('upload:'+actor.id,20,3600);const form=await request.formData();const file=form.get('file');if(!(file instanceof File))throw new AppError('FILE_REQUIRED');
 const data=await storeFile(actor,file,{title:String(form.get('title')??file.name),employee_id:String(form.get('employee_id')??'')||undefined,classification:String(form.get('classification')??'GENERAL'),contract_id:String(form.get('contract_id')??'')||undefined});
 return Response.json({id:data.id,title:data.title},{status:201});}
 throw new AppError('NOT_FOUND',404);
});
export {handler as GET,handler as POST,handler as DELETE};
