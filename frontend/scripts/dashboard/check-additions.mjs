import assert from 'node:assert/strict';
import { checkInternshipOutcomes } from './check-internship-outcomes.mjs';

// Runs with the existing isolated staff/API fixture, never against the live backend.
export async function checkAdditions({ page, context, base, go, check, theme, output }) {
  const dialog = () => page.locator('dialog[open]:not([data-dialog-status])');
  const openFirst = async () => page.locator('#dashboard-directory .row-action').filter({ visible: true }).first().click();
  await check('shared contacts, yearly cases and elective contact details persist across module visits', async () => {
    await go('/companies?company=partner-cloud');
    await page.getByRole('button', { name: 'แก้ไขผู้ติดต่อและ Case', exact: true }).click();
    await page.getByLabel('ชื่อผู้ติดต่อ 1', { exact: true }).fill('Shared synthetic coordinator');
    await page.getByLabel('เบอร์โทรผู้ติดต่อ 1', { exact: true }).fill('02-000-1234');
    await page.getByRole('button', { name: 'เพิ่มผู้ประสานงาน', exact: true }).click();
    await page.getByLabel('ชื่อผู้ติดต่อ 3', { exact: true }).fill('Activity synthetic coordinator');
    await page.getByRole('button', { name: 'เพิ่ม Case', exact: true }).click();
    await page.getByLabel('หัวข้อ Case 3', { exact: true }).fill('ย้อนหลังสำหรับทดสอบ');
    await page.getByLabel('วันที่เกิดเหตุ (ค.ศ.) 3', { exact: true }).fill('2023-10-12');
    await page.getByLabel('ปีการศึกษา Case 3', { exact: true }).fill('2566');
    await page.getByRole('button', { name: 'บันทึกผู้ติดต่อและ Case', exact: true }).click();
    await page.getByRole('button', { name: 'แก้ไขผู้ติดต่อและ Case', exact: true }).waitFor();
    await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
    assert.match(await page.locator('main').innerText(), /Shared synthetic coordinator/);
    await page.getByRole('combobox', { name: 'ปีของประวัติ', exact: true }).selectOption('2566');
    assert.match(await page.locator('main').innerText(), /ย้อนหลังสำหรับทดสอบ/);
    assert.doesNotMatch(await page.locator('main').innerText(), /ติดตามกำหนดโอนเบี้ยเลี้ยง/);
    await go('/mou?q=เมฆา'); await openFirst();
    await dialog().getByText('Shared synthetic coordinator', { exact: true }).waitFor();
    assert.match(await dialog().innerText(), /Shared synthetic coordinator/);
    assert.match(await dialog().innerText(), /02-000-1234/);
    // Friday now selects from the central API directory. Browser-only contacts
    // from the remaining demo modules must not leak into that live editor.
    await go('/friday-activities');
    await page.getByRole('button', { name: 'สร้างกิจกรรม', exact: true }).click();
    await dialog().getByRole('checkbox', { name: 'Fixture Cloud Company', exact: true }).check();
    await dialog().getByRole('checkbox', { name: /Fixture central coordinator/ }).waitFor();
    assert.equal(await dialog().getByRole('checkbox', { name: /Activity synthetic coordinator|Shared synthetic coordinator/ }).count(), 0);
    await dialog().getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
    await go('/electives'); await openFirst();
    await dialog().getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    await dialog().getByLabel('เบอร์โทรผู้ประสานงาน', { exact: true }).fill('02-000-5678');
    await dialog().getByLabel('LINE ผู้ประสานงาน', { exact: true }).fill('demo_elective');
    await dialog().getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
    await dialog().getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).waitFor();
    await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor(); await openFirst();
    assert.match(await dialog().innerText(), /02-000-5678/); assert.match(await dialog().innerText(), /demo_elective/);
  });
  await check('MOU history updates from another tab and partial demo history stays explicit', async () => {
    await go('/companies?company=partner-cloud');
    await page.getByRole('combobox', { name: 'งานที่เกี่ยวข้อง', exact: true }).selectOption('mou');
    const history = page.locator('section').filter({ has: page.getByRole('heading', { name: /^ประวัติความร่วมมือข้ามเทอม/ }) });
    const link = history.getByRole('link').first();
    const href = await link.getAttribute('href');
    const name = await link.innerText();
    const other = await context.newPage();
    try {
      await other.goto(base + href); await other.locator('.app-shell[data-ready="true"]').waitFor();
      const row = other.locator('#dashboard-directory tbody tr').filter({ hasText: name }).first();
      await row.locator('select[aria-label^="อัปเดตสถานะเอกสาร MOU"]').selectOption('รอลงนาม');
      await history.locator(`a[href="${href}"]`).getByText('รอลงนาม', { exact: true }).waitFor();
    } finally { await other.close(); }
    const key = 'nextlink.dashboard.demo.user-901.nextlink.capstone.v2.2569.1';
    const previous = await page.evaluate(key => { const old = localStorage.getItem(key); localStorage.setItem(key, '{broken'); return old; }, key);
    try {
      await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
      assert.match(await page.locator('main').innerText(), /อ่านข้อมูลบางโมดูลไม่ได้/);
    } finally { await page.evaluate(({ key, previous }) => previous === null ? localStorage.removeItem(key) : localStorage.setItem(key, previous), { key, previous }); }
  });
  await check('Capstone milestones can be added, changed, reloaded and removed with history', async () => {
    await go('/capstone?q=CAP-001'); await openFirst();
    await dialog().getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    await dialog().getByRole('button', { name: 'กลุ่มและอันดับ', exact: true }).click();
    await dialog().getByRole('combobox', { name: 'สถานะ Milestone 1', exact: true }).selectOption('เสร็จแล้ว');
    await dialog().getByRole('button', { name: 'เพิ่ม Milestone', exact: true }).click();
    await dialog().getByLabel('ชื่อ Milestone 2', { exact: true }).fill('Milestone browser check');
    await dialog().getByLabel('วันที่ Milestone 2 (ค.ศ.)', { exact: true }).fill('2026-10-12');
    await dialog().getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
    await dialog().getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).waitFor();
    await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor(); await openFirst();
    await dialog().getByRole('button', { name: 'กลุ่มและอันดับ', exact: true }).click();
    assert.match(await dialog().innerText(), /Milestone browser check/);
    await dialog().getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    await dialog().getByRole('button', { name: 'ลบ Milestone 2', exact: true }).click();
    await dialog().getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
    await dialog().getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).waitFor();
    assert.doesNotMatch(await dialog().innerText(), /Milestone browser check/);
    await dialog().getByRole('button', { name: 'บันทึกและประวัติ', exact: true }).click();
    assert.match(await dialog().innerText(), /Milestone browser check/);
    assert.match(await dialog().innerText(), /ไม่มีรายการ/);
  });
  await check('internship historical ranks and cohort filters remain visible and survive reload', async () => {
    await go('/internship?year=2566&term=summer');
    assert.match(await page.locator('.rank-legend').first().innerText(), /อันดับ 10/);
    await page.getByRole('combobox', { name: 'ชั้นปีนิสิต', exact: true }).selectOption('1');
    await page.getByRole('combobox', { name: 'รอบสมัคร', exact: true }).selectOption('2');
    await page.waitForURL('**/*round=2*');
    await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'ชั้นปีนิสิต', exact: true }).inputValue(), '1');
    assert.equal(await page.getByRole('combobox', { name: 'รอบสมัคร', exact: true }).inputValue(), '2');
    await openFirst();
    assert.equal(await dialog().getByRole('button', { name: 'บันทึกจำนวนที่รับ', exact: true }).isDisabled(), true);
  });
  await checkInternshipOutcomes({ page, context, base, go, check, theme, output });
  await check('company overview and editor fit light, dark and narrow screens', async () => {
    for (const value of ['classic', 'dark']) {
      await go('/companies?company=partner-cloud'); await theme(value);
      assert.equal(await page.getByRole('button', { name: 'คืนค่าตั้งต้น', exact: true }).evaluate(el => getComputedStyle(el).color), await page.locator('.nextlink-dashboard').evaluate(el => getComputedStyle(el).color));
      await page.screenshot({ path: `${output}/companies-${value}.png`, fullPage: true });
      await page.getByRole('button', { name: 'แก้ไขผู้ติดต่อและ Case', exact: true }).click();
      for (const width of [320, 390, 820]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `company editor fits ${value} ${width}`);
      }
      await page.screenshot({ path: `${output}/company-editor-${value}.png`, fullPage: true });
      await page.getByRole('button', { name: 'ยกเลิกการแก้ไข', exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await go('');
  });
}
