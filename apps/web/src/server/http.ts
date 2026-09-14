import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { withDb,db } from './db';
import { AppError } from './domain';
import { checkOrigin,actorFromRequest } from './auth';
import { audit } from './audit';
export function api(handler:(request:Request)=>Promise<Response>,options:{internal?:boolean}={}){
  return async(request:Request)=>withDb(async()=>{
    let response:Response;
    try{
      if(!options.internal)checkOrigin(request);
      const size=Number(request.headers.get('content-length')??0);
      if(size>14*1024*1024)throw new AppError('PAYLOAD_TOO_LARGE',413);
      if(request.body){
        const reader=request.body.getReader();let length=0;const chunks:Uint8Array[]=[];
        for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>14*1024*1024){await reader.cancel();throw new AppError('PAYLOAD_TOO_LARGE',413);}chunks.push(value);}
        const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
        request=new Request(request.url,{method:request.method,headers:request.headers,body,signal:request.signal});
      }
      response=await handler(request);
    }catch(error){
      const databaseError=error instanceof Prisma.PrismaClientKnownRequestError?error:undefined;
      const cause=databaseError?.meta?.driverAdapterError as {cause?:{originalCode?:string}}|undefined;
      const conflict=databaseError&&(['P2002','P2003','P2004'].includes(databaseError.code)||['23P01','23505','23503','23514'].includes(cause?.cause?.originalCode??''));
      const code=error instanceof AppError?error.code:error instanceof ZodError?'VALIDATION_ERROR':error instanceof SyntaxError?'INVALID_JSON':conflict?'RECORD_CONFLICT':databaseError?.code==='P2025'?'NOT_FOUND':error instanceof Error&&error.message.startsWith('CONFIG_MISSING:')?'NEEDS_CONFIGURATION':'INTERNAL_ERROR';
      const status=error instanceof AppError?error.status:error instanceof ZodError?422:code==='INVALID_JSON'?400:conflict?409:code==='NOT_FOUND'?404:code==='NEEDS_CONFIGURATION'?503:500;
      if(status===403){try{const actor=await actorFromRequest(request).catch(()=>null);await audit(db(),actor,'access','api',new URL(request.url).pathname,{result:'DENIED',reason:code});}catch{/* Request stays denied if audit infrastructure fails. */}}
      if(status===500)console.error('api_error',error instanceof Error?error.name:'UnknownError');
      response=Response.json({error:{code,message:error instanceof AppError?error.message:code,...(error instanceof ZodError?{fields:error.flatten().fieldErrors}:{})}},{status});
    }
    response.headers.set('Cache-Control','private, no-store, max-age=0');response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('Referrer-Policy','same-origin');return response;
  });
}
