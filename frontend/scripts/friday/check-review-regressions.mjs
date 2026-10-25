import assert from 'node:assert/strict';

// Runs after the baseline database assertions, inside the guarded local harness.
export async function checkReviewRegressions({pa,a,base,record,title,check,ready,dbSql,output,setPhase}) {
  const list=base+'/dashboard/friday-activities?year=2569&term=1';
  const detail=()=>pa.getByRole('dialog');
  const close=async()=>{await detail().getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();await detail().waitFor({state:'hidden'});};
  await pa.setViewportSize({width:1440,height:1000});
  await check('filter URL survives clear/reload and restores search on browser back/forward',async()=>{
    await pa.goto(list+'&q=QA');await ready(pa);
    await pa.getByRole('button',{name:'ล้างตัวกรอง',exact:true}).click();
    assert.equal(new URL(pa.url()).searchParams.get('q'),null);
    await pa.reload();await ready(pa);assert.equal(await pa.getByRole('searchbox').inputValue(),'');
    await pa.getByRole('searchbox').fill('QA');
    await pa.getByRole('button',{name:'ดูรายละเอียด '+title,exact:true}).filter({visible:true}).first().click();
    await detail().getByRole('heading',{name:title,exact:true}).waitFor();await close();
    await pa.getByRole('searchbox').fill('QA XLSX');
    assert.equal(new URL(pa.url()).searchParams.get('q'),'QA XLSX');
    await pa.goBack();await pa.waitForFunction(()=>new URL(location.href).searchParams.get('q')==='QA');
    assert.equal(await pa.getByRole('searchbox').inputValue(),'QA');
    await pa.goForward();await pa.waitForFunction(()=>new URL(location.href).searchParams.get('q')==='QA XLSX');
    assert.equal(await pa.getByRole('searchbox').inputValue(),'QA XLSX');
    await pa.reload();await ready(pa);assert.equal(await pa.getByRole('searchbox').inputValue(),'QA XLSX');
    await pa.getByRole('combobox',{name:'สถานะ',exact:true}).selectOption('draft');
    assert.equal(new URL(pa.url()).searchParams.get('status'),'draft');
    await pa.screenshot({path:output+'/filters-desktop.png',fullPage:true});
  });
  await check('malformed query filters never send fractional pages, inherited statuses or overflowing IDs',async()=>{
    for(const page of ['1.5','Infinity']) {
      const response=pa.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/friday-activities');
      await pa.goto(list+`&page=${page}&status=toString&companyId=9223372036854775808`);
      const r=await response;assert.equal(r.status(),200);await ready(pa);
      const query=new URL(r.url()).searchParams;
      assert.equal(query.get('page'),'1');assert.equal(query.get('status'),null);assert.equal(query.get('companyId'),null);
      assert.equal(await pa.getByRole('combobox',{name:'สถานะ',exact:true}).inputValue(),'');
    }
  });
  await check('lost activity create response freezes the command and recovers one receipt after another outage',async()=>{
    await pa.goto(list);await ready(pa);await pa.getByRole('button',{name:'สร้างกิจกรรม',exact:true}).click();
    await detail().getByRole('textbox',{name:'ชื่อกิจกรรม *',exact:true}).fill('QA review recovered activity');
    await detail().getByRole('combobox',{name:'เจ้าหน้าที่ผู้รับผิดชอบ *',exact:true}).selectOption('1');
    const commands=[];let saved;
    const intercept=async route=>{
      if(route.request().method()!=='POST') return route.continue();
      commands.push(route.request().postDataJSON());
      if(commands.length===1){const r=await route.fetch();assert.equal(r.status(),201);saved=await r.json();await route.abort('failed');}
      else if(commands.length===2) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'QA temporary outage during receipt recovery'})});
      else await route.continue();
    };
    setPhase('expected-api-failure');await a.route('**/api/v1/friday-activities',intercept);
    try {
      await detail().getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click();
      const retry=()=>detail().getByRole('button',{name:'ตรวจผลและลองคำสั่งเดิม',exact:true});
      await retry().waitFor();assert.equal(await detail().getByRole('textbox',{name:'ชื่อกิจกรรม *',exact:true}).isDisabled(),true);
      assert.equal(await detail().getByRole('button',{name:'ยกเลิก',exact:true}).isDisabled(),true);
      await detail().getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();
      await detail().getByText('กรุณาตรวจผลคำสั่งบันทึกที่ยังไม่ทราบผลก่อนปิดรายละเอียด',{exact:true}).waitFor();
      await retry().click();await retry().waitFor();
      assert.doesNotMatch(await detail().innerText(),/ข้อมูลยังไม่ได้บันทึก/);
      assert.equal(await detail().getByRole('textbox',{name:'ชื่อกิจกรรม *',exact:true}).isDisabled(),true);
      await pa.setViewportSize({width:390,height:844});await detail().locator('.dialog-content').evaluate(e=>e.scrollTop=0);
      assert.ok(await detail().evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      await pa.screenshot({path:output+'/create-recovery-mobile.png'});
      const response=pa.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/friday-activities'&&r.request().method()==='POST');
      await retry().click();const r=await response;assert.equal(r.status(),201);assert.equal((await r.json()).id,saved.id);
      await detail().getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).waitFor();
      assert.equal(new URL(pa.url()).searchParams.get('activityId'),saved.id);
      assert.equal(commands.length,3);assert.deepEqual(commands[0],commands[1]);assert.deepEqual(commands[0],commands[2]);
      assert.equal(JSON.parse(dbSql("SELECT count(*) FROM friday_activities WHERE title='QA review recovered activity'"))[0][0],1);
      await close();await pa.setViewportSize({width:1440,height:1000});
    } finally {await a.unroute('**/api/v1/friday-activities',intercept);setPhase('normal');}
  });
  // Use actual authenticated HTTP commands to create enough rows for page two.
  const request=pa.waitForRequest(r=>new URL(r.url()).pathname===`/api/v1/friday-activities/${record.id}`);
  await pa.goto(list+'&activityId='+record.id);await ready(pa);
  const headers={authorization:(await request).headers().authorization};
  const api=async(method,path,data)=>{
    const r=await a.request.fetch(base+path,{method,headers,data});
    assert.ok(r.ok(),`${method} ${path}: ${r.status()} ${await r.text()}`);return r.json();
  };
  for(const kind of ['note','task']) await check(`older ${kind} conflict compares the actual item beyond the first 50 rows before retry`,async()=>{
    const created=await api('POST','/api/v1/friday-activities',{academicYear:2026,term:'FIRST',title:`QA older ${kind} review`,format:'talk',ownerUserId:'1',companyIds:[],people:[],sessions:[],idempotencyKey:crypto.randomUUID()});
    const path=`/api/v1/friday-activities/${created.id}`,collection=kind==='note'?'notes':'tasks';
    const fields=kind==='note'?{kind:'fact',body:'QA older original note',reference:'Original evidence',occurredAt:null}:{title:'QA older original task',description:'Original task description',assigneeUserId:'2',dueDate:'2026-10-23',status:'open'};
    let oldest;
    for(let revision=1;revision<=51;revision++){
      const result=await api('POST',path+'/'+collection,{...fields,expectedRevision:revision,idempotencyKey:crypto.randomUUID()});
      if(revision===1) oldest=result.item;
    }
    await pa.goto(list+'&activityId='+created.id);await ready(pa);
    const panel=detail().getByRole('region',{name:'บันทึกและงานติดตาม',exact:true});
    await panel.getByRole('button',{name:kind==='note'?'อ่านบันทึกเพิ่มเติม':'อ่านงานติดตามเพิ่มเติม',exact:true}).click();
    await panel.getByRole('button',{name:`แก้ไข${kind==='note'?'บันทึก':'งานติดตาม'} ${oldest.id}`,exact:true}).click();
    const form=panel.getByRole('form',{name:kind==='note'?'แบบฟอร์มบันทึก':'แบบฟอร์มงานติดตาม',exact:true});
    const input=form.getByRole('textbox',{name:kind==='note'?'ข้อความบันทึก *':'ชื่องานติดตาม *',exact:true});
    await input.fill(`QA ${kind} draft kept for review`);
    if(kind==='note') await form.getByRole('textbox',{name:'เหตุผลแก้ไข *',exact:true}).fill('QA conflict correction');
    const changed=kind==='note'?{...fields,body:'QA latest old note from another writer',reference:'Updated evidence'}:{...fields,title:'QA latest old task from another writer',description:'Updated task description',status:'done'};
    await api('PUT',path+'/'+collection+'/'+oldest.id,{...changed,expectedRevision:52,reason:'QA concurrent correction',idempotencyKey:crypto.randomUUID()});
    // Delay conflict item lookup to prove acceptance waits for the actual row.
    let release,captured;const held=new Promise(r=>captured=r),gate=new Promise(r=>release=r);
    const intercept=async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch();captured();await gate;await route.fulfill({response});};
    await a.route('**'+path+'/'+collection+'/'+oldest.id,intercept);
    try {
      const response=pa.waitForResponse(r=>new URL(r.url()).pathname===path+'/'+collection+'/'+oldest.id&&r.request().method()==='PUT');
      await form.getByRole('button',{name:kind==='note'?'บันทึกข้อความ':'บันทึกงานติดตาม',exact:true}).click();
      assert.equal((await response).status(),409);await held;
      assert.equal(await form.getByRole('button',{name:'ตรวจแล้ว ใช้ร่างนี้กับรุ่นล่าสุด',exact:true}).count(),0);
      release();await form.getByText('รายการฉบับปัจจุบัน',{exact:true}).waitFor();
      assert.match(await form.locator('details').innerText(),kind==='note'?/QA latest old note from another writer/:/QA latest old task from another writer/);
      assert.equal(await input.inputValue(),`QA ${kind} draft kept for review`);
      if(kind==='task') assert.match(await form.locator('details').innerText(),/Updated task description/);
      await form.locator('.friday-live-conflict').scrollIntoViewIfNeeded();
      await pa.screenshot({path:output+`/older-${kind}-conflict.png`});
      await form.getByRole('button',{name:'ตรวจแล้ว ใช้ร่างนี้กับรุ่นล่าสุด',exact:true}).click();
      if(kind==='task'){assert.equal(await form.getByRole('textbox',{name:'เหตุผลแก้ไข *',exact:true}).getAttribute('required'),'');await form.getByRole('textbox',{name:'เหตุผลแก้ไข *',exact:true}).fill('QA explicitly reopen reviewed task');}
      const saved=pa.waitForResponse(r=>new URL(r.url()).pathname===path+'/'+collection+'/'+oldest.id&&r.request().method()==='PUT');
      await form.getByRole('button',{name:kind==='note'?'บันทึกข้อความ':'บันทึกงานติดตาม',exact:true}).click();
      const result=await saved;assert.equal(result.status(),200);const body=await result.json();
      assert.equal(body.activity.revision,54);assert.equal(body.item.version,3);assert.equal(kind==='note'?body.item.body:body.item.title,`QA ${kind} draft kept for review`);
    } finally {release();await a.unroute('**'+path+'/'+collection+'/'+oldest.id,intercept);}
  });
}
