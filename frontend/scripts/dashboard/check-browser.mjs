import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';

// Real built frontend; API fixtures are intercepted in an isolated browser.
// This checks integration, not production credentials, persistence or schema.
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', API_ORIGIN: 'http://127.0.0.1:18999' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = ''; server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
let browser, page;
const results = [], errors = [], failedAssets = [], unexpectedApi = [];
const output = 'output/playwright/dashboard';
const check = async (name, run) => { await run(); results.push(name); console.log('✓ ' + name); };
try {
  await mkdir(output, { recursive: true });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'built server started');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let user = { id: 901, username: 'dashboard-fixture', displayName: 'ผู้ทดสอบ Dashboard' };
  let authStatus = 200;
  await context.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body;
    if (path === '/api/v1/auth/me') return route.fulfill({ status: authStatus, json: authStatus === 200 ? user : { detail: 'Fixture auth unavailable' } });
    if (path === '/api/v1/auth/login' && method === 'POST') body = { accessToken: 'local-fixture-only', tokenType: 'bearer', user };
    else if (path === '/api/v1/auth/logout' && method === 'POST') return route.fulfill({ status: 204 });
    else if (path === '/api/v1/health') body = { status: 'ok', models: true, ready: true, bootId: 'dashboard-fixture', startedAt: '2026-09-14T00:00:00Z' };
    else if (method === 'GET' && ['/api/v1/line/groups', '/api/v1/companies', '/api/v1/contacts', '/api/v1/employees', '/api/v1/notes', '/api/v1/line/update_logs', '/api/v1/chat_histories'].includes(path)) body = { items: [] };
    else { unexpectedApi.push(`${method} ${path}`); return route.fulfill({ status: 500, json: { detail: 'Unexpected API in integration check' } }); }
    await route.fulfill({ json: body });
  });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/_next/') && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`); });
  let allowDiscard = true;
  page.on('dialog', dialog => allowDiscard ? dialog.accept() : dialog.dismiss());
  const paths = ['', '/electives', '/mou', '/internship', '/cooperative', '/capstone'];
  const go = async path => { await page.goto(base + '/dashboard' + path); await page.locator('.app-shell[data-ready="true"]').waitFor(); };
  const theme = async value => {
    await page.getByRole('button', { name: value === 'classic' ? 'สีดั้งเดิม' : 'โหมดมืด', exact: true }).filter({ visible: true }).click();
    await page.waitForFunction(value => document.documentElement.dataset.theme === value, value);
  };
  const login = async () => {
    await page.locator('input[name=username]').fill(user.username);
    await page.locator('input[name=password]').fill('local-fixture-only');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  };
  await check('all dashboard routes require a confirmed staff session', async () => {
    for (const path of paths) {
      await page.goto(base + '/dashboard' + path);
      await page.waitForURL('**/login?next=*');
      assert.equal(await page.locator('.nextlink-dashboard').count(), 0);
    }
  });
  await check('login returns to a dashboard deep link with period and search preserved', async () => {
    await page.goto(base + '/dashboard/electives?year=2568&term=2&q=Cloud');
    await page.waitForURL('**/login?next=*'); await login();
    await page.waitForURL(base + '/dashboard/electives?year=2568&term=2&q=Cloud');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    assert.equal(await page.getByRole('searchbox').inputValue(), 'Cloud');
    assert.equal(await page.getByLabel('เลือกปีการศึกษา', { exact: true }).inputValue(), '2568');
  });
  await check('five modules and overview render in both themes without global overflow', async () => {
    for (const value of ['classic', 'dark']) {
      for (const path of paths) {
        await go(path); await theme(value);
        assert.equal(await page.locator('main').count(), 1);
        assert.match(await page.locator('.dashboard-demo-notice').innerText(), /ข้อมูลทดลอง/);
        assert.equal(await page.locator('aside a[href="/dashboard"]').getAttribute('aria-current'), 'page');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `fits: ${path} ${value}`);
        if (path) assert.equal(await page.locator('article.kpi-card').first().evaluate(el => getComputedStyle(el).backgroundColor), value === 'dark' ? 'rgb(16, 20, 24)' : 'rgb(255, 255, 255)');
      }
      await page.screenshot({ path: `${output}/capstone-${value}.png`, fullPage: true });
    }
  });
  await check('dashboard links stay in the new namespace and preserve academic periods', async () => {
    await go('?year=2568&term=2');
    for (const link of await page.locator('.home-module-card').all()) {
      const href = await link.getAttribute('href');
      assert.match(href, /^\/dashboard\//); assert.match(href, /year=2568&term=2/);
    }
    await page.locator('.home-module-card[href*="/electives"]').click();
    await page.waitForURL('**/dashboard/electives?year=2568&term=2');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await page.getByLabel('เลือกปีการศึกษา', { exact: true }).selectOption('2569');
    await page.getByLabel('เลือกภาคการศึกษา', { exact: true }).selectOption('1');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await page.getByRole('searchbox').fill('DOES-NOT-EXIST');
    await page.waitForURL('**/*q=DOES-NOT-EXIST*');
    await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
    assert.equal(await page.getByRole('searchbox').inputValue(), 'DOES-NOT-EXIST');
    assert.equal(await page.locator('#dashboard-directory tbody .row-action').count(), 0);
  });
  const storage = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('nextlink.dashboard.demo.'))));
  await check('each module opens its lazy dialog and persists demo edits after reload', async () => {
    const fields = { '/electives': 'ชื่อรายวิชา', '/mou': 'ชื่อบริษัท (ภาษาไทย)', '/internship': 'ชื่อตำแหน่งที่ 1', '/cooperative': 'ชื่อตำแหน่งที่ 1', '/capstone': 'ชื่อหัวข้อ' };
    for (const [path, field] of Object.entries(fields)) {
      await go(path);
      await page.locator('#dashboard-directory .row-action').filter({ visible: true }).first().click();
      const dialog = page.locator('dialog[open]:not([data-dialog-status])');
      const editLabel = ['/internship', '/cooperative'].includes(path) ? 'บันทึกจำนวนที่รับ' : 'แก้ไขข้อมูล';
      await dialog.getByRole('button', { name: editLabel, exact: true }).click();
      const input = dialog.getByLabel(field, { exact: true });
      const changed = (await input.inputValue()) + ' [Dashboard migration]';
      await input.fill(changed);
      await dialog.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
      await dialog.getByRole('button', { name: editLabel, exact: true }).waitFor();
      assert.ok(Object.values(await storage()).some(value => value.includes(changed)), 'persisted ' + path);
      const rect = await dialog.boundingBox();
      assert.ok(rect.x > 0 && rect.y > 0 && rect.x + rect.width <= 1440, 'centered dialog');
      assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(16, 20, 24)');
      await page.screenshot({ path: `${output}/dialog-${path.slice(1)}.png` });
      await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
      await page.getByRole('searchbox').fill(changed);
      await page.locator('#dashboard-directory .row-action').filter({ visible: true }).first().click();
      await page.locator('dialog[open]').getByText(changed, { exact: true }).first().waitFor();
    }
  });
  await check('unsaved dialog edits can be kept or discarded without leaking into another record', async () => {
    await go('/electives');
    const saved = await storage();
    await page.locator('#dashboard-directory .row-action').filter({ visible: true }).first().click();
    const dialog = page.locator('dialog[open]:not([data-dialog-status])');
    await dialog.getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    await dialog.getByLabel('ชื่อรายวิชา', { exact: true }).fill('Unsaved scratch');
    allowDiscard = false;
    await page.keyboard.press('Escape');
    assert.equal(await dialog.getByLabel('ชื่อรายวิชา', { exact: true }).inputValue(), 'Unsaved scratch');
    allowDiscard = true;
    await dialog.getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.locator('#dashboard-directory .row-action').filter({ visible: true }).nth(1).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    assert.notEqual(await page.locator('dialog[open]').getByLabel('ชื่อรายวิชา', { exact: true }).inputValue(), 'Unsaved scratch');
    assert.deepEqual(await storage(), saved);
  });
  await check('resetting internship preserves co-op, Capstone and other periods', async () => {
    const before = await storage();
    await go('/internship');
    await page.getByRole('button', { name: 'คืนค่าตั้งต้น', exact: true }).click();
    await page.waitForFunction(() => !Object.keys(localStorage).some(key => key.startsWith('nextlink.dashboard.demo.') && key.endsWith('nextlink.internship.companies.v2')));
    const after = await storage();
    for (const [key, value] of Object.entries(before)) if (!key.endsWith('nextlink.internship.companies.v2')) assert.equal(after[key], value);
    await go('/electives?year=2568&term=2');
    assert.doesNotMatch(await page.locator('.nextlink-dashboard').innerText(), /\[Dashboard migration\]/);
  });
  await check('responsive layouts, mobile navigation and shared console styles survive route changes', async () => {
    for (const width of [390, 820]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of paths) {
        await go(path);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `mobile fits: ${path} ${width}`);
      }
      await page.screenshot({ path: `${output}/mobile-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('aside a[href="/?panel=agent"]').click();
    await page.waitForURL(base + '/?panel=agent');
    assert.equal(await page.locator('.nextlink-dashboard').count(), 0);
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(10, 12, 14)');
    await page.screenshot({ path: `${output}/console-after-dashboard.png` });
    await page.locator('aside a[href="/dashboard"]').click();
    await page.locator('.home-module-grid').waitFor();
  });
  await check('existing planner remains reachable through the shared navigation', async () => {
    await page.locator('aside a[href="/elective-plan"]').click();
    await page.waitForURL(base + '/elective-plan');
    await page.getByRole('button', { name: 'สำรองแผน JSON', exact: true }).waitFor();
    assert.equal(await page.locator('.nextlink-dashboard').count(), 0);
    assert.equal(await page.locator('.elective-planner').count(), 1);
    await page.locator('aside a[href="/dashboard"]').click();
    await page.locator('.home-module-grid').waitFor();
  });
  await check('demo overrides are isolated when a different staff account signs in', async () => {
    const before = await storage();
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await page.waitForURL('**/login');
    user = { ...user, id: 902, username: 'dashboard-fixture-2' };
    await login(); await page.waitForURL(base + '/');
    await go('/electives');
    assert.doesNotMatch(await page.locator('.nextlink-dashboard').innerText(), /\[Dashboard migration\]/);
    assert.deepEqual(await storage(), before, 'other account does not mutate the saved demo');
  });
  await check('offline and expired sessions cannot render a dashboard', async () => {
    authStatus = 503; await page.reload();
    await page.getByRole('heading', { name: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', exact: true }).waitFor();
    assert.equal(await page.locator('.nextlink-dashboard').count(), 0);
    authStatus = 401; await page.getByRole('button', { name: 'ลองใหม่อีกครั้ง', exact: true }).click();
    await page.waitForURL('**/login?next=*');
    assert.equal(await page.locator('.nextlink-dashboard').count(), 0);
  });
  assert.deepEqual(unexpectedApi, [], 'demo edits never write to real business APIs or run AI');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(failedAssets, [], 'no broken chunks');
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: results.length, results, errors, failedAssets, unexpectedApi, backend: 'intercepted fixtures; not a live DB test' }, null, 2));
} catch (error) {
  if (page) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); await writeFile(`${output}/failure.txt`, await page.locator('body').ariaSnapshot()).catch(() => {}); }
  console.error(logs); throw error;
} finally {
  await browser?.close(); server.kill('SIGTERM');
  if (server.exitCode === null) await once(server, 'exit');
}
