import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { required } from './config';
const context=new AsyncLocalStorage<PrismaClient>();
export function createDb(){return new PrismaClient({adapter:new PrismaPg({connectionString:required('DATABASE_URL'),max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:5000})});}
export function db(){const client=context.getStore();if(!client)throw new Error('DB_CONTEXT_REQUIRED');return client;}
export async function withDb<T>(fn:()=>Promise<T>):Promise<T>{const client=createDb();try{return await context.run(client,fn);}finally{await client.$disconnect();}}
