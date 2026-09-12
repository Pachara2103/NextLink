import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { once } from 'node:events';

const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', NODE_ENV: 'production', API_ORIGIN: 'http://127.0.0.1:18999' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', (data) => { logs += data; }); server.stderr.on('data', (data) => { logs += data; });
let browser;
const results = [];
const errors = [], failedAssets = [];
const key = 'nextlink.plan.v3.2569-1';
const courseId = 'plan-21105801';
await mkdir('output/browser', { recursive: true });
const check = async (name, fn) => { await fn(); results.push(name); console.log('  ✓ ' + name); };
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(base)).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'production server started');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const watch = (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.url().includes('/_next/') && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`); });
    page.on('dialog', (dialog) => dialog.accept());
  };
  const user = { id: 1, username: 'planner-fixture', displayName: 'ผู้ทดสอบ' };
  const unexpectedApi = [];
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body;
    if (path === '/api/v1/auth/me') body = user;
    else if (path === '/api/v1/auth/login' && method === 'POST') body = { accessToken: 'local-test-only', tokenType: 'bearer', user };
    else if (path === '/api/v1/health') body = { status: 'ok', models: true, ready: true, bootId: 'fixture', startedAt: '2026-09-12T00:00:00Z' };
    else if (method === 'GET' && ['/api/v1/line/groups', '/api/v1/companies', '/api/v1/contacts', '/api/v1/employees', '/api/v1/notes', '/api/v1/line/update_logs', '/api/v1/chat_histories'].includes(path)) body = { items: [] };
    else { unexpectedApi.push(`${method} ${path}`); return route.fulfill({ status: 500, json: { detail: 'Unexpected test request' } }); }
    await route.fulfill({ json: body });
  });
  const page = await context.newPage(); watch(page);
  page.setDefaultTimeout(15000);
  const chooseTheme = async (value) => {
    await page.getByRole('button', { name: value === 'classic' ? 'สีดั้งเดิม' : 'โหมดมืด', exact: true }).filter({ visible: true }).click();
    await page.waitForFunction(value => document.documentElement.dataset.theme === value, value);
  };
  const themeIs = async (value) => assert.equal(await page.locator('html').getAttribute('data-theme'), value);
  await check('planner deep links require sign-in and return to the requested page', async () => {
    await page.goto(base + '/elective-plan/courses/list?view=checklist');
    await page.waitForURL('**/login?next=*');
    assert.equal(await page.locator('.elective-planner').count(), 0);
    await chooseTheme('classic');
    await page.reload(); await page.locator('input[name=username]').waitFor();
    await themeIs('classic');
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(246, 247, 251)');
    await page.screenshot({ path: 'output/browser/login-classic.png', fullPage: true });
    await chooseTheme('dark');
    await page.screenshot({ path: 'output/browser/login-dark.png', fullPage: true });
    await page.locator('input[name=username]').fill('planner-fixture');
    await page.locator('input[name=password]').fill('local-test-only');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await page.waitForURL(base + '/elective-plan/courses/list?view=checklist');
    await page.locator('select.checklist-select').first().waitFor();
    await themeIs('dark');
  });
  const go = async (path) => { await page.goto(base + '/elective-plan' + (path === '/' ? '' : path)); await page.getByRole('button', { name: 'สำรองแผน JSON', exact: true }).waitFor(); };
  const read = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  const seed = async (document) => { await page.evaluate(({ key, document }) => { localStorage.removeItem(key); localStorage.setItem(key, JSON.stringify(document)); }, { key, document }); };
  await go('/');
  await check('integrated planner hydrates and loads its scheduler worker', async () => {
    await page.getByRole('button', { name: 'จัดตารางอัตโนมัติ', exact: true }).click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) || '{}').assignments?.length > 0, key);
    assert.ok((await read()).assignments.length > 0);
    assert.deepEqual(failedAssets, []);
  });
  await check('active mobile navigation remains visible after resizing from desktop', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const nav = document.querySelector('nav[aria-label="เมนูหลัก"]');
      const current = nav?.querySelector('[aria-current="page"]');
      if (!nav || !current) return false;
      const a = nav.getBoundingClientRect(), b = current.getBoundingClientRect();
      return b.left >= a.left && b.right <= a.right;
    }, undefined, { timeout: 2000 });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  const scheduled = await read();
  await check('both themes reach the whole console, planner dialogs and cross-tab preferences', async () => {
    for (const theme of ['classic', 'dark']) {
      await chooseTheme(theme);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `output/browser/planner-${theme}.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'planner fits the sidebar layout');
      const surface = theme === 'classic' ? 'rgb(255, 255, 255)' : 'rgb(16, 20, 24)';
      assert.equal(await page.locator('.kpi-card').first().evaluate(el => getComputedStyle(el).backgroundColor), surface);
      await page.locator('aside').getByRole('button', { name: 'โน้ตบันทึกข้อมูล', exact: true }).click();
      await page.waitForURL(base + '/?panel=notes');
      await page.getByRole('heading', { name: /โน้ต/ }).first().waitFor();
      assert.equal(await page.locator('.elective-planner').count(), 0);
      await themeIs(theme);
      await page.screenshot({ path: `output/browser/console-${theme}.png`, fullPage: true });
      for (const name of ['สรุปข้อมูลจากไลน์', 'กลุ่มไลน์และบริษัท', 'ผู้ติดต่อและบุคคลในบริษัท', 'โน้ตบันทึกข้อมูล', 'คุณขวัญใจ']) {
        const nav = page.locator('aside').getByRole('button', { name, exact: true });
        await nav.click();
        assert.equal(await nav.getAttribute('aria-current'), 'page');
        await themeIs(theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await page.screenshot({ path: `output/browser/agent-${theme}.png` });
      await page.getByRole('button', { name: 'ตั้งค่าบัญชี', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.screenshot({ path: `output/browser/profile-${theme}.png` });
      await page.keyboard.press('Escape');
      await page.locator('aside').getByRole('link', { name: 'จัดตารางวิชาเลือก', exact: true }).click();
      await page.locator('.matrix-chip').first().waitFor();
      assert.deepEqual((await read()).assignments, scheduled.assignments);
      await page.getByRole('link', { name: 'ห้องเรียน', exact: true }).click();
      await page.getByRole('button', { name: '＋ เพิ่มห้องเรียน', exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), surface);
      const rect = await dialog.boundingBox();
      assert.ok(rect.x > 10 && rect.y > 0, 'native planner dialog is centered');
      await page.screenshot({ path: `output/browser/room-dialog-${theme}.png` });
      await page.getByRole('button', { name: 'ปิดหน้าต่าง', exact: true }).click();
      await page.getByRole('link', { name: 'ภาพรวมแผน', exact: true }).click();
    }
    const other = await context.newPage(); watch(other); await other.goto(base + '/');
    await other.locator('aside').waitFor();
    await chooseTheme('classic');
    await other.waitForFunction(() => document.documentElement.dataset.theme === 'classic');
    await other.reload(); await other.locator('aside').waitFor();
    assert.equal(await other.locator('html').getAttribute('data-theme'), 'classic');
    await other.close();
  });
  await check('duplicate session move is refused without changing ids', async () => {
    const title = 'System Design for Software Development';
    const cards = page.locator('.matrix-chip').filter({ hasText: title });
    await cards.first().click(); await cards.nth(1).click();
    await page.getByRole('region', { name: 'การบันทึกแผน' }).getByText('วิชานี้มีคาบในช่วงปลายทางแล้ว กรุณาเลือกคาบอื่น', { exact: true }).waitFor();
    assert.deepEqual((await read()).assignments, scheduled.assignments);
  });
  await go('/');
  await check('onsite course cannot be moved into the online column', async () => {
    const title = 'SW Dev for CMMI Standard';
    const item = scheduled.assignments.find((item) => item.courseId === courseId);
    const days = { MON: 'จันทร์', TUE: 'อังคาร', WED: 'พุธ', THU: 'พฤหัสบดี', FRI: 'ศุกร์', SAT: 'เสาร์' };
    const periods = { AM: 'เช้า', PM: 'บ่าย', EVE: 'เย็น' };
    const [day, period] = item.slotId.split('_');
    await page.locator('.matrix-chip').filter({ hasText: title }).click();
    await page.getByRole('button', { name: `วาง ${title} ที่ ออนไลน์ ${days[day]}${periods[period]}`, exact: true }).click();
    await page.getByRole('region', { name: 'การบันทึกแผน' }).getByText('วิชาในห้องเรียนหรือไฮบริดต้องมีห้องเรียน กรุณาเลือกคอลัมน์ห้อง', { exact: true }).waitFor();
    assert.deepEqual((await read()).assignments, scheduled.assignments);
  });
  await check('invalid URL filters are sanitized without crashing', async () => {
    await go('/courses/list?day=SUNDAY&period=INVALID');
    await page.locator('tbody tr').first().waitFor();
    assert.equal(new URL(page.url()).searchParams.has('period'), false);
    assert.equal(new URL(page.url()).searchParams.has('day'), false);
    assert.equal(await page.getByRole('heading', { name: 'โหลดข้อมูลไม่สำเร็จ' }).count(), 0);
    await go('/courses?period=INVALID');
    await page.getByRole('heading', { name: 'วิชาและช่วงที่สะดวก', exact: true }).waitFor();
  });
  await check('Back and Forward restore both URL filters and visible controls', async () => {
    await go('/courses/list?day=MON&period=AM');
    await page.getByRole('combobox', { name: /วันที่สะดวก/ }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: /วันที่สะดวก/ }).inputValue(), 'MON');
    await page.evaluate(() => { history.pushState(history.state, '', '?day=TUE&period=PM'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForFunction(() => location.search.includes('day=TUE'));
    assert.equal(await page.getByRole('combobox', { name: /คาบที่สะดวก/ }).inputValue(), 'PM');
    await page.goBack();
    await page.waitForFunction(() => location.search.includes('day=MON'));
    assert.equal(await page.getByRole('combobox', { name: /วันที่สะดวก/ }).inputValue(), 'MON');
    assert.equal(await page.getByRole('combobox', { name: /คาบที่สะดวก/ }).inputValue(), 'AM');
    await page.goForward();
    await page.waitForFunction(() => location.search.includes('day=TUE'));
    assert.equal(await page.getByRole('combobox', { name: /วันที่สะดวก/ }).inputValue(), 'TUE');
  });
  await check('legacy onsite sessions without rooms are labelled honestly in UI and Excel', async () => {
    await seed({ ...scheduled, assignments: scheduled.assignments.map((item) => item.courseId === courseId ? { ...item, roomId: null } : item) });
    await go('/courses/list?q=SW%20Dev%20for%20CMMI%20Standard');
    await page.locator('.room-tag').getByText('ยังไม่มีห้อง', { exact: true }).waitFor();
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'ดาวน์โหลด Excel', exact: true }).click();
    await (await pending).saveAs('output/browser/missing-room.xlsx');
    assert.ok((await readFile('output/browser/missing-room.xlsx')).toString().includes('ยังไม่มีห้อง'));
  });
  const blank = { ...scheduled, assignments: [], checklists: {}, revision: 0, editedAt: null };
  await seed(blank);
  await check('checklist ignores hidden placement filter and exports all matching rows', async () => {
    await go('/courses/list?placement=placed&view=checklist');
    await page.locator('select.checklist-select').first().waitFor();
    assert.equal(await page.locator('tbody tr').count(), 10);
    assert.equal(new URL(page.url()).searchParams.has('placement'), false);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ดาวน์โหลด Excel', exact: true }).click();
    const file = await download; await file.saveAs('output/browser/checklist.xlsx');
    const bytes = await readFile('output/browser/checklist.xlsx');
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    assert.ok(bytes.toString().includes('SW Dev for CMMI Standard'));
  });
  await check('two tabs preserve each other\'s edits and update their visible fields', async () => {
    const other = await context.newPage(); watch(other); await other.goto(base + '/elective-plan/courses/list?view=checklist');
    await other.locator('select.checklist-select').first().waitFor();
    await Promise.all([
      page.locator('tbody tr').first().locator('select.checklist-select').nth(0).selectOption('RECEIVED'),
      other.locator('tbody tr').first().locator('select.checklist-select').nth(1).selectOption('RECEIVED'),
    ]);
    await page.waitForFunction((key) => { const c = JSON.parse(localStorage.getItem(key)).checklists['plan-21105801']; return c?.invitationLetter === 'RECEIVED' && c?.teachingHoursLetter === 'RECEIVED'; }, key);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr:first-child select')[1]?.value === 'RECEIVED');
    await other.waitForFunction(() => document.querySelector('tbody tr:first-child select')?.value === 'RECEIVED');
    await other.close();
  });
  await check('MCV code remains editable until blur while incomplete filter is active', async () => {
    const completedExceptCode = { invitationLetter: 'RECEIVED', teachingHoursLetter: 'RECEIVED', mcvInstructorRequest: 'DONE', mentorAdded: 'DONE', guestLecturerAdded: 'DONE', studentsAdded: 'DONE', mcvJoinCode: '' };
    await seed({ ...blank, checklists: { [courseId]: completedExceptCode } });
    await go('/courses/list?view=checklist&done=incomplete');
    const code = page.getByRole('textbox', { name: 'รหัส Join MCV สำหรับนิสิต — SW Dev for CMMI Standard', exact: true });
    await code.pressSequentially('ABC123', { delay: 30 });
    assert.equal(await code.inputValue(), 'ABC123');
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).checklists['plan-21105801']?.mcvJoinCode === 'ABC123', key);
    await code.press('Tab');
    await code.waitFor({ state: 'detached' });
    await page.reload();
    assert.equal((await read()).checklists[courseId].mcvJoinCode, 'ABC123');
  });
  await check('quota failure shows unsaved status and backup; retry saves the retained draft', async () => {
    await seed(blank); await go('/');
    await page.evaluate(() => { globalThis.restoreStorage = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('Simulated quota', 'QuotaExceededError'); }; });
    await page.getByRole('button', { name: 'จัดตารางอัตโนมัติ', exact: true }).click();
    await page.getByText('แผนยังบันทึกไม่สำเร็จ', { exact: false }).waitFor();
    assert.equal((await read()).assignments.length, 0);
    assert.ok(await page.locator('.matrix-chip').count() > 0);
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'สำรองแผน JSON', exact: true }).click();
    await (await pending).saveAs('output/browser/unsaved-plan.json');
    assert.ok(JSON.parse(await readFile('output/browser/unsaved-plan.json', 'utf8')).assignments.length > 0);
    await page.locator('aside').getByRole('button', { name: 'กลุ่มไลน์และบริษัท', exact: true }).click();
    await page.waitForURL(base + '/?panel=groups');
    await page.locator('aside').getByRole('link', { name: 'จัดตารางวิชาเลือก', exact: true }).click();
    await page.getByText('แผนยังบันทึกไม่สำเร็จ', { exact: false }).waitFor();
    assert.ok(await page.locator('.matrix-chip').count() > 0, 'unsaved draft survives leaving the planner');
    await page.evaluate(() => { Storage.prototype.setItem = globalThis.restoreStorage; });
    await page.getByRole('button', { name: 'ลองบันทึกอีกครั้ง', exact: true }).click();
    await page.getByText('บันทึกแล้วในเบราว์เซอร์นี้', { exact: false }).waitFor();
    assert.ok((await read()).assignments.length > 0);
  });
  await check('corrupt storage can be backed up and recovered from the page', async () => {
    await page.evaluate((key) => localStorage.setItem(key, '{ corrupted'), key); await page.reload();
    await page.getByRole('button', { name: 'สำรองและเริ่มแผนใหม่', exact: true }).waitFor();
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'สำรองและเริ่มแผนใหม่', exact: true }).click();
    await (await pending).saveAs('output/browser/corrupt-plan.json');
    assert.equal(await readFile('output/browser/corrupt-plan.json', 'utf8'), '{ corrupted');
    await page.getByRole('button', { name: 'จัดตารางอัตโนมัติ', exact: true }).waitFor();
    assert.deepEqual((await read()).assignments, []);
  });
  await check('deleting a room from detail can be undone after client navigation', async () => {
    await seed(scheduled); const target = scheduled.assignments.find((item) => item.roomId);
    await go('/rooms/' + target.roomId);
    await page.getByRole('button', { name: 'แก้ไขห้องนี้', exact: true }).click();
    await page.getByRole('button', { name: 'ลบห้องนี้', exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันลบ', exact: true }).click();
    await page.waitForURL(base + '/elective-plan/rooms');
    assert.equal((await read()).assignments.some((item) => item.roomId === target.roomId), false);
    const undo = page.getByRole('button', { name: 'เลิกทำรายการล่าสุด', exact: true });
    await undo.click();
    await page.waitForFunction(({ key, roomId }) => JSON.parse(localStorage.getItem(key)).assignments.some((item) => item.roomId === roomId), { key, roomId: target.roomId });
    assert.deepEqual((await read()).assignments, scheduled.assignments);
  });
  await check('worker cancellation keeps the prior plan intact', async () => {
    await go('/');
    const before = await read();
    await page.evaluate(() => {
      const Original = Worker;
      globalThis.Worker = class extends Original { postMessage(...args) { setTimeout(() => super.postMessage(...args), 1500); } };
    });
    await page.getByRole('button', { name: 'จัดตารางอัตโนมัติ', exact: true }).click();
    await page.getByRole('button', { name: 'ยกเลิกการจัดตาราง', exact: true }).click();
    await page.getByRole('region', { name: 'การบันทึกแผน' }).getByText('ยกเลิกการจัดตารางแล้ว แผนเดิมยังอยู่', { exact: true }).waitFor();
    assert.deepEqual(await read(), before);
    await page.reload();
  });
  await check('valid backup import and reset can both be undone', async () => {
    await go('/courses/list?view=checklist');
    const before = await read();
    const imported = { ...before, checklists: { [courseId]: { mcvJoinCode: 'IMPORTED' } } };
    await page.locator('input[type=file]').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).checklists['plan-21105801']?.mcvJoinCode === 'IMPORTED', key);
    await page.getByRole('button', { name: 'เลิกทำรายการล่าสุด', exact: true }).click();
    await page.waitForFunction((key) => !JSON.parse(localStorage.getItem(key)).checklists['plan-21105801']?.mcvJoinCode, key);
    assert.deepEqual((await read()).assignments, before.assignments);
    await page.getByRole('button', { name: 'คืนค่าเริ่มต้น', exact: true }).click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).assignments.length === 0, key);
    await page.getByRole('button', { name: 'เลิกทำรายการล่าสุด', exact: true }).click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).assignments.length > 0, key);
    assert.deepEqual((await read()).assignments, before.assignments);
  });
  await check('unreadable backup files preserve the current plan and report a recoverable error', async () => {
    await go('/');
    const before = await read();
    await page.evaluate(() => { globalThis.originalFileText = File.prototype.text; File.prototype.text = async function () { throw new DOMException('Unreadable fixture', 'NotReadableError'); }; });
    await page.locator('input[type=file]').setInputFiles({ name: 'unreadable.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.getByRole('region', { name: 'การบันทึกแผน' }).getByText('อ่านไฟล์แผนไม่ได้ กรุณาเลือกไฟล์ใหม่ แผนปัจจุบันยังอยู่', { exact: true }).waitFor();
    assert.deepEqual(await read(), before);
    await page.evaluate(() => { File.prototype.text = globalThis.originalFileText; });
    await page.locator('input[type=file]').setInputFiles({ name: 'retry.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).revision > 0 && !document.querySelector('.plan-storage-error'), key);
    assert.deepEqual((await read()).assignments, before.assignments);
  });
  await check('archive export, mobile layout and all production assets remain usable' , async () => {
    await go('/courses/list?term=2568-2');
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'ดาวน์โหลด Excel', exact: true }).click();
    await (await pending).saveAs('output/browser/archive.xlsx');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/browser/mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.setViewportSize({ width: 1440, height: 1000 }); await go('/');
    await page.screenshot({ path: 'output/browser/overview.png', fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
  });
  await check('mobile theme controls and navigation work in both palettes', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['dark', 'classic']) {
      await chooseTheme(theme);
      await page.getByRole('navigation', { name: 'เมนูหลัก', exact: true }).getByRole('button', { name: 'โน้ต', exact: true }).click();
      await page.waitForURL(base + '/?panel=notes');
      await themeIs(theme);
      await page.getByRole('navigation', { name: 'เมนูหลัก', exact: true }).getByRole('link', { name: 'จัดตารางวิชาเลือก', exact: true }).click();
      await page.getByRole('button', { name: 'สำรองแผน JSON', exact: true }).waitFor();
      await page.screenshot({ path: `output/browser/mobile-${theme}.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await page.reload();
      await page.getByRole('button', { name: 'สำรองแผน JSON', exact: true }).waitFor();
      await themeIs(theme);
      const activeNav = page.getByRole('navigation', { name: 'เมนูหลัก', exact: true }).getByRole('link', { name: 'จัดตารางวิชาเลือก', exact: true });
      const navBox = await activeNav.boundingBox();
      assert.ok(navBox.x >= 0 && navBox.x + navBox.width <= 390, 'active mobile destination is visible after reload');
    }
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []); assert.deepEqual(unexpectedApi, []);
  });
  await check('theme works with blocked localStorage and unsafe login return paths stay local', async () => {
    await page.goto(base + '/login?next=https%3A%2F%2Fexample.com');
    await page.waitForURL(base + '/');
    await page.evaluate(() => { globalThis.themeSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('Blocked', 'SecurityError'); }; });
    await chooseTheme('dark');
    await page.evaluate(() => { Storage.prototype.setItem = globalThis.themeSetItem; });
    await page.reload(); await page.getByRole('navigation', { name: 'เมนูหลัก', exact: true }).waitFor();
    await themeIs('dark');
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedApi, []);
  });
  await check('contact action menus close during a request and stay closed when it fails', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const employee = { id: 901, companyId: 902, status: 'pending', nameTh: 'ผู้ประสานงานทดสอบ', nameEn: null, nickname: null, jobTitle: null, relevant: null, email: null, phone: null, createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z' };
    const group = { groupId: 'fixture-group', displayName: 'กลุ่มทดสอบ', companyId: 902, companyTh: 'บริษัททดสอบ', companyEn: null, aliases: [], isLinked: true, pictureUrl: null, createdAt: employee.createdAt, updatedAt: employee.updatedAt };
    await page.route('**/api/v1/employees', route => route.fulfill({ json: { items: [employee] } }));
    await page.route('**/api/v1/line/groups', route => route.fulfill({ json: { items: [group] } }));
    let reply;
    const pending = new Promise(resolve => { reply = resolve; });
    await page.route('**/api/v1/employees/901/approve', async route => {
      assert.equal(route.request().method(), 'POST');
      await pending;
      await route.fulfill({ status: 409, json: { detail: 'Simulated approval conflict' } });
    });
    await page.goto(base + '/?panel=contacts');
    await page.getByRole('button', { name: 'ดูข้อมูลผู้ประสานงาน', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'ตัวเลือกเพิ่มเติมของ ผู้ประสานงานทดสอบ', exact: true });
    await trigger.click(); await page.getByRole('menu').waitFor();
    // Keyboard activation does not fire the menu's outside-pointer handler.
    await page.getByRole('button', { name: 'ยืนยันและบันทึก', exact: true }).press('Enter');
    await page.waitForFunction(() => document.querySelector('button[aria-haspopup="menu"]')?.disabled === true);
    assert.equal(await page.getByRole('menu').count(), 0);
    reply();
    await page.waitForFunction(() => document.querySelector('button[aria-haspopup="menu"]')?.disabled === false);
    assert.equal(await page.getByRole('menu').count(), 0);
    await trigger.click(); await page.getByRole('menu').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('menu').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedApi, []);
  });
  await check('upstream year/semester notes can be filtered and edited in both website themes', async () => {
    const year = new Date().getFullYear() - 1;
    const group = { groupId: 'notes-fixture', displayName: 'กลุ่มทดสอบโน้ต', companyId: 920,
      companyTh: 'บริษัททดสอบโน้ต', companyEn: null, aliases: [], isLinked: true, pictureUrl: null };
    let note = { id: 930, companyId: 920, employeeId: null, companyTh: group.companyTh,
      companyEn: null, aliases: [], type: 'elective', sentiment: 'neutral', source: 'external',
      content: 'โน้ตทดสอบ year semester', year, semester: 2,
      createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z' };
    const updates = [];
    await page.route('**/api/v1/line/groups', route => route.fulfill({ json: { items: [group] } }));
    await page.route('**/api/v1/notes', route => route.fulfill({ json: { items: [note] } }));
    await page.route('**/api/v1/notes/930', async route => {
      assert.equal(route.request().method(), 'PUT');
      const payload = route.request().postDataJSON();
      assert.equal(payload.year, year - 1);
      assert.equal(payload.semester, 3);
      assert.equal('academicYear' in payload || 'academic_year' in payload || 'term' in payload, false);
      updates.push(payload);
      note = { ...note, ...payload };
      await route.fulfill({ json: { status: 'success' } });
    });
    await page.goto(base + '/?panel=notes');
    const yearFilter = page.getByRole('combobox', { name: 'กรองตามปีการศึกษา', exact: true });
    const semesterFilter = page.getByRole('combobox', { name: 'กรองตามภาคเรียน', exact: true });
    await yearFilter.selectOption(String(year));
    await semesterFilter.selectOption('2');
    await page.getByText(note.content, { exact: true }).waitFor();
    for (const theme of ['classic', 'dark']) {
      await chooseTheme(theme);
      const card = page.locator('article').filter({ hasText: note.content });
      await page.waitForFunction(({ content, color }) => [...document.querySelectorAll('article')]
        .some(el => el.textContent.includes(content) && getComputedStyle(el).backgroundColor === color),
      { content: note.content, color: theme === 'classic' ? 'rgb(255, 255, 255)' : 'rgb(16, 20, 24)' });
      assert.equal(await card.evaluate(el => getComputedStyle(el).backgroundColor),
        theme === 'classic' ? 'rgb(255, 255, 255)' : 'rgb(16, 20, 24)');
      await card.getByRole('button', { name: 'แก้ไข', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const yearField = dialog.getByRole('combobox', { name: 'ปีการศึกษา', exact: true });
      const semesterField = dialog.getByRole('combobox', { name: 'ภาคเรียน', exact: true });
      assert.equal(await yearField.inputValue(), String(note.year));
      assert.equal(await semesterField.inputValue(), String(note.semester));
      await yearField.selectOption(String(year - 1));
      await semesterField.selectOption('3');
      await dialog.getByRole('textbox', { name: 'เนื้อหาโน้ต', exact: false }).fill(`แก้ไขโน้ต ${theme}`);
      await dialog.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      await yearFilter.selectOption(String(year - 1));
      await semesterFilter.selectOption('3');
      await page.getByText(`แก้ไขโน้ต ${theme}`, { exact: true }).waitFor();
      await page.screenshot({ path: `output/browser/notes-${theme}.png`, fullPage: true });
    }
    assert.equal(updates.length, 2);
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedApi, []);
  });
  await writeFile('output/browser/results.json'   , JSON.stringify({ passed: results.length, results, errors, failedAssets }, null, 2));
  await rm('output/browser/failure.json', { force: true });
  console.log(`browser: ok (${results.length} production regression checks)`);
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) await page.screenshot({ path: 'output/browser/failure.png' }).catch(() => {});
  await writeFile('output/browser/failure.json', JSON.stringify({ results, error: String(error), errors, failedAssets, logs }, null, 2));
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
