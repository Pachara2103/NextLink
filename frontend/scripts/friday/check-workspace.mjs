import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Called only after check-live's loopback database/harness guards. Reporting
// reads and fixture mutations use the real APIs; no invented report payloads.
export async function checkFridayWorkspace({pa, a, base, check, ready, dbSql, output, setPhase}) {
  const token=await pa.evaluate(()=>JSON.parse(localStorage.getItem('nextlink.session')).token);
  const headers={authorization:`Bearer ${token}`};
  const root='/api/v1/friday-activities';
  const api=async(path,method='GET',data)=>{
    const response=await a.request.fetch(base+root+path,{method,headers,data});
    assert.ok(response.ok(),`${method} ${path}: ${response.status()}`);return response.json();
  };
  const reportReady=async kind=>pa.locator(`[data-report=${kind}][data-ready=true]`).waitFor();
  const tabs=()=>pa.getByRole('tablist',{name:'มุมมองหน้า Friday Activity',exact:true});
  const nextReport=async(action,kind='evaluation')=>{
    const next=pa.waitForResponse(response=>new URL(response.url()).pathname===root+(kind==='overview'?'/analytics':'/evaluations')&&response.request().method()==='GET');
    await action();const response=await next;assert.equal(response.status(),200);await reportReady(kind);return response.json();
  };
  const view=async(name,kind)=>{const tab=tabs().getByRole('tab',{name,exact:true});if(kind&&await tab.getAttribute('aria-selected')!=='true')await nextReport(()=>tab.click(),kind);else{await tab.click();if(kind)await reportReady(kind);}};
  const go=async(query)=>{await pa.goto(base+'/dashboard/friday-activities?year=2569&term=1&'+query);await ready(pa);};
  const subset='Workspace Evaluation QA';
  const source=(kind,tag)=>`${kind==='student'?'ประเมินฝั่งนิสิต.xlsx':kind==='company'?'ประเมินฝั่งบริษัท.xlsx':'ตารางกิจกรรม CEDT FridayAct 2566-2569.xlsx'} | QA ${tag} | แถว 2-9 | SHA256 ${'a'.repeat(64)}`;
  const studentBody=(count,score,provisional=false)=>[
    'ผลประเมินนิสิตระดับกิจกรรม (ไม่เก็บชื่อหรือรหัสนิสิต)',`จำนวนคำตอบ ${count}; ไม่รวมแถว Average`,
    ...(provisional?['การจับคู่ชั่วคราวสำหรับทดสอบ: ต้องยืนยันวันที่จริงก่อนใช้รายงาน']:[]),
    ...['เนื้อหา','วิทยากร','การนำไปใช้','ภาพรวม'].flatMap(label=>[label,`ค่าเฉลี่ย ${score.toFixed(4)}/5; ผลรวม ${count*score}; n=${count}; การกระจาย `+[1,2,3,4,5].map(value=>`${value} คะแนน=${value===score?count:0}`).join(', ')]),
  ].join('\n');
  const companyBody='ผลประเมินฝั่งบริษัท: QA\nวันที่กิจกรรมตามคำตอบ: 2026-09-04\nประทับเวลาต้นทาง: 2026-09-04\nข้อความต้นฉบับ ไม่มีคะแนนตัวเลข\nประสบการณ์\nจัดกิจกรรมร่วมกันได้ดี\nหัวข้อที่สนใจ\nData workshop\nสิ่งที่ควรปรับปรุง\nเพิ่มเวลาปฏิบัติ';
  const createCompleted=async title=>{
    let item=await api('','POST',{idempotencyKey:randomUUID(),academicYear:2026,term:'FIRST',title,
      description:'ข้อมูลสังเคราะห์สำหรับทดสอบรายงาน',domain:'Data',format:'workshop',ownerUserId:'1',companyIds:['1'],people:[],
      sessions:[{sessionDate:'2026-09-04',startTime:'13:00',endTime:'16:00',location:'ห้อง 401',status:'held',capacity:40,booked:20,attended:20}]});
    for(const status of ['confirmed','in_progress','completed'])item=await api(`/${item.id}/transitions`,'POST',{expectedRevision:item.revision,status,reason:null});
    return item;
  };
  const addNote=async(item,body,reference)=>{
    const result=await api(`/${item.id}/notes`,'POST',{expectedRevision:item.revision,idempotencyKey:randomUUID(),reason:null,kind:'fact',occurredAt:null,body,reference});
    return result.activity;
  };
  let small,large,provisional;
  await pa.setViewportSize({width:1440,height:1000});

  await check('three Friday tabs support keyboard URL reload back and forward without losing table filters',async()=>{
    const registryReads=[];
    const recordRequest=request=>{if(new URL(request.url()).pathname===root&&request.method()==='GET')registryReads.push(request.url());};
    pa.on('request',recordRequest);
    await go('view=overview');await reportReady('overview');
    pa.off('request',recordRequest);assert.equal(registryReads.length,0,'overview does not load paged registry rows in the background');
    assert.equal(await tabs().getByRole('tab').count(),3);
    await tabs().getByRole('tab',{name:'ภาพรวม',exact:true}).press('ArrowRight');await reportReady('evaluation');
    assert.equal(new URL(pa.url()).searchParams.get('view'),'evaluation');
    await tabs().getByRole('tab',{name:'ผลการประเมิน',exact:true}).press('End');
    await pa.getByRole('tabpanel',{name:'ตารางกิจกรรม',exact:true}).waitFor();
    await pa.getByRole('searchbox',{name:'ค้นหากิจกรรม บริษัท ศาสตร์ หรือสถานที่',exact:true}).fill('Design QA');
    await ready(pa);await view('ภาพรวม','overview');await view('ตารางกิจกรรม');
    assert.equal(await pa.getByRole('searchbox',{name:'ค้นหากิจกรรม บริษัท ศาสตร์ หรือสถานที่',exact:true}).inputValue(),'Design QA');
    await pa.goBack();await reportReady('overview');assert.equal(await tabs().getByRole('tab',{name:'ภาพรวม',exact:true}).getAttribute('aria-selected'),'true');
    await pa.goForward();await pa.getByRole('tabpanel',{name:'ตารางกิจกรรม',exact:true}).waitFor();
    await pa.reload();await ready(pa);assert.equal(new URL(pa.url()).searchParams.get('view'),'table');
    assert.equal(await pa.getByRole('searchbox',{name:'ค้นหากิจกรรม บริษัท ศาสตร์ หรือสถานที่',exact:true}).inputValue(),'Design QA');
  });

  await check('evaluation cards use weighted real note totals and keep reported scores separate',async()=>{
    small=await createCompleted(subset+' Small');large=await createCompleted(subset+' Large');provisional=await createCompleted(subset+' Provisional');
    small=await addNote(small,studentBody(1,1),source('student','small'));
    large=await addNote(large,studentBody(4,5),source('student','large'));
    provisional=await addNote(provisional,studentBody(20,4,true),source('student','provisional'));
    small=await addNote(small,companyBody,source('company','small'));
    small=await addNote(small,'นำเข้าจากข้อมูลจริงสำหรับทดสอบระบบ\nคะแนนประเมินที่รายงานในตาราง: 1 (แยกจากคะแนนคำนวณจากไฟล์ประเมินนิสิต)',source('reported','small'));
    large=await addNote(large,studentBody(2,4).replace('ผลรวม 8','ผลรวม 9'),source('student','invalid'));
    await go('view=evaluation&q='+encodeURIComponent(subset));await reportReady('evaluation');
    assert.match(await pa.locator('[data-kpi=friday-student-responses] .io-kpi-value').innerText(),/^5/);
    assert.match(await pa.locator('[data-kpi=friday-student-score] .io-kpi-value').innerText(),/^4\.20/);
    assert.match(await pa.locator('#friday-dimensions').innerText(),/5 คำตอบ/);
    assert.match(await pa.locator('#friday-score-distribution').innerText(),/1 คะแนน/);
    assert.match(await pa.locator('#friday-score-distribution').innerText(),/5 คะแนน/);
    const data=await api('/evaluations?academicYear=2026&term=FIRST&search='+encodeURIComponent(subset));
    assert.equal(data.summary.studentResponses,5);assert.equal(data.summary.companyResponses,1);assert.equal(data.summary.invalidReports,1);
    assert.equal(data.summary.dimensions[3].mean,4.2);
  });

  await check('provisional inclusion is explicit shareable and restored after reload',async()=>{
    const checkbox=pa.getByRole('checkbox',{name:/รวมผลประเมินที่จับคู่ชั่วคราวสำหรับทดสอบ/});
    await nextReport(()=>checkbox.check());
    assert.equal(new URL(pa.url()).searchParams.get('includeProvisional'),'true');
    assert.match(await pa.locator('[data-kpi=friday-student-responses] .io-kpi-value').innerText(),/^25/);
    assert.match(await pa.locator('[data-kpi=friday-student-score] .io-kpi-value').innerText(),/^4\.04/);
    await pa.reload();await ready(pa);await reportReady('evaluation');assert.equal(await checkbox.isChecked(),true);
    assert.match(await pa.getByRole('status').filter({hasText:'สถิตินี้รวมข้อมูลจับคู่ชั่วคราว'}).innerText(),/ใช้ทดสอบระบบ/);
    await nextReport(()=>checkbox.uncheck());
    await nextReport(()=>pa.getByRole('combobox',{name:'ชนิดรายงานผลประเมิน',exact:true}).selectOption('reported'));
    assert.match(await pa.locator('.friday-evaluation-reports').innerText(),/1\.00 \/ 5/);
    assert.match(await pa.locator('[data-kpi=friday-student-score] .io-kpi-value').innerText(),/^4\.20/);
    await nextReport(()=>pa.getByRole('combobox',{name:'ชนิดรายงานผลประเมิน',exact:true}).selectOption(''));
  });

  await check('evaluation provenance opens the original versioned activity note without changing data',async()=>{
    const report=pa.locator('[data-evaluation-kind=student]').filter({has:pa.getByRole('heading',{name:subset+' Small',exact:true})});
    await report.locator('summary').click();assert.match(await report.innerText(),/SHA256/);
    await report.getByRole('button',{name:'เปิดกิจกรรมและบันทึกต้นทาง',exact:true}).click();
    const dialog=pa.getByRole('dialog');await dialog.getByRole('heading',{name:subset+' Small',exact:true}).waitFor();
    await dialog.getByRole('article',{name:/บันทึก/}).filter({hasText:'ผลประเมินนิสิตระดับกิจกรรม'}).waitFor();
    assert.equal(new URL(pa.url()).searchParams.get('activityId'),small.id);
    assert.equal(new URL(pa.url()).searchParams.get('view'),'evaluation');
    await dialog.getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await tabs().getByRole('tab',{name:'ผลการประเมิน',exact:true}).getAttribute('aria-selected'),'true');
  });

  await check('company chart and status legend open the corresponding filtered central registry',async()=>{
    await go('view=overview&q='+encodeURIComponent(subset));await reportReady('overview');
    assert.equal(await pa.locator('#friday-status .io-donut-seg').first().evaluate(element=>getComputedStyle(element).stroke!=='none'),true,'a nonzero status draws a visible donut segment');
    await pa.locator('#friday-companies').getByRole('button').first().click();await ready(pa);
    assert.equal(new URL(pa.url()).searchParams.get('companyId'),'1');assert.equal(new URL(pa.url()).searchParams.get('view'),'table');
    assert.equal(await pa.locator('.table-wrap .course-link').count(),3);
    await view('ภาพรวม','overview');await pa.locator('#friday-status').getByRole('button',{name:/เสร็จสิ้น/}).click();await ready(pa);
    assert.equal(new URL(pa.url()).searchParams.get('status'),'completed');assert.equal(new URL(pa.url()).searchParams.get('view'),'table');
    assert.equal(await pa.locator('.table-wrap .course-link').count(),3);
  });

  await check('overview evaluations and registry fit both themes on desktop tablet and mobile',async()=>{
    for(const theme of ['classic','dark']) {
      await pa.getByRole('radio',{name:theme==='classic'?/โหมดสว่าง/:/โหมดมืด/}).filter({visible:true}).first().click();
      for(const [viewName,label] of [['overview','ภาพรวม'],['evaluation','ผลการประเมิน'],['table','ตารางกิจกรรม']]) {
        await go('view='+viewName+'&q='+encodeURIComponent(subset));if(viewName!=='table')await reportReady(viewName);
        for(const [size,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]) {
          await pa.setViewportSize({width,height});await pa.evaluate(()=>window.scrollTo(0,0));
          assert.equal(await pa.getByRole('tabpanel',{name:label,exact:true}).isVisible(),true);
          assert.equal(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${theme} ${viewName} ${size} overflow`);
          await pa.screenshot({path:`${output}/workspace-${viewName}-${theme}-${size}.png`,fullPage:false});
        }
      }
    }
    await pa.setViewportSize({width:1440,height:1000});
  });

  await check('evaluation pagination preserves whole-filter statistics and focuses visible reports',async()=>{
    for(let i=0;i<26;i++)small=await addNote(small,companyBody,source('company','page-'+i));
    await go('view=evaluation&q='+encodeURIComponent(subset));await reportReady('evaluation');
    const first=await api('/evaluations?academicYear=2026&term=FIRST&page=1&pageSize=25&search='+encodeURIComponent(subset));
    const response=pa.waitForResponse(r=>new URL(r.url()).pathname===root+'/evaluations'&&new URL(r.url()).searchParams.get('page')==='2');
    await pa.getByRole('navigation',{name:'แบ่งหน้ารายการรายงานผลประเมิน',exact:true}).getByRole('button',{name:'ถัดไป',exact:true}).click();
    const next=await(await response).json();await reportReady('evaluation');
    assert.equal(next.page,2);assert.deepEqual(next.summary,first.summary);
    assert.equal(next.items.some(item=>first.items.some(previous=>previous.id===item.id)),false);
    await pa.waitForFunction(()=>document.activeElement?.id==='friday-evaluation-reports');
    await pa.reload();await ready(pa);await reportReady('evaluation');assert.equal(new URL(pa.url()).searchParams.get('evaluationPage'),'2');
    await go('view=evaluation&evaluationPage=999&q='+encodeURIComponent(subset));await reportReady('evaluation');
    await nextReport(()=>pa.getByRole('button',{name:'กลับหน้าแรกของผลประเมิน',exact:true}).click());
    assert.equal(new URL(pa.url()).searchParams.get('evaluationPage'),'1');
    assert.match(await pa.locator('[data-kpi=friday-student-responses] .io-kpi-value').innerText(),/^5/);
  });

  await check('a genuine report database failure retains the last snapshot and can be retried',async()=>{
    setPhase('expected-api-failure');dbSql('ALTER TABLE friday_notes RENAME TO friday_notes_qa_unavailable');
    try {
      await pa.getByRole('button',{name:'โหลดข้อมูลใหม่',exact:true}).click();
      await pa.getByRole('alert').filter({hasText:'อ่านรายงานไม่สำเร็จ'}).waitFor();
      assert.match(await pa.locator('[data-kpi=friday-student-responses] .io-kpi-value').innerText(),/^5/);
      assert.match(await pa.locator('[data-report=evaluation]').innerText(),/ฉบับที่อ่านสำเร็จครั้งก่อน/);
    } finally {dbSql('ALTER TABLE friday_notes_qa_unavailable RENAME TO friday_notes');}
    await pa.getByRole('button',{name:'ลองอ่านรายงานอีกครั้ง',exact:true}).click();await reportReady('evaluation');setPhase('normal');
    assert.equal(await pa.getByRole('alert').filter({hasText:'อ่านรายงานไม่สำเร็จ'}).count(),0);
  });

  await check('a delayed real analytics response cannot replace new filters or academic periods',async()=>{
    let heldResolve,releaseResolve,deliveredResolve;
    const held=new Promise(resolve=>{heldResolve=resolve}),release=new Promise(resolve=>{releaseResolve=resolve}),delivered=new Promise(resolve=>{deliveredResolve=resolve});
    let delayed=false;
    await pa.route('**/api/v1/friday-activities/analytics?*',async route=>{
      const url=new URL(route.request().url());
      if(!delayed&&url.searchParams.get('term')==='FIRST') {
        delayed=true;const real=await route.fetch();assert.equal(real.status(),200);heldResolve();await release;await route.fulfill({response:real});deliveredResolve();
      } else await route.continue();
    });
    try {
      await pa.goto(base+'/dashboard/friday-activities?year=2569&term=1&view=overview&q='+encodeURIComponent(subset));await held;
      const expected=await api('/analytics?academicYear=2026&term=FIRST');
      await pa.getByRole('button',{name:'ล้างตัวกรองทั้งหมด',exact:true}).click();await ready(pa);await reportReady('overview');
      releaseResolve();await delivered;
      await pa.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(new URL(pa.url()).searchParams.has('q'),false);
      assert.equal(Number(await pa.locator('[data-kpi=friday-total] .kpi-value > span').innerText()),expected.summary.total);
      await pa.getByRole('combobox',{name:'เลือกภาคการศึกษา',exact:true}).selectOption('2');await ready(pa);await reportReady('overview');
      assert.equal(new URL(pa.url()).searchParams.get('term'),'2');
      assert.equal(Number(await pa.locator('[data-kpi=friday-total] .kpi-value > span').innerText()),(await api('/analytics?academicYear=2026&term=SECOND')).summary.total);
    } finally {releaseResolve();await pa.unroute('**/api/v1/friday-activities/analytics?*');}
  });
}
