import { api } from '../../../../../server/http';
import { verifyService } from '../../../../../server/service-auth';
import { db } from '../../../../../server/db';
import { fileResponse } from '../../../../../server/files';
import { AppError } from '../../../../../server/domain';
export const GET=api(async request=>{
 const id=new URL(request.url).pathname.split('/').at(-1)!;await verifyService(request,'INGEST',id);
 const document=await db().document.findFirst({where:{id,deleted_at:null}});
 if(!document||!await db().documentVersion.count({where:{file_id:id}}))throw new AppError('NOT_FOUND',404);
 return fileResponse(document);
},{internal:true});
