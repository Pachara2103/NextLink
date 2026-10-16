import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {chromium}=require('playwright');
// Explicitly isolated, synthetic-data regression. No production target defaults.
// Start backend/tests/friday_live_app.py with a migrated loopback test database,
// then Next with API_ORIGIN pointing at that harness. Run from any directory:
// FRIDAY_LIVE_BASE_URL=http://127.0.0.1:PORT TEST_DATABASE_URL=postgresql://.../nextlink_security_test_NAME
// FRIDAY_TEST_PYTHON=/path/to/venv/bin/python FRIDAY_QA_RESET=1 node scripts/friday/check-live.mjs
// FRIDAY_QA_RESET=1 deletes only this guarded disposable database's Friday rows.
// Existing user/company/contact rows must be exactly this script's QA fixtures.
const baseUrl=new URL(process.env.FRIDAY_LIVE_BASE_URL||'http://missing-explicit-loopback-target.invalid');
const databaseUrl=new URL(process.env.TEST_DATABASE_URL||'postgresql://missing-explicit-test-database.invalid/none');
const local=host=>['localhost','127.0.0.1','[::1]'].includes(host);
assert.ok(local(baseUrl.hostname)&&baseUrl.protocol==='http:','FRIDAY_LIVE_BASE_URL must explicitly select loopback HTTP');
assert.ok(local(databaseUrl.hostname)&&databaseUrl.pathname.startsWith('/nextlink_security_test'),'TEST_DATABASE_URL must explicitly select disposable loopback nextlink_security_test database');
assert.ok(['postgres:','postgresql:'].includes(databaseUrl.protocol));
const base=baseUrl.origin;
const python=process.env.FRIDAY_TEST_PYTHON||'python3';
const output=process.env.FRIDAY_QA_OUTPUT||await mkdtemp(join(tmpdir(),'nextlink-friday-live-qa-'));
await mkdir(output,{recursive:true});
const health=await(await fetch(base+'/api/v1/health')).json();
assert.equal(health.testHarness,true,'Refuse any application other than the isolated Friday test harness');
assert.equal(health.testDatabase,decodeURIComponent(databaseUrl.pathname.slice(1)),'Browser API and SQL must address the same test database');
assert.equal(health.testDatabasePort,Number(databaseUrl.port||5432));
const setup=String.raw`
import bcrypt,csv,os,psycopg2
from pathlib import Path
from openpyxl import Workbook
from urllib.parse import urlparse
url=os.environ['TEST_DATABASE_URL']
parsed=urlparse(url)
assert parsed.hostname in {'localhost','127.0.0.1','::1'} and parsed.path.startswith('/nextlink_security_test')
with psycopg2.connect(url) as c:
 with c.cursor() as r:
  r.execute('SELECT id,username,display_name,role,is_active FROM users ORDER BY id'); users=r.fetchall()
  r.execute('SELECT id,company_th,company_en FROM companies ORDER BY id'); companies=r.fetchall()
  r.execute('SELECT id,company_id,name FROM contacts ORDER BY id'); contacts=r.fetchall()
  assert users in ([],[(1,'alice','Alice Friday QA','staff',True),(2,'bob','Bob Friday QA','staff',True)]),'Refuse non-QA users'
  assert companies in ([],[(1,'บริษัท ทดสอบฟรายเดย์ อัลฟา','Friday QA Alpha'),(2,'บริษัท ทดสอบฟรายเดย์ เบตา','Friday QA Beta')]),'Refuse non-QA companies'
  assert contacts in ([],[(1,1,'ผู้ประสานงาน อัลฟา QA'),(2,2,'ผู้ประสานงาน เบตา QA')]),'Refuse non-QA contacts'
  r.execute('SELECT count(*) FROM employees'); assert r.fetchone()[0]==0,'Refuse nonempty employee directory'
  if not users:
   password=bcrypt.hashpw(b'friday-ui-fixture-password',bcrypt.gensalt(rounds=4)).decode()
   r.execute("INSERT INTO users(id,username,password,display_name,role,is_active) VALUES (1,'alice',%s,'Alice Friday QA','staff',true),(2,'bob',%s,'Bob Friday QA','staff',true)",(password,password))
   r.execute("SELECT setval(pg_get_serial_sequence('users','id'),2)")
  if not companies:
   r.execute("INSERT INTO companies(id,company_th,company_en) VALUES (1,'บริษัท ทดสอบฟรายเดย์ อัลฟา','Friday QA Alpha'),(2,'บริษัท ทดสอบฟรายเดย์ เบตา','Friday QA Beta')")
   r.execute("SELECT setval(pg_get_serial_sequence('companies','id'),2)")
  if not contacts:
   r.execute("INSERT INTO contacts(id,company_id,name,role,status) VALUES (1,1,'ผู้ประสานงาน อัลฟา QA','instructor','active'),(2,2,'ผู้ประสานงาน เบตา QA','alumni','active')")
   r.execute("SELECT setval(pg_get_serial_sequence('contacts','id'),2)")
  if os.environ.get('FRIDAY_QA_RESET')=='1':
   r.execute('TRUNCATE friday_activities,academic_periods,friday_import_batches,auth_login_buckets RESTART IDENTITY CASCADE')
  r.execute('SELECT count(*) FROM friday_activities'); assert r.fetchone()[0]==0,'Use an empty test database or explicitly set FRIDAY_QA_RESET=1'
headers='sourceKey,academicYear,term,title,companyId,companyName,sessionDate,startTime,endTime,location,format,capacity,booked,attended,status'.split(',')
output=Path(os.environ['FRIDAY_QA_OUTPUT'])
with (output/'friday-activity.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f);w.writerow(headers);w.writerow(['friday-qa-csv-1','2026','FIRST','QA CSV reviewed Friday','','Unknown synthetic company','2026-11-06','13:00','15:00','QA CSV Room','workshop','30','0','',''])
wb=Workbook();ws=wb.active;ws.title='Friday QA';ws.append(headers);ws.append(['friday-qa-xlsx-1',2569,'1','QA XLSX reviewed Friday','2','','2026-11-13','10:00','12:00','QA XLSX Room','talk',20,0,0,'']);wb.save(output/'friday-activity.xlsx')
`;
execFileSync(python,['-c',setup],{env:{...process.env,TEST_DATABASE_URL:databaseUrl.href,FRIDAY_QA_OUTPUT:output},stdio:'pipe'});
const browser=await chromium.launch({headless:true});
const errors=[],consoleMessages=[],networkFailures=[],results=[],apiResults=[];
let phase='normal';
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
const collect=page=>{page.on('pageerror',e=>errors.push({phase,message:e.message}));page.on('console',m=>{if(['error','warning'].includes(m.type()))consoleMessages.push({phase,type:m.type(),text:m.text()});});page.on('response',r=>{if(r.status()>=400)networkFailures.push({phase,status:r.status(),path:new URL(r.url()).pathname});});page.on('dialog',d=>d.accept());};
const a=await browser.newContext({viewport:{width:1440,height:1000}});const b=await browser.newContext({viewport:{width:1440,height:1000}});
const pa=await a.newPage(),pb=await b.newPage();collect(pa);collect(pb);pa.setDefaultTimeout(16000);pb.setDefaultTimeout(16000);
const ready=async p=>p.locator('.friday-live-dashboard[data-ready="true"]').waitFor();
const go=async(p,suffix='?year=2569&term=1')=>{await p.goto(base+'/dashboard/friday-activities'+suffix);await ready(p);};
const login=async(p,user)=>{await p.goto(base+'/dashboard/friday-activities?year=2569&term=1');await p.waitForURL('**/login?next=*');await p.locator('input[name=username]').fill(user);await p.locator('input[name=password]').fill('friday-ui-fixture-password');await p.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await ready(p);};
const mutation=async(p,method,path,action)=>{const promise=p.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method);const [,r]=await Promise.all([action(),promise]);const body=await r.json();apiResults.push({method,path,status:r.status(),id:body.id,revision:body.revision});return {response:r,body};};
const open=async(p,title)=>{await p.getByRole('button',{name:'ดูรายละเอียด '+title,exact:true}).filter({visible:true}).first().click();const d=p.getByRole('dialog');await d.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).waitFor();return d;};
const close=async p=>p.getByRole('dialog').getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();
const dbSql=sql=>execFileSync(python,['-c',`import psycopg2,json,os\nc=psycopg2.connect(os.environ['TEST_DATABASE_URL'])\nwith c:\n with c.cursor() as r:\n  r.execute(${JSON.stringify(sql)})\n  print(json.dumps(r.fetchall() if r.description else [],default=str))\nc.close()`],{encoding:'utf8',env:{...process.env,TEST_DATABASE_URL:databaseUrl.href}}).trim();
let record,title='QA Friday shared activity';
try {
 await check('real Alice login and empty PostgreSQL page',async()=>{await login(pa,'alice');assert.match(await pa.title(),/Friday Activity/);assert.match(await pa.locator('body').innerText(),/ยังไม่มีกิจกรรมในช่วงการศึกษานี้/);assert.equal(await pa.locator('.friday-live-dashboard').getAttribute('data-source'),'postgresql');assert.doesNotMatch(await pa.locator('.dashboard-demo-notice').innerText(),/ข้อมูลทดลอง|ข้อมูลตัวอย่าง/);await pa.screenshot({path:output+'/empty-desktop.png',fullPage:true});});
 await check('create canonical company/contact session with null and zero counts',async()=>{
  await pa.getByRole('button',{name:'สร้างกิจกรรม',exact:true}).click();const d=pa.getByRole('dialog');
  await d.getByLabel('ชื่อกิจกรรม *',{exact:true}).fill(title);await d.getByRole('combobox',{name:'เจ้าหน้าที่ผู้รับผิดชอบ *',exact:true}).selectOption('1');
  await d.getByRole('checkbox',{name:'บริษัท ทดสอบฟรายเดย์ อัลฟา',exact:true}).check();
  await d.getByRole('checkbox',{name:/ผู้ประสานงาน อัลฟา QA/}).check();
  await d.getByLabel('วันที่จัด (ค.ศ.)',{exact:true}).fill('2026-10-23');await d.getByLabel('เวลาเริ่ม',{exact:true}).fill('13:00');await d.getByLabel('เวลาสิ้นสุด',{exact:true}).fill('15:00');await d.getByLabel('สถานที่',{exact:true}).fill('QA Shared Hall');await d.getByLabel('จำนวนจอง',{exact:true}).fill('0');
  const r=await mutation(pa,'POST','/api/v1/friday-activities',()=>d.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click());assert.equal(r.response.status(),201);record=r.body;assert.equal(record.companyIds[0],'1');assert.equal(record.people[0].namespace,'contact');assert.equal(record.sessions[0].capacity,null);assert.equal(record.sessions[0].booked,0);assert.equal(record.sessions[0].attended,null);await d.getByText('บันทึกกิจกรรมลงฐานข้อมูลกลางแล้ว',{exact:true}).waitFor();await close(pa);await ready(pa);
 });
 await check('reload and Bob independent session read same stable activity ID',async()=>{await go(pa);await login(pb,'bob');for(const p of [pa,pb]){const rr=p.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/friday-activities/${record.id}`&&r.request().method()==='GET');await open(p,title);assert.equal((await (await rr).json()).id,record.id);} });
 await check('stale Bob save returns409 and retains typed draft',async()=>{
  const da=pa.getByRole('dialog'),db=pb.getByRole('dialog');await da.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).click();await db.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).click();await db.getByLabel('ชื่อกิจกรรม *',{exact:true}).fill('Bob unsaved conflict draft');
  title='QA Friday Alice saved revision';await da.getByLabel('ชื่อกิจกรรม *',{exact:true}).fill(title);const saved=await mutation(pa,'PUT',`/api/v1/friday-activities/${record.id}`,()=>da.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click());assert.equal(saved.response.status(),200);record=saved.body;
  const stale=await mutation(pb,'PUT',`/api/v1/friday-activities/${record.id}`,()=>db.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click());assert.equal(stale.response.status(),409);assert.equal(await db.getByLabel('ชื่อกิจกรรม *',{exact:true}).inputValue(),'Bob unsaved conflict draft');await db.getByText('ฉบับล่าสุดที่ผู้อื่นบันทึก',{exact:true}).waitFor();await pb.screenshot({path:output+'/conflict-draft.png',fullPage:false});
  await db.getByRole('button',{name:'โหลดฉบับล่าสุดแทนแบบฟอร์มของฉัน',exact:true}).click();await db.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).click();await db.getByLabel('รายละเอียดกิจกรรม',{exact:true}).fill('Bob successful shared update');const accepted=await mutation(pb,'PUT',`/api/v1/friday-activities/${record.id}`,()=>db.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click());assert.equal(accepted.response.status(),200);record=accepted.body;await db.getByText(/Bob Friday QA/).first().waitFor();await close(pb);await close(pa);await go(pa);await open(pa,title);
 });
 await check('status workflow and held session complete with audited reasons',async()=>{
  const d=pa.getByRole('dialog');
  for(const status of ['contacting','invited','confirmed','in_progress']){await d.getByRole('combobox',{name:'สถานะถัดไป',exact:true}).selectOption(status);await d.getByLabel('เหตุผล / บันทึกการติดตาม',{exact:true}).fill('QA '+status);const r=await mutation(pa,'POST',`/api/v1/friday-activities/${record.id}/transitions`,()=>d.getByRole('button',{name:'บันทึกสถานะ',exact:true}).click());assert.equal(r.response.status(),200);record=r.body;}
  await d.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).click();await d.getByRole('combobox',{name:'สถานะรอบ',exact:true}).selectOption('held');await d.getByLabel('จำนวนมาจริง',{exact:true}).fill('0');await d.getByLabel(/^เหตุผลการแก้ไข/).fill('QA recorded actual held session');const held=await mutation(pa,'PUT',`/api/v1/friday-activities/${record.id}`,()=>d.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click());assert.equal(held.response.status(),200);record=held.body;
  await d.getByRole('combobox',{name:'สถานะถัดไป',exact:true}).selectOption('completed');await d.getByLabel('เหตุผล / บันทึกการติดตาม',{exact:true}).fill('QA complete verified zero attendance');const r=await mutation(pa,'POST',`/api/v1/friday-activities/${record.id}/transitions`,()=>d.getByRole('button',{name:'บันทึกสถานะ',exact:true}).click());assert.equal(r.response.status(),200);record=r.body;assert.equal(record.status,'completed');await d.getByText('บันทึกการเปลี่ยนสถานะแล้ว',{exact:true}).waitFor();await pa.screenshot({path:output+'/completed-history.png',fullPage:false});await close(pa);await ready(pa);
 });
 await check('CSV preview reviewed company mapping commit and exact retry no duplicate',async()=>{
  await pa.getByRole('button',{name:'นำเข้า Excel / CSV',exact:true}).click();const panel=pa.getByRole('region',{name:'นำเข้า Friday Activity',exact:true});await panel.getByLabel('ไฟล์กิจกรรม (.csv / .xlsx)',{exact:true}).setInputFiles(output+'/friday-activity.csv');const pr=await mutation(pa,'POST','/api/v1/friday-activities/imports/preview',()=>panel.getByRole('button',{name:'สร้างตัวอย่างเพื่อตรวจ',exact:true}).click());assert.equal(pr.response.status(),201);let batch=pr.body;assert.equal(batch.rows[0].mappingStatus,'needs_mapping');assert.equal(JSON.parse(dbSql('SELECT count(*) FROM friday_activities'))[0][0],1);
  await panel.locator('details').first().locator('summary').first().click();await panel.getByRole('combobox',{name:'สถานะกิจกรรม',exact:true}).selectOption('draft');await panel.getByRole('checkbox',{name:'บริษัท ทดสอบฟรายเดย์ อัลฟา',exact:true}).check();await panel.getByRole('combobox',{name:'ผลตรวจแถวนี้',exact:true}).selectOption('create');const reviewed=await mutation(pa,'PATCH',`/api/v1/friday-activities/imports/${batch.id}/rows/${batch.rows[0].id}`,()=>panel.getByRole('button',{name:'บันทึกผลตรวจแถวนี้',exact:true}).click());assert.equal(reviewed.response.status(),200);batch=reviewed.body;await pa.screenshot({path:output+'/csv-reviewed-preview.png',fullPage:true});
  const c=await mutation(pa,'POST',`/api/v1/friday-activities/imports/${batch.id}/commit`,()=>panel.getByRole('button',{name:'ยืนยันนำเข้า 1 แถวที่ตรวจผ่าน',exact:true}).click());assert.equal(c.response.status(),200);assert.equal(c.body.receipt.inserted,1);const request=c.response.request();const retry=await a.request.post(base+new URL(request.url()).pathname,{headers:request.headers(),data:request.postDataJSON()});assert.equal(retry.status(),200);const replay=await retry.json();assert.equal(replay.idempotentReplay,true);assert.equal(replay.receipt.id,c.body.receipt.id);assert.equal(JSON.parse(dbSql('SELECT count(*) FROM friday_activities'))[0][0],2);await panel.getByText(/ใบรับผลล่าสุดที่เซิร์ฟเวอร์ยืนยัน|เซิร์ฟเวอร์ยืนยันผลการนำเข้าแล้ว/).waitFor();await panel.getByRole('button',{name:'ปิดการนำเข้า',exact:true}).click();await ready(pa);
 });
 await check('XLSX BE year converts once and reviewed import preserves zero counts',async()=>{
  await pa.getByRole('button',{name:'นำเข้า Excel / CSV',exact:true}).click();const panel=pa.getByRole('region',{name:'นำเข้า Friday Activity',exact:true});await panel.getByLabel('ไฟล์กิจกรรม (.csv / .xlsx)',{exact:true}).setInputFiles(output+'/friday-activity.xlsx');await panel.getByRole('combobox',{name:'ระบบปีของคอลัมน์ academicYear ในไฟล์',exact:true}).selectOption('BE');const pr=await mutation(pa,'POST','/api/v1/friday-activities/imports/preview',()=>panel.getByRole('button',{name:'สร้างตัวอย่างเพื่อตรวจ',exact:true}).click());assert.equal(pr.response.status(),201);let batch=pr.body;assert.equal(batch.rows[0].normalized.academicYear,2026);assert.equal(batch.rows[0].normalized.attended,0);
  await panel.locator('details').first().locator('summary').first().click();await panel.getByRole('combobox',{name:'สถานะกิจกรรม',exact:true}).selectOption('draft');await panel.getByRole('combobox',{name:'ผลตรวจแถวนี้',exact:true}).selectOption('create');const reviewed=await mutation(pa,'PATCH',`/api/v1/friday-activities/imports/${batch.id}/rows/${batch.rows[0].id}`,()=>panel.getByRole('button',{name:'บันทึกผลตรวจแถวนี้',exact:true}).click());assert.equal(reviewed.response.status(),200);batch=reviewed.body;const c=await mutation(pa,'POST',`/api/v1/friday-activities/imports/${batch.id}/commit`,()=>panel.getByRole('button',{name:'ยืนยันนำเข้า 1 แถวที่ตรวจผ่าน',exact:true}).click());assert.equal(c.response.status(),200);assert.equal(c.body.receipt.inserted,1);await panel.getByText(/ใบรับผลล่าสุดที่เซิร์ฟเวอร์ยืนยัน|เซิร์ฟเวอร์ยืนยันผลการนำเข้าแล้ว/).waitFor();await panel.getByRole('button',{name:'ปิดการนำเข้า',exact:true}).click();await ready(pa);
 });
 await check('empty term is truthful and real API failure is distinct from empty data',async()=>{
  await go(pa,'?year=2569&term=summer');assert.match(await pa.locator('body').innerText(),/ยังไม่มีกิจกรรมในช่วงการศึกษานี้/);assert.equal(await pa.locator('.kpi-card').first().locator('.kpi-value').innerText(),'0');await pa.screenshot({path:output+'/empty-period.png',fullPage:true});
  phase='expected-api-failure';dbSql('ALTER TABLE friday_activities RENAME TO friday_activities_qa_unavailable');
  try {await pa.getByRole('button',{name:'โหลดข้อมูลใหม่',exact:true}).click();await pa.getByRole('alert').filter({hasText:'อ่านรายการกิจกรรมไม่สำเร็จ'}).waitFor();assert.match(await pa.locator('body').innerText(),/อ่านข้อมูลไม่สำเร็จ/);await pa.screenshot({path:output+'/real-api-error.png',fullPage:true});} finally {dbSql('ALTER TABLE friday_activities_qa_unavailable RENAME TO friday_activities');}
  phase='normal';await pa.getByRole('button',{name:'ลองอ่านรายการอีกครั้ง',exact:true}).click();await ready(pa);await go(pa);
 });
 await check('desktop and mobile visible controls fit and open real shared detail',async()=>{
  await pa.screenshot({path:output+'/desktop-final.png',fullPage:true});assert.ok(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await pa.setViewportSize({width:390,height:844});await pa.screenshot({path:output+'/mobile-final.png',fullPage:true});assert.ok(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await open(pa,title);assert.match(await pa.getByRole('dialog').innerText(),/เสร็จสิ้น/);await pa.screenshot({path:output+'/mobile-detail.png',fullPage:false});await close(pa);
 });
 // Separate timing regression: fetch real history, delay only its delivery.
 // The primary ten browser/DB checks above use no interception or fixtures.
 await check('delayed real initial history cannot replace the post-save audit',async()=>{
  phase='timing-regression';const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();collect(page);page.setDefaultTimeout(16000);await login(page,'alice');
  let heldResolve,releaseResolve,deliveredResolve;const held=new Promise(resolve=>{heldResolve=resolve});const release=new Promise(resolve=>{releaseResolve=resolve});const delivered=new Promise(resolve=>{deliveredResolve=resolve});let requests=0;
  const historyPath=`/api/v1/friday-activities/${record.id}/history`;
  await page.route(base+historyPath,async route=>{requests+=1;if(requests!==1){await route.continue();return;}const realResponse=await route.fetch();assert.equal(realResponse.status(),200);heldResolve();await release;await route.fulfill({response:realResponse});deliveredResolve();});
  try {await open(page,title);await held;const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).click();await dialog.getByRole('textbox',{name:'รายละเอียดกิจกรรม',exact:true}).fill('Bob successful shared update; history race verified');await dialog.getByLabel(/^เหตุผลการแก้ไข/).fill('QA delayed initial history regression');const saved=await mutation(page,'PUT',`/api/v1/friday-activities/${record.id}`,()=>dialog.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click());assert.equal(saved.response.status(),200);record=saved.body;await dialog.locator('.friday-live-history').getByText('QA delayed initial history regression',{exact:true}).waitFor();releaseResolve();await delivered;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.match(await dialog.locator('.friday-live-history').innerText(),/QA delayed initial history regression/);assert.ok(requests>=2);await page.screenshot({path:output+'/history-race.png',fullPage:false});}catch(error){await page.screenshot({path:output+'/failure-history-race.png',fullPage:false});await writeFile(output+'/failure-history-race.txt',await page.locator('body').innerText());throw error;}finally{releaseResolve();await context.close();phase='normal';}
 });
 await check('actual PostgreSQL business rows and actor audit evidence',async()=>{
  const rows=JSON.parse(dbSql('SELECT a.id,a.title,a.status,a.revision,p.academic_year,p.term,s.booked,s.attended,s.capacity,s.status FROM friday_activities a JOIN academic_periods p ON p.id=a.period_id JOIN friday_sessions s ON s.activity_id=a.id ORDER BY a.id'));
  assert.equal(rows.length,3);assert.equal(rows[0][0],Number(record.id));assert.equal(rows[0][2],'completed');assert.equal(rows[0][7],0);assert.equal(rows[0][8],null);assert.equal(rows[1][7],null);assert.equal(rows[2][7],0);assert.ok(rows.every(r=>r[4]===2026&&r[5]==='FIRST'));
  const audit=JSON.parse(dbSql('SELECT u.username,e.operation,e.reason,e.activity_id FROM friday_audit_events e JOIN users u ON u.id=e.actor_user_id ORDER BY e.id'));assert.ok(audit.some(r=>r[0]==='alice'&&r[1]==='create'));assert.ok(audit.some(r=>r[0]==='bob'&&r[1]==='update'));assert.ok(audit.some(r=>r[1]==='transition'&&r[2]==='QA complete verified zero attendance'));assert.ok(audit.some(r=>r[2]==='QA delayed initial history regression'));assert.equal(audit.length,12);await writeFile(output+'/database-evidence.json',JSON.stringify({rows,audit,counts:JSON.parse(dbSql('SELECT (SELECT count(*) FROM friday_import_batches),(SELECT count(*) FROM friday_import_receipts),(SELECT count(*) FROM friday_import_source_links),(SELECT count(*) FROM friday_import_audit)'))},null,2));
 });
 assert.equal(errors.length,0,'no framework or page errors');assert.equal(consoleMessages.filter(m=>m.phase!=='expected-api-failure'&&m.type==='error'&&!m.text.includes('409')).length,0,'no unexpected application console errors');
 await writeFile(output+'/results.json',JSON.stringify({passed:true,environment:{base,backend:'explicit isolated Friday harness behind Next rewrite',browser:'Playwright Chromium; Browser plugin not available',viewports:['1440x1000','390x844'],primaryFlowApiInterception:false,timingRegression:'one initial history response fetched from real API and delivered after real post-save history; no fabricated payload',ancillaryFixture:'empty LINE groups directory only; health tests local PG without AI/Neo4j'},results,apiResults,errors,consoleMessages,networkFailures},null,2));
 console.log('ALL PASS '+results.length);console.log('Evidence: '+output);
} catch(e) {await pa.screenshot({path:output+'/failure-alice.png',fullPage:true}).catch(()=>{});await pb.screenshot({path:output+'/failure-bob.png',fullPage:true}).catch(()=>{});await writeFile(output+'/failure-alice.txt',await pa.locator('body').innerText().catch(()=>''));await writeFile(output+'/failure-bob.txt',await pb.locator('body').innerText().catch(()=>''));await writeFile(output+'/failure.json',JSON.stringify({message:e.stack,results,apiResults,errors,consoleMessages,networkFailures},null,2));throw e;} finally {await browser.close();}
