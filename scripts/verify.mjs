import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync,createWriteStream,readFileSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env')) loadEnvFile('.env');
mkdirSync('artifacts/verification',{recursive:true});
const results=[];
const npm = process.platform==='win32' ? ['cmd.exe',['/d','/s','/c','npm']] : ['npm',[]];
async function run(name,command,args,extra={}) {
  const output=createWriteStream('artifacts/verification/verify-'+name+'.log');
  const child=spawn(command,command===process.execPath?[...process.execArgv,...args]:args,{env:{...process.env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(output,{end:false}); child.stderr.pipe(output,{end:false});
  const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});
  await new Promise(resolve=>output.end(resolve));
  results.push({name,status:code===0?'PASS':code===2?'PENDING':'FAIL',exit_code:code});
  console.log(name+': '+results.at(-1).status);
}
for(const name of ['lint','typecheck']) await run(name,npm[0],[...npm[1],'run',name]);
await run('tests',npm[0],[...npm[1],'test','--','--reporter=dot'],{RUN_AI_DB_TESTS:'1',RUN_AI_HTTP_TESTS:process.argv.includes('--http')?'1':'0',RUN_SECURITY_HTTP_TESTS:process.argv.includes('--http')?'1':'0',RUN_AI_PROVIDER_TESTS:process.argv.includes('--providers')?'1':'0'});
await run('secrets',process.execPath,['scripts/secret-check.mjs']);
const python=process.platform==='win32'?'services/ai/.venv/Scripts/python.exe':'services/ai/.venv/bin/python';
if(existsSync(python)) await run('python',python,['services/ai/run-local.py','test','tests','-q']);
else results.push({name:'python',status:'FAIL',reason:'Project Python environment unavailable'});
if(process.argv.includes('--build')) await run('build',npm[0],[...npm[1],'run','build']);
else results.push({name:'build',status:'NOT_RUN',reason:'Use --build after stopping preview to avoid a locked output directory'});
if(process.argv.includes('--http')) {
  await run('runtime',process.execPath,['scripts/smoke.mjs']);
  await run('browser',process.execPath,['scripts/browser-qa.mjs']);
  await run('browser-flows',process.execPath,['scripts/browser-flows.mjs']);
} else results.push({name:'http_browser',status:'NOT_RUN',reason:'Start Workers preview and Python, then use --http'});
await run('doctor',process.execPath,['scripts/doctor.mjs']);
try { for(const check of JSON.parse(readFileSync('artifacts/verification/doctor.json','utf8')).checks) if(['BLOCKED','NOT_RUN'].includes(check.status)) results.push(check); } catch {}
results.push({name:'online_deployment',status:'BLOCKED',reason:'Requires cloud configuration, approved resources and an actual HTTPS acceptance run'});
const failed=results.some(result=>result.status==='FAIL');
const pending=results.some(result=>['PENDING','BLOCKED','NOT_RUN'].includes(result.status));
const report={at:new Date().toISOString(),status:failed?'FAIL':pending?'PENDING_ACCEPTANCE':'PASS',results};
writeFileSync('artifacts/verification/verify.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exitCode=failed?1:pending?2:0;
