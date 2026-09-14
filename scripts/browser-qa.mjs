import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const credentials=JSON.parse(readFileSync('.local/credentials.json','utf8'));
const secretValues=[...Object.values(credentials),...Object.entries(process.env).filter(([key])=>/SECRET|PASSWORD|API_KEY|AUTH_KEY|ENCRYPTION_KEY|DATABASE_URL/.test(key)).map(([,value])=>value)].filter(value=>typeof value==='string'&&value.length>3);
const redact=value=>secretValues.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(value));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=[],errors=[];let phase='launch';
mkdirSync('artifacts/verification/screenshots',{recursive:true});
try{
 for(const role of ['admin','hr','manager','employee']){
  const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
  page.on('pageerror',error=>errors.push({role,type:error.name,message:redact(error.message).slice(0,200)}));
  phase=role+':login';await page.goto('http://127.0.0.1:3000/login');
  await page.getByLabel('Email công việc',{exact:true}).fill(role+'@abc.example');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(credentials[role+'@abc.example']);
  const loginResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/login'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Đăng nhập →',exact:true}).click();
  assert.equal((await loginResponse).status(),200,'Login HTTP status');
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).waitFor({timeout:45000});
  results.push({role,login:'PASS'});
  phase=role+':employees';await page.goto('http://127.0.0.1:3000/employees');await page.getByRole('heading',{name:'Nhân viên',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length>0,{timeout:30000});
  const codes=await page.locator('tbody').innerText();assert.ok(codes.includes(role==='employee'?'NV002':'NV001'));
  if(role==='employee')assert.ok(!codes.includes('NV003'));
  if(role==='manager')assert.ok(!codes.includes('NV006'));
  results.push({role,employee_scope:'PASS'});
  if(role==='hr'){
   for(const [width,height]of [[390,844],[768,1024],[1024,768],[1440,900]]){
    phase=`responsive:${width}`;await page.setViewportSize({width,height});
    await page.screenshot({path:`artifacts/verification/screenshots/employees-${width}.png`,fullPage:true});
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);assert.ok(fits,'viewport overflow');
    await page.getByRole('button',{name:'Nhân sự',exact:false}).click();await page.getByRole('navigation',{name:'Nhân sự',exact:true}).waitFor();
    assert.ok(await page.getByRole('navigation',{name:'Nhân sự',exact:true}).isVisible());
    await page.getByRole('button',{name:'Nhân sự',exact:false}).click();
    results.push({viewport:`${width}x${height}`,table_fit:'PASS',navigation:'PASS'});
   }
   for(const path of ['/dashboard','/employees/NV001','/contracts','/schedule','/attendance','/leave','/overtime','/timesheets','/payroll','/performance','/documents','/announcements','/assistant','/knowledge-base','/reports']){
    phase='route:'+path;await page.goto('http://127.0.0.1:3000'+path);await page.getByRole('button',{name:'Đăng xuất',exact:true}).waitFor();await page.waitForTimeout(400);
    assert.ok(!(await page.locator('body').innerText()).includes('INTERNAL_ERROR'));results.push({path,render:'PASS'});
   }
  }
  await context.close();
 }
 assert.equal(errors.length,0,'browser page errors');console.log(JSON.stringify({browser:'Chrome',checks:results.length,page_errors:errors.length,status:'PASS'}));
}catch(error){const detail=redact(error.message).slice(0,1200);results.push({phase,status:'FAILED',detail});process.exitCode=1;console.log(JSON.stringify({status:'FAILED',phase,detail,page_errors:errors}));}
finally{await browser.close();writeFileSync('artifacts/verification/browser-qa.json',JSON.stringify({at:new Date().toISOString(),results,errors},null,2));}
