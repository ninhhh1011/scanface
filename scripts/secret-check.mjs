import {readFileSync,readdirSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {parse} from 'dotenv';
const secrets=Object.entries(parse(readFileSync('.env'))).filter(([key,value])=>/PASSWORD|SECRET|API_KEY|AUTH_KEY|ENCRYPTION_KEY|DATABASE_URL/.test(key)&&value.length>=16);
if(existsSync('.local/credentials.json'))for(const [key,value] of Object.entries(JSON.parse(readFileSync('.local/credentials.json','utf8'))))if(typeof value==='string'&&value.length>=16)secrets.push([key,value]);
const findings=[];let files=0;
for(const root of ['apps/web/src','apps/web/dist/client','services/ai/app','scripts','prisma','infra','docs','data']){
 if(!existsSync(root))continue;
 for(const entry of readdirSync(root,{recursive:true,withFileTypes:true})){
  if(!entry.isFile()||entry.name.endsWith('.pyc'))continue;
  const path=entry.parentPath+'/'+entry.name,content=readFileSync(path);files++;
  for(const [key,value] of secrets)if(content.includes(Buffer.from(value)))findings.push({file:path,secret_name:key});
 }
}
mkdirSync('artifacts/verification',{recursive:true});
const report={at:new Date().toISOString(),status:findings.length?'FAIL':'PASS',files,findings};
writeFileSync('artifacts/verification/secret-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));process.exitCode=findings.length?1:0;
