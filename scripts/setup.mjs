import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
export function protectSecrets(){
  const paths=['.env','.local','apps/web/.dev.vars',...(existsSync('.local')?readdirSync('.local',{recursive:true}).map(path=>'.local/'+path):[])];
  for(const path of paths)if(existsSync(path)){
    if(process.platform==='win32'){
      const account=`${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
      const permission=statSync(path).isDirectory()?'(OI)(CI)F':'F';
      const result=spawnSync('icacls.exe',[path,'/inheritance:r','/grant:r',`${account}:${permission}`,`*S-1-5-18:${permission}`],{windowsHide:true,stdio:'ignore'});
      if(result.status!==0)throw new Error('LOCAL_SECRET_ACL_FAILED');
    }else chmodSync(path,path==='.local'?0o700:0o600);
  }
}
export function syncWebConfig(){
 const env=parse(readFileSync('.env'));
 const selected=Object.entries(env).filter(([key])=>['APP_URL','DATABASE_URL','AUTH_SECRET','SERVICE_AUTH_KEY','AI_SERVICE_URL'].includes(key)||key.startsWith('LLM_')||key.startsWith('EMBEDDING_'));
 writeFileSync('apps/web/.dev.vars',selected.map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600});
 protectSecrets();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const secret = () => randomBytes(32).toString('hex');
mkdirSync('.local',{recursive:true});
if (!existsSync('.env')) {
  const password = secret();
  const values = {APP_URL:'http://127.0.0.1:3000',POSTGRES_PASSWORD:password,DATABASE_URL:`postgresql://abc_hrm:${password}@127.0.0.1:54329/abc_hrm`,AUTH_SECRET:secret(),SERVICE_AUTH_KEY:secret(),FACE_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),AI_SERVICE_URL:'http://127.0.0.1:8000',SEED_REFERENCE_DATE:'2026-09-13',LLM_PROVIDER:'',LLM_BASE_URL:'',LLM_API_KEY:'',LLM_MODEL:'',EMBEDDING_PROVIDER:'',EMBEDDING_BASE_URL:'',EMBEDDING_API_KEY:'',EMBEDDING_MODEL:'',EMBEDDING_DIMENSION:''};
  writeFileSync('.env',Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
  console.log('Created local .env with random secrets (values not printed).');
}
syncWebConfig();
console.log('Local configuration synchronized. No database reset or seed was run.');
}
