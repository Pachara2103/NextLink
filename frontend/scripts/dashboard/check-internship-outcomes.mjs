import assert from 'node:assert/strict';

export async function checkInternshipOutcomes({ page, context, base, go, check, theme, output }) {
  const panel = () => page.locator('#internship-outcomes');
  const ready = () => page.locator('#internship-outcomes[data-ready="true"]').waitFor();
  const stage = key => panel().locator('[data-stage="' + key + '"] > strong').innerText();
  const kpi = key => page.locator('[data-kpi="' + key + '"] .kpi-value').innerText();
  const cloud = '/internship?year=2569&term=1&q=Mock%20Cloud';
  await check('internship unique students and independent outcomes follow company, cohort and round filters', async () => {
    await go('/internship?year=2569&term=1'); await ready();
    const allPeople = Number(await kpi('unique-applicants'));
    const applications = Number((await page.locator('[data-kpi="unique-applicants"] .kpi-note').innerText()).match(/จาก ([\d,]+)/)[1].replaceAll(',', ''));
    assert.ok(allPeople > 0 && allPeople < applications, 'same person in two rounds is counted once');
    await go(cloud); await ready();
    assert.equal(await kpi('openings'), '2');
    assert.equal(await stage('matched'), '2'); assert.equal(await stage('accepted'), '2'); assert.equal(await stage('started'), '2');
    await page.getByRole('combobox', { name: 'รอบสมัคร', exact: true }).selectOption('1');
    await page.waitForURL('**/*round=1*');
    assert.equal(await stage('matched'), '1'); assert.equal(await stage('accepted'), '0'); assert.equal(await stage('started'), '0');
    await page.getByRole('combobox', { name: 'ชั้นปีนิสิต', exact: true }).selectOption('2');
    await page.waitForURL('**/*studyYear=2*');
    assert.equal(await stage('started'), 'ยังไม่มีข้อมูล');
    await page.getByRole('searchbox').fill('NO-MATCH-COMPANY');
    await page.waitForURL('**/*q=NO-MATCH-COMPANY*');
    assert.equal(await kpi('unique-applicants'), '0'); assert.equal(await kpi('openings'), '0');
  });
  await check('outcome edits survive reload and do not change preferences, legacy totals or other periods and tracks', async () => {
    await go(cloud); await ready();
    const before = await page.locator('.kpi-grid').innerText();
    await panel().getByText('ตรวจผลรายนิสิต (3 รายการ)', { exact: true }).click();
    await panel().getByRole('button', { name: 'ตรวจผล demo-outcome-1', exact: true }).click();
    const editor = page.getByRole('article', { name: 'บันทึกผลรายนิสิต', exact: true });
    await editor.getByRole('button', { name: 'แก้ไขสถานะ', exact: true }).click();
    await editor.getByRole('combobox', { name: 'นิสิตตอบรับแล้ว', exact: true }).selectOption('true');
    await editor.getByRole('combobox', { name: 'เข้าฝึกจริงแล้ว', exact: true }).selectOption('null');
    await editor.getByRole('textbox', { name: 'หมายเหตุผลรายนิสิต', exact: true }).fill('Synthetic result saved in browser check');
    await editor.getByRole('button', { name: 'บันทึกผลรายนิสิต', exact: true }).click();
    await editor.getByText('บันทึกการแก้ไขแล้ว', { exact: true }).waitFor();
    assert.equal(await page.locator('.kpi-grid').innerText(), before);
    await page.reload(); await ready();
    await panel().getByText('ตรวจผลรายนิสิต (3 รายการ)', { exact: true }).click();
    await panel().getByRole('button', { name: 'ตรวจผล demo-outcome-1', exact: true }).click();
    assert.match(await editor.innerText(), /Synthetic result saved in browser check/);
    assert.match(await editor.innerText(), /จับคู่แล้ว: ใช่ · นิสิตตอบรับแล้ว: ใช่ · เข้าฝึกจริงแล้ว: ยังไม่ทราบ/);
    await go('/internship?year=2568&term=2&q=Mock%20Cloud&round=1'); await ready(); assert.equal(await stage('accepted'), '0');
    await go('/cooperative?year=2569&term=1&q=Mock%20Cloud&round=1'); await ready(); assert.equal(await stage('accepted'), '0');
    await go(cloud + '&round=1'); await ready(); assert.equal(await stage('accepted'), '1'); assert.equal(await stage('started'), 'ยังไม่มีข้อมูล');
    const key = 'nextlink.dashboard.demo.user-901.nextlink.internship.outcomes.v1';
    const previous = await page.evaluate(key => { const old = localStorage.getItem(key); localStorage.setItem(key, '{broken'); return old; }, key);
    assert.ok(previous, 'outcome edits have their own account and period storage');
    try { await page.reload(); await panel().locator('p.dataset-warning').waitFor(); assert.equal(await stage('started'), 'อ่านข้อมูลไม่ได้'); }
    finally { await page.evaluate(({ key, previous }) => localStorage.setItem(key, previous), { key, previous }); }
  });
  await check('latest company case appears in search results and refreshes across tabs without false empty claims', async () => {
    await go(cloud); await ready();
    const preview = () => page.locator('#dashboard-directory .company-case-preview').filter({ visible: true });
    await preview().getByText('ติดตามกำหนดโอนเบี้ยเลี้ยง (ตัวอย่าง)', { exact: true }).waitFor();
    const other = await context.newPage();
    try {
      await other.goto(base + '/dashboard/companies?company=partner-cloud'); await other.locator('.app-shell[data-ready="true"]').waitFor();
      await other.getByRole('button', { name: 'แก้ไขผู้ติดต่อและ Case', exact: true }).click();
      await other.getByLabel('หัวข้อ Case 2', { exact: true }).fill('Case ล่าสุดจากอีกแท็บ');
      await other.getByRole('button', { name: 'บันทึกผู้ติดต่อและ Case', exact: true }).click();
      await preview().getByText('Case ล่าสุดจากอีกแท็บ', { exact: true }).waitFor();
    } finally { await other.close(); }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.match(await preview().innerText(), /Case ล่าสุดจากอีกแท็บ/);
    assert.match(await preview().innerText(), /ทุกปีและทุกงาน/);
    const key = 'nextlink.dashboard.demo.user-901.company-directory.v1';
    const previous = await page.evaluate(key => { const old = localStorage.getItem(key); localStorage.setItem(key, '{broken'); return old; }, key);
    try {
      await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
      await preview().getByText('อ่าน Case ไม่ได้ กรุณาตรวจทะเบียนบริษัท', { exact: true }).waitFor();
      assert.doesNotMatch(await preview().innerText(), /ยังไม่มี Case ที่บันทึก/);
    } finally { await page.evaluate(({ key, previous }) => previous === null ? localStorage.removeItem(key) : localStorage.setItem(key, previous), { key, previous }); await page.setViewportSize({ width: 1440, height: 1000 }); }
  });
  await check('outcome breakdown and editor fit both themes on mobile and desktop', async () => {
    for (const value of ['classic', 'dark']) {
      await go(cloud); await ready(); await theme(value);
      await panel().getByText('ดูบริษัทและตำแหน่งที่เข้าฝึก (1 บริษัท)', { exact: true }).click();
      await panel().getByText('ตรวจผลรายนิสิต (3 รายการ)', { exact: true }).click();
      await panel().getByRole('button', { name: 'ตรวจผล demo-outcome-1', exact: true }).click();
      await page.getByRole('article', { name: 'บันทึกผลรายนิสิต', exact: true }).getByRole('button', { name: 'แก้ไขสถานะ', exact: true }).click();
      for (const width of [320, 390, 820, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'outcomes fit ' + value + ' ' + width);
      }
      await panel().screenshot({ path: output + '/internship-outcomes-' + value + '.png' });
      await page.getByRole('article', { name: 'บันทึกผลรายนิสิต', exact: true }).getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    }
  });
}
