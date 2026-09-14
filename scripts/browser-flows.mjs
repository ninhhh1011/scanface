import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
const origin=process.env.APP_URL||'http://127.0.0.1:3000';
const credentials=JSON.parse(readFileSync('.local/credentials.json','utf8'));
const secretValues=[...Object.values(credentials),...Object.entries(process.env).filter(([key])=>/SECRET|PASSWORD|API_KEY|AUTH_KEY|ENCRYPTION_KEY|DATABASE_URL/.test(key)).map(([,value])=>value)].filter(value=>typeof value==='string'&&value.length>3);
const redact=value=>secretValues.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(value));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const marker='QA'+Date.now(),results=[],errors=[];
const owned={employees:[],departments:[],leave:[],balances:[],schedules:[],contracts:[],documents:[]};
const deletedFiles=new Set();let phase='start',hrContext;
mkdirSync('artifacts/verification',{recursive:true});
async function login(role){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push({type:e.name,message:redact(e.message).slice(0,160)}));
 await page.goto(origin+'/login');
 await page.getByLabel('Email công việc',{exact:true}).fill(role+'@abc.example');
 await page.getByLabel('Mật khẩu',{exact:true}).fill(credentials[role+'@abc.example']);
 await page.getByRole('button',{name:'Đăng nhập →',exact:true}).click();
 await page.getByRole('button',{name:'Đăng xuất',exact:true}).waitFor({timeout:45000});
 return {context,page};
}
async function choose(page,scope,label,option){
 await scope.getByRole('button',{name:label,exact:false}).click();
 await page.getByRole('option',{name:option,exact:true}).click();
}
async function responseTo(page,path,method,click){
 const result=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method);
 await click();const response=await result,data=await response.json();assert.ok(response.ok(),JSON.stringify({status:response.status(),data}));return data;
}
async function confirmAction(page,name,reason){
 await page.getByRole('dialog').last().getByRole('button',{name,exact:true}).click();
 const dialog=page.getByRole('dialog').last();
 if(reason)await dialog.getByLabel('Lý do',{exact:true}).fill(reason);
 return dialog;
}
try{
 const hr=await login('hr');hrContext=hr.context;const page=hr.page;
 phase='department-create';await page.goto(origin+'/departments');
 await page.getByRole('button',{name:'+ Tạo phòng ban',exact:true}).click();
 let dialog=page.getByRole('dialog').last();await dialog.getByLabel('Tên',{exact:true}).fill(marker);
 const department=await responseTo(page,'/api/hr/departments','POST',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());owned.departments.push(department.id);
 await page.getByRole('button',{name:'Xem '+marker,exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
 dialog=page.getByRole('dialog').last();await dialog.getByLabel('Tên',{exact:true}).fill(marker+' edited');
 await responseTo(page,'/api/hr/departments/'+department.id,'PATCH',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());
 assert.equal((await pool.query('SELECT name FROM departments WHERE id=$1',[department.id])).rows[0].name,marker+' edited');results.push({flow:'department_create_read_update',status:'PASS'});

 phase='employee-create';await page.goto(origin+'/employees');
 await page.getByRole('button',{name:'+ Tạo nhân viên',exact:true}).click();dialog=page.getByRole('dialog').last();
 await dialog.getByLabel('Mã nhân viên',{exact:true}).fill(marker);await dialog.getByLabel('Họ và tên',{exact:true}).fill(marker+' Employee');
 await dialog.getByLabel('Email công việc',{exact:true}).fill(marker.toLowerCase()+'@abc.example');
 await dialog.getByLabel('Ngày vào làm',{exact:true}).fill('2026-09-13');
 await choose(page,dialog,'Phòng ban',marker+' edited');await choose(page,dialog,'Chức danh','Chuyên viên');
 const employee=await responseTo(page,'/api/hr/employees','POST',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());owned.employees.push(employee.id);
 await page.goto(origin+'/employees/'+employee.id);await page.getByRole('heading',{name:marker+' Employee',exact:true}).waitFor();
 await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();dialog=page.getByRole('dialog').last();await dialog.getByLabel('Số điện thoại',{exact:true}).fill('0900000000');
 await responseTo(page,'/api/hr/employees/'+employee.id,'PATCH',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());

 phase='employee-shift-assignment';await page.goto(origin+'/employees/'+employee.id);await page.getByRole('tab',{name:'Ca làm',exact:true}).click();
 await page.getByRole('button',{name:'+ Tạo lịch làm việc',exact:true}).click();dialog=page.getByRole('dialog').last();
 await choose(page,dialog,'Ca làm','Hành chính');await dialog.getByLabel('Từ ngày',{exact:true}).fill('2026-10-01');await dialog.getByLabel('Đến ngày',{exact:true}).fill('2026-10-31');
 const schedule=await responseTo(page,'/api/hr/schedule','POST',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());owned.schedules.push(schedule.id);
 const assigned=(await pool.query('SELECT employee_id,shift_id FROM shift_assignments WHERE id=$1',[schedule.id])).rows[0];assert.equal(assigned.employee_id,employee.id);assert.equal(assigned.shift_id,'shift-office');
 results.push({flow:'new_employee_assign_real_shift_persistence',status:'PASS'});

 phase='employee-contract-create';await page.goto(origin+'/employees/'+employee.id);await page.getByRole('tab',{name:'Hợp đồng',exact:true}).click();
 await page.getByRole('button',{name:'+ Tạo hợp đồng',exact:true}).click();dialog=page.getByRole('dialog').last();
 await dialog.getByLabel('Tên hợp đồng',{exact:true}).fill(marker+' Contract');await dialog.getByLabel('Từ ngày',{exact:true}).fill('2026-09-13');await dialog.getByLabel('Đến ngày',{exact:true}).fill('2027-09-12');
 await dialog.getByLabel('Lương cơ bản (VND)',{exact:true}).fill('18000000');await choose(page,dialog,'Trạng thái','Đang hoạt động');
 const contract=await responseTo(page,'/api/hr/contracts','POST',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());owned.contracts.push(contract.id);
 const persistedContract=(await pool.query('SELECT employee_id,base_salary,status FROM contracts WHERE id=$1',[contract.id])).rows[0];assert.equal(persistedContract.employee_id,employee.id);assert.equal(String(persistedContract.base_salary),'18000000');assert.equal(persistedContract.status,'ACTIVE');
 results.push({flow:'new_employee_contract_create_persistence',status:'PASS'});

 phase='contract-private-attachment';await page.getByRole('button',{name:'Xem '+marker+' Contract',exact:true}).click();await page.getByRole('link',{name:'Mở tài liệu hợp đồng →',exact:true}).click();
 await page.getByRole('button',{name:'Tải tài liệu',exact:true}).click();dialog=page.getByRole('dialog').last();
 await dialog.getByLabel('Tên tài liệu',{exact:true}).fill(marker+' Attachment');await choose(page,dialog,'Nhân viên',marker+' · '+marker+' Employee');await choose(page,dialog,'Phân loại','Thông thường');await choose(page,dialog,'Hợp đồng liên quan',marker+' Contract');
 const attachmentBody='Private contract attachment '+marker;
 await dialog.getByLabel('Tệp tài liệu · tối đa 10 MB',{exact:true}).setInputFiles({name:marker+'.txt',mimeType:'text/plain',buffer:Buffer.from(attachmentBody)});
 const attachment=await responseTo(page,'/api/files','POST',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());owned.documents.push(attachment.id);
 const document=(await pool.query('SELECT employee_id,contract_id,deleted_at FROM documents WHERE id=$1',[attachment.id])).rows[0];assert.equal(document.employee_id,employee.id);assert.equal(document.contract_id,contract.id);assert.equal(document.deleted_at,null);
 await page.getByRole('button',{name:'Xem '+marker+' Attachment',exact:true}).click();dialog=page.getByRole('dialog').last();
 const attachmentDownload=page.waitForEvent('download');await dialog.getByRole('button',{name:'Tải tài liệu',exact:true}).click();const attachmentStream=await(await attachmentDownload).createReadStream();const attachmentChunks=[];for await(const chunk of attachmentStream)attachmentChunks.push(chunk);assert.equal(Buffer.concat(attachmentChunks).toString('utf8'),attachmentBody);
 assert.equal((await fetch(origin+'/api/files/'+attachment.id)).status,401);
 dialog=await confirmAction(page,'Xóa tài liệu');await responseTo(page,'/api/files/'+attachment.id,'DELETE',()=>dialog.getByRole('button',{name:'Xóa tài liệu',exact:true}).click());deletedFiles.add(attachment.id);
 assert.ok((await pool.query('SELECT deleted_at FROM documents WHERE id=$1',[attachment.id])).rows[0].deleted_at);assert.equal((await hrContext.request.get(origin+'/api/files/'+attachment.id)).status(),404);
 results.push({flow:'contract_private_attachment_upload_download_unauthorized_delete',status:'PASS'});

 phase='leave-balance-adjust';await page.goto(origin+'/leave-balances?employee_id='+employee.id);
 const balance=(await pool.query("SELECT id FROM leave_balances WHERE employee_id=$1 AND type_id='leave-annual' AND year=2026",[employee.id])).rows[0];
 owned.balances.push(balance.id);
 await page.getByRole('button',{name:'Xem bản ghi',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
 dialog=page.getByRole('dialog').last();await dialog.getByLabel('Định mức (ngày)',{exact:true}).fill('13');await dialog.getByLabel('Lý do',{exact:true}).fill(marker+' allocation');
 await responseTo(page,'/api/hr/leave-balances/'+balance.id,'PATCH',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());
 assert.equal((await pool.query('SELECT granted FROM leave_balances WHERE id=$1',[balance.id])).rows[0].granted,13);
 await page.goto(origin+'/leave-balances?employee_id='+employee.id);await page.getByRole('button',{name:'+ Tạo định mức nghỉ phép',exact:true}).click();dialog=page.getByRole('dialog').last();
 await choose(page,dialog,'Nhân viên',marker+' · '+marker+' Employee');await choose(page,dialog,'Loại nghỉ','Phép năm');
 await dialog.getByLabel('Năm',{exact:true}).fill('2027');await dialog.getByLabel('Định mức (ngày)',{exact:true}).fill('10');await dialog.getByLabel('Lý do',{exact:true}).fill(marker+' next year allocation');
 const nextBalance=await responseTo(page,'/api/hr/leave-balances','POST',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());
 owned.balances.push(nextBalance.id);
 assert.equal((await pool.query('SELECT granted FROM leave_balances WHERE id=$1',[nextBalance.id])).rows[0].granted,10);
 results.push({flow:'leave_balance_edit_create_reason_persistence',status:'PASS'});
 await page.goto(origin+'/employees/'+employee.id);
 await page.getByRole('button',{name:'Lưu trữ',exact:true}).click();dialog=page.getByRole('dialog').last();await dialog.getByLabel('Lý do',{exact:true}).fill(marker+' cleanup archive');
 await responseTo(page,'/api/hr/employees/'+employee.id+'/archive','POST',()=>dialog.getByRole('button',{name:'Lưu trữ nhân viên',exact:true}).click());
 const saved=(await pool.query('SELECT phone,status FROM employees WHERE id=$1',[employee.id])).rows[0];assert.equal(saved.phone,'0900000000');assert.equal(saved.status,'ARCHIVED');results.push({flow:'employee_create_update_archive_persistence',status:'PASS'});

 phase='csv-preview-export';await page.goto(origin+'/employees');await page.getByRole('button',{name:'Nhập CSV',exact:true}).click();dialog=page.getByRole('dialog').last();
 await dialog.getByLabel('Tệp CSV',{exact:true}).setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('code,full_name,email,department_id,position_id,hire_date\nNV001,Duplicate,invalid,dept-1,position-1,2026-09-13')});
 await dialog.getByRole('button',{name:'Kiểm tra dữ liệu',exact:true}).click();await dialog.getByText('Cần sửa',{exact:true}).waitFor();assert.ok(await dialog.getByRole('button',{name:'Xác nhận nhập',exact:true}).isDisabled());
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất CSV',exact:true}).click();const file=await download;assert.match(file.suggestedFilename(),/\.csv$/);
 const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.match(Buffer.concat(chunks).toString('utf8'),/NV001/);results.push({flow:'csv_invalid_preview_blocks_commit_real_export_escape',status:'PASS'});

 phase='timesheet-detail-export';await page.goto(origin+'/timesheets');await page.getByRole('button',{name:'Xem Kỳ công mẫu 30 ngày',exact:true}).click();dialog=page.getByRole('dialog').last();
 await dialog.getByRole('columnheader',{name:'Ngày đã ghi công',exact:true}).waitFor();assert.equal(await dialog.locator('tbody tr').count(),20);
 const timesheetDownload=page.waitForEvent('download');await dialog.getByRole('button',{name:'Xuất chi tiết công',exact:true}).click();assert.equal((await timesheetDownload).suggestedFilename(),'chi-tiet-cong.csv');
 results.push({flow:'timesheet_detail_20_employee_aggregates_csv',status:'PASS'});

 phase='leave-create';const self=await login('employee');const person=self.page;
 const date=(await pool.query("SELECT d::date::text AS candidate FROM generate_series(date '2026-10-01',date '2026-12-31',interval '1 day') d WHERE extract(isodow from d)<6 AND NOT EXISTS(SELECT 1 FROM leave_requests WHERE employee_id='NV002' AND status IN ('SUBMITTED','APPROVED') AND d::date BETWEEN starts_on AND ends_on) LIMIT 1")).rows[0].candidate;
 const before=(await pool.query("SELECT used FROM leave_balances WHERE employee_id='NV002' AND type_id='leave-annual' AND year=2026")).rows[0].used;
 await person.goto(origin+'/leave');await person.getByRole('button',{name:'+ Tạo đơn nghỉ phép',exact:true}).click();dialog=person.getByRole('dialog').last();
 await choose(person,dialog,'Loại nghỉ','Phép năm');await dialog.getByLabel('Từ ngày',{exact:true}).fill(date);await dialog.getByLabel('Đến ngày',{exact:true}).fill(date);await dialog.getByLabel('Lý do',{exact:true}).fill(marker);
 const leave=await responseTo(person,'/api/hr/leave','POST',()=>dialog.getByRole('button',{name:'Lưu',exact:true}).click());owned.leave.push(leave.id);
 await person.goto(origin+'/leave?from='+date+'&to='+date);await person.locator('tbody tr').filter({hasText:'Bản nháp'}).getByRole('button',{name:'Xem bản ghi',exact:true}).click();
 dialog=await confirmAction(person,'Gửi duyệt');await responseTo(person,'/api/hr/leave/'+leave.id+'/submit','POST',()=>dialog.getByRole('button',{name:'Gửi duyệt',exact:true}).click());
 results.push({flow:'employee_leave_create_submit',status:'PASS'});
 phase='manager-approve';const manager=await login('manager');await manager.page.goto(origin+'/leave?employee_id=NV002&from='+date+'&to='+date);
 await manager.page.locator('tbody tr').filter({hasText:'Đã gửi'}).getByRole('button',{name:'Xem bản ghi',exact:true}).click();dialog=await confirmAction(manager.page,'Duyệt');
 await responseTo(manager.page,'/api/hr/leave/'+leave.id+'/approve','POST',()=>dialog.getByRole('button',{name:'Duyệt',exact:true}).click());
 assert.equal((await pool.query("SELECT used FROM leave_balances WHERE employee_id='NV002' AND type_id='leave-annual' AND year=2026")).rows[0].used,before+1);results.push({flow:'manager_approve_real_ledger',status:'PASS'});
 phase='employee-cancel';await person.goto(origin+'/leave?from='+date+'&to='+date);await person.locator('tbody tr').filter({hasText:'Đã duyệt'}).getByRole('button',{name:'Xem bản ghi',exact:true}).click();dialog=await confirmAction(person,'Hủy đơn',marker+' cancelled');
 await responseTo(person,'/api/hr/leave/'+leave.id+'/cancel','POST',()=>dialog.getByRole('button',{name:'Hủy đơn',exact:true}).click());
 assert.equal((await pool.query("SELECT used FROM leave_balances WHERE employee_id='NV002' AND type_id='leave-annual' AND year=2026")).rows[0].used,before);assert.equal((await pool.query('SELECT count(*)::int n FROM leave_ledger WHERE request_id=$1',[leave.id])).rows[0].n,2);results.push({flow:'employee_cancel_restores_real_balance',status:'PASS'});

 phase='camera-denied';const cdp=await self.context.newCDPSession(person);await cdp.send('Browser.setPermission',{permission:{name:'camera'},setting:'denied',origin});
 await person.goto(origin+'/attendance/scan');await person.getByRole('button',{name:'Bật camera',exact:true}).waitFor();assert.ok(await person.getByRole('button',{name:'Bật camera',exact:true}).isDisabled());
 await person.getByRole('checkbox').focus();await person.keyboard.press('Space');assert.ok(await person.getByRole('checkbox').isChecked());await person.getByRole('button',{name:'Bật camera',exact:true}).click();await person.getByRole('alert').getByText('Quyền camera đã bị từ chối. Cho phép camera trong cài đặt trang rồi thử lại.',{exact:true}).waitFor();
 assert.equal((await pool.query('SELECT count(*)::int n FROM face_templates')).rows[0].n,0);
 await person.goto(origin+'/employees/NV002');await person.getByRole('tab',{name:'Khuôn mặt',exact:true}).click();
 const unenrolled=person.getByText('Chưa đăng ký',{exact:true});await unenrolled.waitFor();assert.ok(!(await unenrolled.getAttribute('class')).includes('positive'));
 results.push({flow:'consent_gate_browser_camera_permission_denied_no_biometrics_unenrolled_status',status:'PASS'});
 assert.equal(errors.length,0);console.log(JSON.stringify({status:'PASS',checks:results.length,page_errors:errors.length}));
}catch(error){process.exitCode=1;const message=redact(error.message).slice(0,1200);results.push({phase,status:'FAILED',message});console.log(JSON.stringify({status:'FAILED',phase,message}));}
finally{
 try{
 // Delete private objects through the authorized API before removing metadata or parent records.
 for(const id of owned.documents){if(!deletedFiles.has(id)){const response=await hrContext.request.delete(origin+'/api/files/'+id,{headers:{Origin:origin}});assert.ok(response.ok(),'Owned private file cleanup failed: '+response.status());}await pool.query('DELETE FROM documents WHERE id=$1 AND deleted_at IS NOT NULL',[id]);}
 for(const id of owned.contracts)await pool.query('DELETE FROM contracts WHERE id=$1',[id]);
 for(const id of owned.schedules)await pool.query('DELETE FROM shift_assignments WHERE id=$1',[id]);
 // Only remove ids returned from this run's writes. Restore the run's ledger delta if interrupted after approval.
 for(const id of owned.leave){await pool.query('DELETE FROM notifications WHERE href=$1',['/leave?record_id='+id]);await pool.query("UPDATE leave_balances SET used=used-(SELECT coalesce(sum(delta),0)::int FROM leave_ledger WHERE request_id=$1) WHERE employee_id='NV002' AND type_id='leave-annual' AND year=2026",[id]);await pool.query('DELETE FROM leave_ledger WHERE request_id=$1',[id]);await pool.query('DELETE FROM leave_requests WHERE id=$1',[id]);}
 for(const id of owned.employees){await pool.query('DELETE FROM leave_balances WHERE employee_id=$1',[id]);await pool.query('DELETE FROM employees WHERE id=$1',[id]);}
 for(const id of owned.departments)await pool.query('DELETE FROM departments WHERE id=$1',[id]);
 for(const id of Object.values(owned).flat())await pool.query('DELETE FROM audit_events WHERE resource_id=$1',[id]);
 const employees=(await pool.query('SELECT count(*)::int n FROM employees')).rows[0].n;assert.equal(employees,20);results.push({cleanup:'PASS',employees});
 }catch(error){process.exitCode=1;const message=redact(error.message).slice(0,1200);results.push({cleanup:'FAILED',message,owned});console.log(JSON.stringify({cleanup:'FAILED',message}));}
 finally{await browser.close();await pool.end();writeFileSync('artifacts/verification/browser-flows.json',JSON.stringify({at:new Date().toISOString(),results,errors},null,2));}
}
