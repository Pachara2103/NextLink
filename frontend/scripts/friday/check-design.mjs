import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

// Runs after the existing real-PostgreSQL workflow suite, in its guarded local
// harness. No API payloads are intercepted; added records are synthetic fixtures.
export async function checkFridayDesign({pa, a, base, check, ready, output}) {
  const token = await pa.evaluate(() => JSON.parse(localStorage.getItem('nextlink.session')).token);
  const headers = {authorization:`Bearer ${token}`};
  const api = async (path, method='GET', data) => {
    const response = await a.request.fetch(base+'/api/v1/friday-activities'+path,{method,headers,data});
    assert.ok(response.ok(),`Real fixture API ${method} ${path}: ${response.status()}`);
    return response.json();
  };
  const query = '?academicYear=2026&term=FIRST&page=1&pageSize=25';
  const go = async (suffix='?year=2569&term=1') => {
    await pa.goto(base+'/dashboard/friday-activities'+suffix); await ready(pa);
  };
  const readAfter = async action => {
    const next = pa.waitForResponse(r => new URL(r.url()).pathname==='/api/v1/friday-activities' && r.request().method()==='GET');
    await action(); const response = await next; assert.equal(response.status(),200); await ready(pa);
    return response.json();
  };
  const create = (title, academicYear=2026, term='FIRST', index=0) => api('','POST',{
    idempotencyKey:`friday-design-${academicYear}-${term}-${index}`,
    academicYear,term,title,description:'ข้อมูลสังเคราะห์สำหรับตรวจหน้าตาและการใช้งาน Friday',
    domain:'Data & Technology',format:'workshop',ownerUserId:'1',companyIds:['1'],people:[],
    sessions:[{sessionDate:`${academicYear}-09-04`,startTime:'13:00',endTime:'16:00',location:'ห้อง 401 ตึกร้อยปี',status:'planned',capacity:40,booked:0,attended:null}],
  });
  let detail;
  if (await pa.getByRole('dialog').isVisible()) await pa.getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();
  await pa.setViewportSize({width:1440,height:1000});
  await go();

  await check('restored header switches real academic periods and preserves module navigation',async()=>{
    await create('Design QA historical activity',2022,'FIRST');
    await create('Design QA second-term activity',2026,'SECOND');
    await go();
    const topbar=pa.locator('.friday-live-dashboard > .topbar');
    assert.ok(await topbar.getByRole('navigation',{name:'โมดูล Dashboard'}).isVisible());
    assert.ok(await topbar.getByRole('combobox',{name:'เลือกปีการศึกษา',exact:true}).locator('option[value="2565"]').count());
    await readAfter(()=>topbar.getByRole('combobox',{name:'เลือกปีการศึกษา',exact:true}).selectOption('2565'));
    await pa.getByRole('button',{name:/^Design QA historical activity/}).filter({visible:true}).waitFor();
    assert.match(pa.url(),/year=2565/);
    await readAfter(()=>pa.getByRole('combobox',{name:'เลือกภาคการศึกษา',exact:true}).selectOption('summer'));
    assert.match(await pa.locator('#dashboard-directory').innerText(),/ยังไม่มีกิจกรรม/);
    assert.equal(await pa.locator('.kpi-card.blue .kpi-value').innerText(),'0');
    await readAfter(()=>pa.getByRole('combobox',{name:'เลือกปีการศึกษา',exact:true}).selectOption('2569'));
    await readAfter(()=>pa.getByRole('combobox',{name:'เลือกภาคการศึกษา',exact:true}).selectOption('2'));
    await pa.getByRole('button',{name:/^Design QA second-term activity/}).filter({visible:true}).waitFor();
    await pa.getByRole('navigation',{name:'โมดูล Dashboard'}).getByRole('link',{name:'วิชาเลือก',exact:true}).click();
    await pa.getByRole('heading',{name:'ภาพรวมวิชาเลือก',exact:true}).waitFor();
    assert.equal(new URL(pa.url()).searchParams.get('term'),'2');
    await pa.getByRole('navigation',{name:'โมดูล Dashboard'}).getByRole('link',{name:'Friday Activity',exact:true}).click();
    await ready(pa); assert.equal(new URL(pa.url()).searchParams.get('term'),'2');
  });

  await check('summary and paging cover the whole filtered dataset beyond 25 visible rows',async()=>{
    const before=await api(query);
    for(let i=0;i<30;i++) {
      const item=await create(`Design QA activity ${String(i+1).padStart(2,'0')}`,2026,'FIRST',i);
      if(i===0) detail=item;
    }
    const all=await api(query);
    assert.equal(all.total,before.total+30); assert.equal(all.items.length,25);
    const added=await api(`/${detail.id}/notes`,'POST',{
      expectedRevision:detail.revision,idempotencyKey:'friday-design-long-note',reason:null,
      kind:'fact',occurredAt:null,reference:'ข้อมูลสังเคราะห์สำหรับทดสอบ',
      body:'ผลประเมินกิจกรรมระดับภาพรวม\nจำนวนคำตอบ 20\nเนื้อหาและประโยชน์ 4.65 / 5\nการถ่ายทอดของวิทยากร 4.80 / 5\nทักษะและการนำไปใช้ 4.55 / 5\nความพึงพอใจโดยรวม 4.90 / 5\n'+('ข้อเสนอแนะ: เพิ่มเวลาฝึกปฏิบัติและตัวอย่างการใช้งานจริง\n'.repeat(8)),
    });
    detail=added.activity;
    await go();
    assert.equal(Number(await pa.locator('.kpi-card.blue .kpi-value').innerText()),all.total);
    assert.equal(await pa.locator('.table-wrap tbody tr').count(),25);
    assert.equal(await pa.locator('.kpi-card.green .kpi-value').innerText(),`${all.summary.completed} / ${all.total}`);
    const first=await pa.locator('.table-wrap .course-link').first().innerText();
    await readAfter(()=>pa.getByRole('navigation',{name:'แบ่งหน้ารายการกิจกรรม'}).getByRole('button',{name:'ถัดไป',exact:true}).click());
    assert.equal(new URL(pa.url()).searchParams.get('page'),'2');
    assert.notEqual(await pa.locator('.table-wrap .course-link').first().innerText(),first);
    assert.equal(Number(await pa.locator('.kpi-card.blue .kpi-value').innerText()),all.total);
    await pa.reload();await ready(pa);assert.equal(new URL(pa.url()).searchParams.get('page'),'2');
  });

  await check('individual filter chips preserve the other filters and reset pagination',async()=>{
    const filters=pa.getByRole('region',{name:'ค้นหาและกรองกิจกรรม',exact:true});
    await readAfter(()=>filters.getByRole('searchbox').fill('Design QA activity'));
    await readAfter(()=>filters.getByRole('combobox',{name:'บริษัท',exact:true}).selectOption('1'));
    await readAfter(()=>filters.getByRole('combobox',{name:'สถานะ',exact:true}).selectOption('draft'));
    assert.equal(new URL(pa.url()).searchParams.has('page'),false);
    assert.match(await filters.locator('.filter-summary').innerText(),/30 กิจกรรม/);
    await readAfter(()=>filters.getByRole('button',{name:/^ล้างตัวกรอง บริษัท:/}).click());
    let url=new URL(pa.url());assert.equal(url.searchParams.get('q'),'Design QA activity');assert.equal(url.searchParams.get('status'),'draft');assert.equal(url.searchParams.has('companyId'),false);
    await readAfter(()=>filters.getByRole('button',{name:/^ล้างตัวกรอง ค้นหา:/}).click());
    url=new URL(pa.url());assert.equal(url.searchParams.get('status'),'draft');assert.equal(url.searchParams.has('q'),false);
    await readAfter(()=>filters.getByRole('button',{name:/^ล้างตัวกรอง สถานะ:/}).click());
    assert.equal(await filters.locator('.filter-summary button').count(),0);
    await filters.getByRole('link',{name:/ดูผลการค้นหา/}).click();
    assert.equal(await pa.evaluate(()=>document.activeElement?.id),'dashboard-directory');
    await pa.getByRole('navigation',{name:'ทางลัดในหน้านี้'}).getByRole('link',{name:'ค้นหา',exact:true}).click();
    assert.equal(await pa.evaluate(()=>document.activeElement?.id),'dashboard-filters');
  });

  await check('Friday matches elective theme tokens with desktop tablet and mobile screenshots',async()=>{
    const evidence=[];
    const style=()=>pa.evaluate(()=>{
      const nav=getComputedStyle(document.querySelector('.topbar .dashboard-module-nav a[aria-current=page]'));
      const card=getComputedStyle(document.querySelector('.kpi-card.blue'));
      const search=getComputedStyle(document.querySelector('.control-panel input[type=search]'));
      return {header:getComputedStyle(document.querySelector('.topbar')).backgroundColor,nav:nav.backgroundColor,card:card.backgroundColor,radius:card.borderRadius,search:search.backgroundColor,searchRadius:search.borderRadius};
    });
    for(const theme of ['classic','dark']) {
      await pa.setViewportSize({width:1440,height:1000});
      await pa.getByRole('radio',{name:theme==='classic'?/โหมดสว่าง/:/โหมดมืด/}).filter({visible:true}).first().click();
      await pa.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
      await pa.goto(base+'/dashboard/electives?year=2569&term=1');
      await pa.getByRole('heading',{name:'ภาพรวมวิชาเลือก',exact:true}).waitFor();
      const reference=await style();
      await pa.screenshot({path:`${output}/reference-electives-${theme}.png`});
      await go(); assert.deepEqual(await style(),reference,'shared design tokens must match elective reference');
      for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]) {
        await pa.setViewportSize({width,height});await pa.evaluate(()=>window.scrollTo(0,0));
        assert.equal(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${theme} ${name} page overflow`);
        const header=await pa.locator('.friday-live-dashboard > .topbar').boundingBox();
        const selector=await pa.getByRole('combobox',{name:'เลือกภาคการศึกษา',exact:true}).boundingBox();
        assert.ok(selector.x>=header.x&&selector.x+selector.width<=header.x+header.width+1);
        assert.equal(await pa.locator('h1').count(),1);
        assert.match(await pa.title(),/Friday Activity/);
        await pa.screenshot({path:`${output}/design-${theme}-${name}.png`});
        evidence.push({theme,viewport:`${width}x${height}`,tokens:reference,overflow:false});
      }
    }
    await writeFile(output+'/design-evidence.json',JSON.stringify({source:'elective dashboard from the same main base',api:'real isolated PostgreSQL harness; no API interception',comparisons:evidence},null,2));
  });

  await check('detail notes and edit footer remain readable and reachable on every viewport',async()=>{
    await go(`?year=2569&term=1&activityId=${detail.id}`);
    let dialog=pa.getByRole('dialog');
    await dialog.getByRole('article',{name:/บันทึก/}).filter({hasText:'ผลประเมินกิจกรรมระดับภาพรวม'}).waitFor();
    for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]) {
      await pa.setViewportSize({width,height});
      await dialog.locator('.dialog-content').evaluate(element=>element.scrollTop=0);
      assert.ok(await dialog.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).isVisible());
      await pa.screenshot({path:`${output}/design-detail-${name}.png`});
      await dialog.getByRole('button',{name:'แก้ไขข้อมูล',exact:true}).click();
      await dialog.getByRole('textbox',{name:'รายละเอียดกิจกรรม',exact:true}).fill('Unsaved design QA draft');
      const save=dialog.getByRole('button',{name:'บันทึกกิจกรรม',exact:true});
      const box=await save.boundingBox(); assert.ok(box&&box.y>=0&&box.y+box.height<=height,`${name} save footer is clipped`);
      assert.equal(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),true,`${name} dialog overflow`);
      await pa.screenshot({path:`${output}/design-edit-${name}.png`});
      await dialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();
      assert.notEqual((await api('/'+detail.id)).description,'Unsaved design QA draft');
    }
    await dialog.getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();
    await ready(pa);
  });

  await check('import presentation exposes the same upload review and commit workflow on mobile',async()=>{
    await pa.getByRole('button',{name:'นำเข้า Excel / CSV',exact:true}).click();
    const panel=pa.getByRole('region',{name:'นำเข้า Friday Activity',exact:true});
    assert.equal(await panel.getByRole('heading',{name:'นำเข้า Friday Activity',exact:true}).evaluate(e=>e===document.activeElement),true);
    assert.equal(await panel.getByRole('list',{name:'ขั้นตอนการนำเข้า'}).locator('[aria-current=step]').innerText(),'1\nเลือกไฟล์');
    await panel.getByLabel('ไฟล์กิจกรรม (.csv / .xlsx)',{exact:true}).waitFor();
    assert.equal(await pa.getByRole('combobox',{name:'เลือกปีการศึกษา',exact:true}).isDisabled(),true);
    assert.equal(await pa.getByRole('combobox',{name:'เลือกภาคการศึกษา',exact:true}).isDisabled(),true);
    assert.equal(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    const heading=await panel.getByRole('heading',{name:'นำเข้า Friday Activity',exact:true}).boundingBox();
    const shortcuts=await pa.getByRole('navigation',{name:'ทางลัดในหน้านี้'}).boundingBox();
    assert.ok(heading.y>=shortcuts.y+shortcuts.height,'sticky shortcuts cannot cover import title');
    assert.equal(await panel.getByRole('list',{name:'ขั้นตอนการนำเข้า'}).locator('li > span').first().evaluate(e=>Math.round(e.getBoundingClientRect().width)),26);
    await pa.screenshot({path:output+'/design-import-mobile.png'});
    await panel.getByRole('button',{name:'ปิดการนำเข้า',exact:true}).click();
    assert.equal(await pa.getByRole('combobox',{name:'เลือกปีการศึกษา',exact:true}).isEnabled(),true);
    assert.equal(await pa.getByRole('button',{name:'นำเข้า Excel / CSV',exact:true}).evaluate(e=>e===document.activeElement),true);
    await pa.setViewportSize({width:1440,height:1000});await go();
  });

  await check('unsaved import review cannot be lost through period or module navigation',async()=>{
    const before=await api(query);
    await pa.getByRole('button',{name:'นำเข้า Excel / CSV',exact:true}).click();
    const panel=pa.getByRole('region',{name:'นำเข้า Friday Activity',exact:true});
    await panel.getByLabel('ไฟล์กิจกรรม (.csv / .xlsx)',{exact:true}).setInputFiles(output+'/friday-activity.csv');
    const preview=pa.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/friday-activities/imports/preview'&&r.request().method()==='POST');
    await panel.getByRole('button',{name:'สร้างตัวอย่างเพื่อตรวจ',exact:true}).click();
    assert.equal((await preview).status(),201);
    assert.match(await panel.getByRole('list',{name:'ขั้นตอนการนำเข้า'}).locator('[aria-current=step]').innerText(),/ตรวจและจับคู่/);
    await panel.locator('details').first().locator('summary').first().click();
    await panel.getByRole('textbox',{name:'ชื่อกิจกรรม',exact:true}).fill('Unsaved import design QA draft');
    assert.equal(await panel.getByRole('button',{name:'ปิดการนำเข้า',exact:true}).isDisabled(),true);
    assert.equal(await pa.getByRole('combobox',{name:'เลือกภาคการศึกษา',exact:true}).isDisabled(),true);
    const previousUrl=pa.url();let warned=false;
    pa.removeAllListeners('dialog');
    pa.once('dialog',async dialog=>{warned=true;await dialog.dismiss();});
    try {
      await pa.getByRole('navigation',{name:'โมดูล Dashboard'}).getByRole('link',{name:'วิชาเลือก',exact:true}).click();
      assert.equal(warned,true);assert.equal(pa.url(),previousUrl);
      assert.equal(await panel.getByRole('textbox',{name:'ชื่อกิจกรรม',exact:true}).inputValue(),'Unsaved import design QA draft');
    } finally {pa.removeAllListeners('dialog');pa.on('dialog',dialog=>dialog.accept());}
    await panel.getByRole('button',{name:'ทิ้งการแก้ไขที่ยังไม่บันทึก',exact:true}).click();
    await panel.getByRole('button',{name:'ปิดการนำเข้า',exact:true}).click();
    assert.equal((await api(query)).total,before.total,'preview and discarded review never insert an activity');
  });

  await check('cancel and reopen preserve activity notes and record both status reasons',async()=>{
    await go(`?year=2569&term=1&activityId=${detail.id}`);
    const dialog=pa.getByRole('dialog');
    for(const [status,reason] of [['cancelled','Design QA cancel with reason'],['draft','Design QA reopen with reason']]) {
      await dialog.getByRole('combobox',{name:'สถานะถัดไป',exact:true}).selectOption(status);
      await dialog.getByLabel('เหตุผล / บันทึกการติดตาม',{exact:true}).fill(reason);
      const changed=pa.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/friday-activities/${detail.id}/transitions`&&r.request().method()==='POST');
      await dialog.getByRole('button',{name:'บันทึกสถานะ',exact:true}).click();
      const response=await changed;assert.equal(response.status(),200);assert.equal((await response.json()).status,status);
      await dialog.locator('.friday-live-history').getByText(reason,{exact:true}).waitFor();
      await dialog.getByRole('article',{name:/บันทึก/}).filter({hasText:'ผลประเมินกิจกรรมระดับภาพรวม'}).waitFor();
    }
    await dialog.getByRole('button',{name:'ปิดรายละเอียด',exact:true}).click();
    await ready(pa);
  });
}
