import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

// Called only by the guarded real PostgreSQL harness in check-live.mjs.
export async function checkFollowups({pa,pb,a,browser,base,record,title,check,ready,collect,dbSql,output,setPhase}) {
  const path=`/api/v1/friday-activities/${record.id}`;
  const url=`${base}/dashboard/friday-activities?year=2569&term=1&activityId=${record.id}`;
  const detail=p=>p.getByRole('dialog');
  const panel=p=>detail(p).getByRole('region',{name:'บันทึกและงานติดตาม',exact:true});
  const noteForm=p=>panel(p).getByRole('form',{name:'แบบฟอร์มบันทึก',exact:true});
  const taskForm=p=>panel(p).getByRole('form',{name:'แบบฟอร์มงานติดตาม',exact:true});
  const visit=async p=>{await p.goto(url);await ready(p);await panel(p).getByRole('button',{name:'เพิ่มบันทึก',exact:true}).click({trial:true});};
  const save=async(p,method,endpoint,button)=>{
    const response=p.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()===method);
    await button.click();const r=await response;return {status:r.status(),body:await r.json()};
  };
  let noteId,taskId;
  await check('activity deep link survives reload, filtered-out lists and a fresh login',async()=>{
    const target=url+'&q=does-not-match-any-activity&status=draft&page=2';
    await pa.goto(target);await ready(pa);await detail(pa).getByRole('heading',{name:title,exact:true}).waitFor();
    assert.equal(await pa.getByRole('searchbox').inputValue(),'does-not-match-any-activity');
    await pa.reload();await detail(pa).getByRole('heading',{name:title,exact:true}).waitFor();
    assert.equal(new URL(pa.url()).searchParams.get('activityId'),record.id);
    const context=await browser.newContext();const p=await context.newPage();collect(p);
    try {
      await p.goto(target);await p.waitForURL('**/login?next=*');
      await p.locator('input[name=username]').fill('alice');await p.locator('input[name=password]').fill('friday-ui-fixture-password');
      await p.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await detail(p).getByRole('heading',{name:title,exact:true}).waitFor();
      assert.equal(new URL(p.url()).searchParams.get('q'),'does-not-match-any-activity');
      await p.goto(url.replace(`activityId=${record.id}`,'activityId=invalid'));
      await p.getByRole('alert').filter({hasText:'รหัสกิจกรรมในลิงก์ไม่ถูกต้อง'}).waitFor();
      setPhase('expected-api-failure');await p.goto(url.replace(`activityId=${record.id}`,'activityId=999999999'));
      await detail(p).getByRole('alert').filter({hasText:'ไม่พบกิจกรรม'}).waitFor();
    } finally {await context.close();setPhase('normal');}
  });
  await check('facts preserve explicit event time, evidence and server author across accounts',async()=>{
    await visit(pa);await panel(pa).getByRole('button',{name:'เพิ่มบันทึก',exact:true}).click();
    const form=noteForm(pa);
    await form.getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).fill('QA fact: company confirmed the speaker by email');
    await form.getByRole('textbox',{name:'แหล่งอ้างอิง / หลักฐาน',exact:true}).fill('Synthetic email reference F2A-001');
    await form.getByLabel('เวลาเกิดเหตุ (เวลาไทย ไม่จำเป็นต้องระบุ)',{exact:true}).fill('2026-10-18T10:30');
    const result=await save(pa,'POST',path+'/notes',form.getByRole('button',{name:'บันทึกข้อความ',exact:true}));
    assert.equal(result.status,201);noteId=result.body.item.id;
    assert.equal(result.body.item.authorUserId,'1');assert.notEqual(result.body.item.occurredAt,result.body.item.recordedAt);
    assert.equal(new Date(result.body.item.occurredAt).toISOString(),'2026-10-18T03:30:00.000Z');
    await panel(pa).getByRole('article',{name:`บันทึก ${noteId}`,exact:true}).waitFor();
    await visit(pb);assert.match(await panel(pb).innerText(),/QA fact: company confirmed/);assert.match(await panel(pb).innerText(),/Alice Friday QA/);
  });
  await check('note corrections keep earlier text and author in readable version history',async()=>{
    await panel(pb).getByRole('button',{name:`แก้ไขบันทึก ${noteId}`,exact:true}).click();
    const form=noteForm(pb);await form.getByRole('combobox',{name:'ประเภทบันทึก',exact:true}).selectOption('comment');
    await form.getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).fill('QA comment: confirmation still needs a follow-up');
    await form.getByLabel('เหตุผลแก้ไข *',{exact:true}).fill('QA clarify fact versus opinion');
    const result=await save(pb,'PUT',path+`/notes/${noteId}`,form.getByRole('button',{name:'บันทึกข้อความ',exact:true}));
    assert.equal(result.status,200);assert.equal(result.body.item.authorUserId,'1');assert.equal(result.body.item.updatedByUserId,'2');
    await panel(pb).getByRole('button',{name:`ประวัติบันทึก ${noteId}`,exact:true}).click();
    const versions=panel(pb).getByRole('region',{name:'ฉบับก่อนหน้าของบันทึก',exact:true});
    await versions.getByText('QA fact: company confirmed the speaker by email',{exact:true}).waitFor();
    assert.match(await versions.innerText(),/QA comment: confirmation/);assert.match(await versions.innerText(),/QA clarify fact versus opinion/);
  });
  await check('assigned tasks persist due dates, overdue state, completion and reopening reasons',async()=>{
    await visit(pa);await panel(pa).getByRole('button',{name:'เพิ่มงานติดตาม',exact:true}).click();
    let form=taskForm(pa);await form.getByLabel('ชื่องานติดตาม *',{exact:true}).fill('QA follow up with the speaker');
    await form.getByRole('combobox',{name:'ผู้รับผิดชอบงาน *',exact:true}).selectOption('2');await form.getByLabel('กำหนดส่ง (ค.ศ.) *',{exact:true}).fill('2026-01-01');
    const result=await save(pa,'POST',path+'/tasks',form.getByRole('button',{name:'บันทึกงานติดตาม',exact:true}));
    assert.equal(result.status,201);taskId=result.body.item.id;assert.equal(result.body.item.assigneeUserId,'2');
    const card=panel(pa).getByRole('article',{name:`งานติดตาม ${taskId}`,exact:true});await card.getByText('เลยกำหนด',{exact:true}).waitFor();
    await visit(pb);await panel(pb).getByRole('button',{name:`แก้ไขงานติดตาม ${taskId}`,exact:true}).click();
    form=taskForm(pb);await form.getByRole('combobox',{name:'สถานะงานติดตาม',exact:true}).selectOption('done');
    assert.equal((await save(pb,'PUT',path+`/tasks/${taskId}`,form.getByRole('button',{name:'บันทึกงานติดตาม',exact:true}))).status,200);
    await panel(pb).getByRole('button',{name:`แก้ไขงานติดตาม ${taskId}`,exact:true}).click();
    form=taskForm(pb);await form.getByRole('combobox',{name:'สถานะงานติดตาม',exact:true}).selectOption('open');
    assert.equal(await form.getByLabel('เหตุผลแก้ไข *',{exact:true}).getAttribute('required'),'');
    await form.getByLabel('เหตุผลแก้ไข *',{exact:true}).fill('QA request one more confirmation');
    assert.equal((await save(pb,'PUT',path+`/tasks/${taskId}`,form.getByRole('button',{name:'บันทึกงานติดตาม',exact:true}))).status,200);
    await pb.reload();await panel(pb).getByRole('article',{name:`งานติดตาม ${taskId}`,exact:true}).getByText('เลยกำหนด',{exact:true}).waitFor();
  });
  await check('concurrent notes return409, preserve the draft and require explicit revision acceptance',async()=>{
    await Promise.all([visit(pa),visit(pb)]);
    for(const p of [pa,pb]) await panel(p).getByRole('button',{name:'เพิ่มบันทึก',exact:true}).click();
    await noteForm(pa).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).fill('QA concurrent Alice note');
    await noteForm(pb).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).fill('QA concurrent Bob preserved draft');
    assert.equal((await save(pa,'POST',path+'/notes',noteForm(pa).getByRole('button',{name:'บันทึกข้อความ',exact:true}))).status,201);
    assert.equal((await save(pb,'POST',path+'/notes',noteForm(pb).getByRole('button',{name:'บันทึกข้อความ',exact:true}))).status,409);
    assert.equal(await noteForm(pb).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).inputValue(),'QA concurrent Bob preserved draft');
    await pb.screenshot({path:output+'/followup-conflict.png',fullPage:false});
    await noteForm(pb).getByRole('button',{name:'ตรวจแล้ว ใช้ร่างนี้กับรุ่นล่าสุด',exact:true}).click();
    assert.equal((await save(pb,'POST',path+'/notes',noteForm(pb).getByRole('button',{name:'บันทึกข้อความ',exact:true}))).status,201);
  });
  await check('lost post-commit response retries the same receipt without a second note',async()=>{
    await visit(pa);await panel(pa).getByRole('button',{name:'เพิ่มบันทึก',exact:true}).click();
    await noteForm(pa).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).fill('QA lost response must create only one note');
    let intercepted=false;let firstKey;
    const intercept=async route=>{
      if(route.request().method()!=='POST'||intercepted)return route.continue();
      intercepted=true;firstKey=route.request().postDataJSON().idempotencyKey;
      const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed');
    };
    setPhase('expected-api-failure');await a.route('**'+path+'/notes',intercept);
    try {
      await noteForm(pa).getByRole('button',{name:'บันทึกข้อความ',exact:true}).click();
      const retry=noteForm(pa).getByRole('button',{name:'ตรวจผลและลองคำสั่งเดิม',exact:true});await retry.waitFor();
      assert.equal(await noteForm(pa).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).isDisabled(),true);
      const request=pa.waitForRequest(r=>new URL(r.url()).pathname===path+'/notes'&&r.method()==='POST');
      const result=await save(pa,'POST',path+'/notes',retry);assert.equal(result.status,201);assert.equal((await request).postDataJSON().idempotencyKey,firstKey);
      await panel(pa).getByText('QA lost response must create only one note',{exact:true}).waitFor();
      assert.equal(JSON.parse(dbSql("SELECT count(*) FROM friday_notes WHERE body='QA lost response must create only one note'"))[0][0],1);
    } finally {await a.unroute('**'+path+'/notes',intercept);setPhase('normal');}
  });
  await check('an older note read cannot replace the list returned after a save',async()=>{
    await visit(pa);await panel(pa).getByRole('button',{name:'เพิ่มบันทึก',exact:true}).click();
    await noteForm(pa).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).fill('QA note retained after delayed GET');
    let held=false,release,captured,delivered;
    const capturedPromise=new Promise(r=>captured=r),releasePromise=new Promise(r=>release=r),deliveredPromise=new Promise(r=>delivered=r);
    const intercept=async route=>{
      if(route.request().method()!=='GET'||held)return route.continue();
      held=true;const response=await route.fetch();captured();await releasePromise;await route.fulfill({response});delivered();
    };
    await a.route('**'+path+'/notes',intercept);
    try {
      await panel(pa).getByRole('button',{name:'โหลดบันทึกและงานใหม่',exact:true}).click();await capturedPromise;
      assert.equal((await save(pa,'POST',path+'/notes',noteForm(pa).getByRole('button',{name:'บันทึกข้อความ',exact:true}))).status,201);
      await panel(pa).getByText('QA note retained after delayed GET',{exact:true}).waitFor();release();await deliveredPromise;
      await pa.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await panel(pa).getByText('QA note retained after delayed GET',{exact:true}).count(),1);
    } finally {release();await a.unroute('**'+path+'/notes',intercept);}
  });
  await check('unsaved follow-up stays open when discard is rejected and forms fit mobile',async()=>{
    await panel(pa).getByRole('button',{name:'เพิ่มบันทึก',exact:true}).click();
    await noteForm(pa).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).fill('QA draft to keep');
    pa.removeAllListeners('dialog');pa.on('dialog',d=>d.dismiss());
    await detail(pa).getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();
    assert.equal(await noteForm(pa).getByRole('textbox',{name:'ข้อความบันทึก *',exact:true}).inputValue(),'QA draft to keep');
    await pa.setViewportSize({width:390,height:844});await noteForm(pa).scrollIntoViewIfNeeded();
    assert.ok(await detail(pa).evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    const box=await noteForm(pa).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
    await pa.screenshot({path:output+'/followups-mobile.png',fullPage:false});
    pa.removeAllListeners('dialog');pa.on('dialog',d=>d.accept());
    await noteForm(pa).getByRole('button',{name:'ยกเลิกร่าง',exact:true}).click();
    await pa.setViewportSize({width:1440,height:1000});await panel(pa).scrollIntoViewIfNeeded();
    await pa.screenshot({path:output+'/followups-desktop.png',fullPage:false});
  });
  const notes=JSON.parse(dbSql('SELECT id,kind,version,author_user_id,updated_by_user_id,occurred_at,recorded_at FROM friday_notes ORDER BY id'));
  const tasks=JSON.parse(dbSql('SELECT id,title,assignee_user_id,due_date,status,version FROM friday_tasks ORDER BY id'));
  const audit=JSON.parse(dbSql("SELECT operation,actor_user_id,reason,detail FROM friday_audit_events WHERE operation LIKE 'note.%' OR operation LIKE 'task.%' ORDER BY id"));
  assert.equal(notes.length,5);assert.equal(tasks.length,1);assert.equal(audit.length,9);
  await writeFile(output+'/followup-database-evidence.json',JSON.stringify({notes,tasks,audit},null,2));
}
