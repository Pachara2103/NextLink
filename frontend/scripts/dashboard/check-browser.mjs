import assert from 'node:assert/strict';
import { checkAdditions } from './check-additions.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { once } from 'node:events';

// Real built frontend; API fixtures are intercepted in an isolated browser.
// This checks integration, not production credentials, persistence or schema.
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, NODE_ENV: 'production', PLAN_SOURCE: 'seed', API_ORIGIN: 'http://127.0.0.1:18999' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = ''; server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
let browser, page;
const results = [], errors = [], failedAssets = [], unexpectedApi = [];
const output = process.env.BROWSER_OUTPUT_DIR || 'output/playwright/dashboard';
const additionsOnly = process.argv.includes('--additions-only');
let additionsActive = false;
const check = async (name, run) => { if (additionsOnly && !additionsActive && !name.startsWith('login returns')) return; await run(); results.push(name); console.log('✓ ' + name); };
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
  // Deliberately synthetic API state. These regressions exercise the rendered
  // live-data contract; a separate suite verifies actual PostgreSQL persistence.
  const fridayOptions = {
    companies: [{ id: 'fixture-company-cloud', name: 'Fixture Cloud Company' }, { id: 'fixture-company-data', name: 'Fixture Data Company' }],
    people: [{ namespace: 'contact', sourceId: 'fixture-contact', name: 'Fixture central coordinator', companyId: 'fixture-company-cloud' }],
    owners: [{ id: '901', name: 'ผู้ทดสอบ Dashboard' }],
    periods: [{ academicYear: 2026, term: 'FIRST' }, { academicYear: 2025, term: 'SECOND' }, { academicYear: 2023, term: 'FIRST' }],
  };
  const fridayRecords = new Map();
  const fridayHistory = new Map();
  const fridayRequests = [];
  let fridayListStatus = 200, fridayWriteStatus = 200;
  const stamp = '2026-10-15T10:00:00Z';
  const fixtureRecord = (id, title, academicYear = 2026, term = 'FIRST', attended = null) => ({
    id, title, academicYear, term, description: 'Synthetic browser regression fixture', domain: 'Cloud', format: 'talk', ownerUserId: '901',
    companyIds: ['fixture-company-cloud'], companies: [fridayOptions.companies[0]], people: [],
    sessions: [{ id: `${id}-session`, sessionDate: '2026-10-16', startTime: '09:00', endTime: '12:00', location: 'Fixture Room', status: 'held', capacity: 30, booked: 20, attended }],
    status: 'completed', revision: 1, createdAt: stamp, updatedAt: stamp,
  });
  for (const record of [fixtureRecord('fixture-friday-1', 'Fixture Cloud Workshop'), fixtureRecord('fixture-friday-2', 'Fixture Zero Attendance', 2026, 'FIRST', 0), fixtureRecord('fixture-friday-past', 'Fixture Past Term', 2025, 'SECOND', 8), fixtureRecord('fixture-friday-zero', 'Fixture Historical Zero', 2023, 'FIRST', 0)]) fridayRecords.set(record.id, record);
  const rememberFriday = (item, operation, before, reason = null) => {
    const entries = fridayHistory.get(item.id) ?? [];
    entries.push({ id: `fixture-history-${entries.length + 1}`, activityId: item.id, actorUserId: '901', actorName: 'Fixture staff', operation, reason, before: before ? structuredClone(before) : null, after: structuredClone(item), recordedAt: stamp, occurredAt: stamp });
    fridayHistory.set(item.id, entries);
  };
  const fridayApi = async (route, url, method) => {
    const path = url.pathname;
    assert.equal(route.request().headers().authorization, 'Bearer local-fixture-only', 'Friday requests carry the authenticated session');
    fridayRequests.push({ method, path, query: Object.fromEntries(url.searchParams) });
    if (method === 'GET' && path === '/api/v1/friday-activities/options') return route.fulfill({ json: fridayOptions });
    if (method === 'GET' && path === '/api/v1/friday-activities') {
      if (fridayListStatus !== 200) return route.fulfill({ status: fridayListStatus, json: { detail: 'Fixture database temporarily unavailable' } });
      const q = url.searchParams;
      const items = [...fridayRecords.values()].filter(record => record.academicYear === Number(q.get('academicYear')) && record.term === q.get('term') && (!q.get('status') || record.status === q.get('status')) && (!q.get('companyId') || record.companyIds.includes(q.get('companyId'))) && (!q.get('search') || [record.title, record.domain, ...record.companies.map(c => c.name), ...record.sessions.map(s => s.location)].join(' ').toLowerCase().includes(q.get('search').toLowerCase())));
      const sessions = items.filter(r => r.status !== 'cancelled').flatMap(r => r.sessions).filter(s => s.status === 'held');
      const known = sessions.filter(s => s.attended !== null);
      const pageNumber = Number(q.get('page')), pageSize = Number(q.get('pageSize'));
      return route.fulfill({ json: { items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: items.length, page: pageNumber, pageSize,
        summary: { total: items.length, completed: items.filter(r => r.status === 'completed').length, companies: new Set(items.filter(r => r.status !== 'cancelled').flatMap(r => r.companyIds)).size, attended: known.length ? known.reduce((sum, s) => sum + s.attended, 0) : null, unknownAttendance: sessions.length - known.length }, source: 'postgresql', lastUpdated: items.length ? stamp : null } });
    }
    const match = path.match(/^\/api\/v1\/friday-activities\/([^/]+)(?:\/(history|transitions))?$/);
    if (match && fridayRecords.has(match[1])) {
      const before = fridayRecords.get(match[1]);
      if (method === 'GET' && match[2] === 'history') return route.fulfill({ json: { items: fridayHistory.get(before.id) ?? [] } });
      if (method === 'GET' && !match[2]) return route.fulfill({ json: before });
      if ((method === 'PUT' && !match[2]) || (method === 'POST' && match[2] === 'transitions')) {
        const payload = route.request().postDataJSON();
        if (fridayWriteStatus !== 200) return route.fulfill({ status: fridayWriteStatus, json: { detail: 'Fixture write unavailable' } });
        if (payload.expectedRevision !== before.revision) return route.fulfill({ status: 409, json: { detail: 'Fixture revision conflict' } });
        const { reason, ...changes } = payload;
        delete changes.expectedRevision;
        const item = { ...before, ...changes, revision: before.revision + 1, updatedAt: stamp };
        if (changes.companyIds) item.companies = fridayOptions.companies.filter(c => changes.companyIds.includes(c.id));
        fridayRecords.set(item.id, item); rememberFriday(item, match[2] ? 'transition' : 'update', before, reason);
        return route.fulfill({ json: item });
      }
    }
    if (method === 'POST' && path === '/api/v1/friday-activities') {
      const { idempotencyKey, ...payload } = route.request().postDataJSON();
      assert.match(idempotencyKey, /^[0-9a-f-]{36}$/i, 'create has an idempotency key');
      if (fridayWriteStatus !== 200) return route.fulfill({ status: fridayWriteStatus, json: { detail: 'Fixture write unavailable' } });
      const item = { ...payload, id: `fixture-created-${fridayRecords.size}`, status: 'draft', revision: 1, companies: fridayOptions.companies.filter(c => payload.companyIds.includes(c.id)), createdAt: stamp, updatedAt: stamp };
      fridayRecords.set(item.id, item); rememberFriday(item, 'create', null);
      return route.fulfill({ status: 201, json: item });
    }
    unexpectedApi.push(`${method} ${path}`);
    return route.fulfill({ status: 500, json: { detail: 'Unexpected Friday fixture request' } });
  };
  await context.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body;
    if (path.startsWith('/api/v1/friday-activities')) return fridayApi(route, url, method);
    if (path === '/api/v1/auth/me') return route.fulfill({ status: authStatus, json: authStatus === 200 ? user : { detail: 'Fixture auth unavailable' } });
    if (path === '/api/v1/auth/login' && method === 'POST') body = { accessToken: 'local-fixture-only', tokenType: 'bearer', user };
    else if (path === '/api/v1/auth/logout' && method === 'POST') return route.fulfill({ status: 204 });
    else if (path === '/api/v1/health') body = { status: 'ok', models: true, ready: true, bootId: 'dashboard-fixture', startedAt: '2026-09-14T00:00:00Z' };
  // Every read the console makes on these pages, answered with an empty list.
  // A path that is not here is not quietly ignored: it is recorded and fails
  // the run at the end, which is how a page that started calling something new
  // gets noticed. That also means this list has to grow with the console —
  // สรุปข้อมูลจากไลน์ (line/summary-drafts) was added to the sidebar and the
  // list was not, so every run after it failed here naming the endpoint.
    else if (method === 'GET' && ['/api/v1/line/groups', '/api/v1/companies', '/api/v1/contacts', '/api/v1/employees', '/api/v1/notes', '/api/v1/line/update_logs', '/api/v1/chat_histories', '/api/v1/line/summary-drafts'].includes(path)) body = { items: [] };
    else { unexpectedApi.push(`${method} ${path}`); return route.fulfill({ status: 500, json: { detail: 'Unexpected API in integration check' } }); }
    await route.fulfill({ json: body });
  });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/_next/') && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`); });
  let allowDiscard = true;
  page.on('dialog', dialog => allowDiscard ? dialog.accept() : dialog.dismiss());
  const paths = ['', '/electives', '/mou', '/internship', '/cooperative', '/capstone', '/friday-activities'];
  const go = async path => { await page.goto(base + '/dashboard' + path); await page.locator('.app-shell[data-ready="true"]').waitFor(); assert.match(await page.title(), /NextLink/); assert.equal(await page.locator('nextjs-portal').count(), 0); };
  const theme = async value => {
    await page.getByRole('radio', { name: value === 'classic' ? /สีดั้งเดิม|สว่าง/ : /มืด/ }).filter({ visible: true }).first().click();
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
  await check('six modules and overview render in both themes without global overflow', async () => {
    for (const value of ['classic', 'dark']) {
      for (const path of paths) {
        await go(path); await theme(value);
        assert.equal(await page.locator('main').count(), 1);
        assert.match(await page.locator('.dashboard-demo-notice').innerText(), path === '/friday-activities' ? /ฐานข้อมูลกลาง/ : /ข้อมูลทดลอง/);
        assert.equal(await page.locator('aside a[href="/dashboard"]').getAttribute('aria-current'), 'page');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `fits: ${path} ${value}`);
        if (path) assert.equal(await page.locator('article.kpi-card').first().evaluate(el => getComputedStyle(el).backgroundColor), value === 'dark' ? 'rgb(16, 20, 24)' : 'rgb(255, 255, 255)');
      }
      await page.screenshot({ path: `${output}/capstone-${value}.png`, fullPage: true });
    }
  });
  await check('MOU tables contain overflow and keep details reachable at desktop widths', async () => {
    for (const value of ['classic', 'dark']) {
      for (const width of [1366, 1400, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await go('/mou'); await theme(value);
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.locator('#dashboard-directory .table-wrap').evaluate(el => {
          const table = el.querySelector('table');
          const wrapper = el.getBoundingClientRect();
          el.scrollLeft = el.scrollWidth;
          const action = el.querySelector('tbody tr .row-action').getBoundingClientRect();
          return {
            viewport: innerWidth, page: document.documentElement.scrollWidth,
            wrapper: el.clientWidth, table: table.getBoundingClientRect().width,
            scrollLeft: el.scrollLeft,
            actionVisible: action.left >= wrapper.left - 1 && action.right <= wrapper.right + 1,
          };
        });
        const context = `${value} ${width}px: ${JSON.stringify(layout)}`;
        assert.ok(layout.page <= width + 1, `page fits ${context}`);
        if (layout.table > layout.wrapper + 1) assert.ok(layout.scrollLeft > 0, `wide table scrolls ${context}`);
        assert.ok(layout.actionVisible, `details remain reachable ${context}`);
        await page.locator('#dashboard-directory tbody .row-action').first().click();
        await page.locator('dialog[open]').getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
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
    await page.waitForURL('**/electives?year=2569&term=2');
    await page.locator('.academic-period-panel[aria-busy="false"]').waitFor();
    await page.getByLabel('เลือกภาคการศึกษา', { exact: true }).selectOption('1');
    await page.waitForURL('**/electives?year=2569&term=1');
    await page.locator('.academic-period-panel[aria-busy="false"]').waitFor();
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    await page.getByRole('searchbox').fill('DOES-NOT-EXIST');
    await page.waitForURL('**/*q=DOES-NOT-EXIST*');
    await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
    assert.equal(await page.getByRole('searchbox').inputValue(), 'DOES-NOT-EXIST');
    assert.equal(await page.locator('#dashboard-directory tbody .row-action').count(), 0);
  });
  const storage = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('nextlink.dashboard.demo.'))));
  await check('visible module navigation preserves periods and marks the current page', async () => {
    await go('/electives?year=2568&term=2');
    const nav = page.getByRole('navigation', { name: 'โมดูล Dashboard', exact: true });
    assert.equal(await nav.getByRole('link').count(), 7);
    assert.equal(await nav.getByRole('link', { name: 'วิชาเลือก', exact: true }).getAttribute('aria-current'), 'page');
    await nav.getByRole('link', { name: 'MOU', exact: true }).click();
    await page.waitForURL('**/dashboard/mou?year=2568&term=2');
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    assert.equal(await nav.locator('[aria-current="page"]').innerText(), 'MOU');
    await page.locator('.dashboard-demo-notice summary').click();
    assert.match(await page.locator('.dashboard-demo-notice p').innerText(), /ไม่ส่งต่อไปยังเครื่อง/);
  });
  await check('search shortcuts move focus to results, including empty results, on every module', async () => {
    for (const path of paths.filter(path => path && path !== '/friday-activities')) {
      await go(path);
      await page.getByRole('searchbox').fill('UX-NO-MATCH');
      await page.waitForFunction(() => document.querySelector('#dashboard-directory .empty-state'));
      await page.getByRole('searchbox').press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'dashboard-directory');
      await page.getByRole('link', { name: 'ค้นหา', exact: true }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'dashboard-filters');
      await page.getByRole('button', { name: 'ล้างตัวกรอง', exact: true }).click();
      await page.locator('#dashboard-directory .row-action').filter({ visible: true }).first().waitFor();
      await page.getByRole('link', { name: 'ดูผลการค้นหา', exact: true }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'dashboard-directory');
    }
  });
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
  const fridayKpi = label => page.locator('article.kpi-card').filter({ has: page.locator('.kpi-label', { hasText: label }) }).locator('.kpi-value');
  const fridayDialog = () => page.locator('dialog.friday-live-dialog[open]');
  const openFriday = async title => page.getByRole('button', { name: `ดูรายละเอียด ${title}`, exact: true }).filter({ visible: true }).click();
  await check('Friday API periods, company/status/search filters and unknown attendance remain explicit', async () => {
    await go('/friday-activities');
    assert.equal(await fridayKpi('กิจกรรมทั้งหมด').innerText(), '2');
    assert.equal(await fridayKpi('ผู้เข้าร่วมจริง').innerText(), '0');
    assert.match(await page.locator('article.kpi-card').last().innerText(), /ขาดจำนวน 1 รอบ/);
    await page.getByRole('combobox', { name: 'บริษัท', exact: true }).selectOption('fixture-company-data');
    await page.getByText('ไม่พบกิจกรรมที่ตรงกับตัวกรอง', { exact: true }).filter({ visible: true }).waitFor();
    await page.getByRole('button', { name: 'ล้างตัวกรอง', exact: true }).click();
    await openFriday('Fixture Cloud Workshop');
    await fridayDialog().getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    assert.equal(await fridayDialog().getByLabel('จำนวนมาจริง', { exact: true }).inputValue(), '');
    await fridayDialog().getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await fridayDialog().getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
    await page.getByRole('combobox', { name: 'สถานะ', exact: true }).selectOption('draft');
    await page.getByText('ไม่พบกิจกรรมที่ตรงกับตัวกรอง', { exact: true }).filter({ visible: true }).waitFor();
    await go('/friday-activities?year=2568&term=2');
    assert.equal(await fridayKpi('กิจกรรมทั้งหมด').innerText(), '1');
    assert.equal(await fridayKpi('ผู้เข้าร่วมจริง').innerText(), '8');
    await go('/friday-activities?year=2569&term=summer');
    assert.equal(await fridayKpi('กิจกรรมทั้งหมด').innerText(), '0');
    assert.equal(await fridayKpi('ผู้เข้าร่วมจริง').innerText(), '—');
    assert.equal(await page.locator('.academic-period-empty').count(), 0, 'empty live state is not the demo period fallback');
    await go('/friday-activities?year=2566&term=1');
    assert.equal(await fridayKpi('ผู้เข้าร่วมจริง').innerText(), '0');
    assert.ok(fridayRequests.some(r => r.query.academicYear === '2025' && r.query.term === 'SECOND'));
  });
  await check('Friday manual create, edit, reload and status history use only the central API contract', async () => {
    await go('/friday-activities');
    const localBefore = await storage();
    await page.getByRole('button', { name: 'สร้างกิจกรรม', exact: true }).click();
    const dialog = fridayDialog();
    await dialog.getByLabel('ชื่อกิจกรรม *', { exact: true }).fill('Fixture New Friday');
    await dialog.getByRole('combobox', { name: 'เจ้าหน้าที่ผู้รับผิดชอบ *', exact: true }).selectOption('901');
    await dialog.getByRole('checkbox', { name: 'Fixture Cloud Company', exact: true }).check();
    await dialog.getByRole('checkbox', { name: /Fixture central coordinator/ }).check();
    await dialog.getByLabel('จำนวนมาจริง', { exact: true }).fill('0');
    await dialog.getByRole('button', { name: 'บันทึกกิจกรรม', exact: true }).click();
    await dialog.getByText('บันทึกกิจกรรมลงฐานข้อมูลกลางแล้ว', { exact: true }).waitFor();
    let created = [...fridayRecords.values()].find(r => r.title === 'Fixture New Friday');
    assert.equal(created.academicYear, 2026); assert.equal(created.term, 'FIRST');
    assert.equal(created.sessions[0].attended, 0); assert.equal(created.people[0].namespace, 'contact');
    await dialog.getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    await dialog.getByLabel('ชื่อกิจกรรม *', { exact: true }).fill('Fixture New Friday Edited');
    await dialog.getByRole('button', { name: 'บันทึกกิจกรรม', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Fixture New Friday Edited', exact: true }).waitFor();
    await dialog.getByRole('combobox', { name: 'สถานะถัดไป', exact: true }).selectOption('contacting');
    await dialog.getByLabel('เหตุผล / บันทึกการติดตาม', { exact: true }).fill('Fixture follow-up reason');
    await dialog.getByRole('button', { name: 'บันทึกสถานะ', exact: true }).click();
    await dialog.getByText('บันทึกการเปลี่ยนสถานะแล้ว', { exact: true }).waitFor();
    await dialog.locator('.friday-live-history').getByText('Fixture follow-up reason', { exact: true }).waitFor();
    assert.deepEqual(fridayHistory.get(created.id).map(entry => entry.operation), ['create', 'update', 'transition']);
    assert.equal(fridayRecords.get(created.id).revision, 3);
    assert.deepEqual(await storage(), localBefore, 'Friday writes never populate local demo storage');
    await page.screenshot({ path: `${output}/friday-manual-history.png` });
    await page.reload(); await page.locator('.app-shell[data-ready="true"]').waitFor();
    await page.getByRole('searchbox').fill('Fixture New Friday Edited');
    await openFriday('Fixture New Friday Edited');
    await fridayDialog().getByText('Fixture central coordinator · ผู้ประสานงาน', { exact: true }).waitFor();
    await fridayDialog().getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
  });
  await check('Friday revision conflicts preserve the draft and require explicitly accepting the latest record', async () => {
    await go('/friday-activities'); await openFriday('Fixture New Friday Edited');
    const dialog = fridayDialog();
    await dialog.getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
    await dialog.getByLabel('ชื่อกิจกรรม *', { exact: true }).fill('Fixture Unsaved Conflict Draft');
    const current = [...fridayRecords.values()].find(r => r.title === 'Fixture New Friday Edited');
    fridayRecords.set(current.id, { ...current, title: 'Fixture Another Staff Revision', revision: current.revision + 1 });
    await dialog.getByRole('button', { name: 'บันทึกกิจกรรม', exact: true }).click();
    await dialog.getByRole('region', { name: 'ข้อมูลฉบับล่าสุด', exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('ชื่อกิจกรรม *', { exact: true }).inputValue(), 'Fixture Unsaved Conflict Draft');
    assert.equal(await dialog.getByRole('button', { name: 'บันทึกกิจกรรม', exact: true }).isDisabled(), true);
    assert.equal(fridayRecords.get(current.id).title, 'Fixture Another Staff Revision');
    await page.screenshot({ path: `${output}/friday-revision-conflict.png` });
    await dialog.getByRole('button', { name: 'โหลดฉบับล่าสุดแทนแบบฟอร์มของฉัน', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Fixture Another Staff Revision', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
  });
  await check('Friday failed writes keep entered values and failed reads never masquerade as an empty database', async () => {
    await go('/friday-activities');
    await page.getByRole('button', { name: 'สร้างกิจกรรม', exact: true }).click();
    await fridayDialog().getByLabel('ชื่อกิจกรรม *', { exact: true }).fill('Fixture Write Retry');
    await fridayDialog().getByRole('combobox', { name: 'เจ้าหน้าที่ผู้รับผิดชอบ *', exact: true }).selectOption('901');
    fridayWriteStatus = 503;
    await fridayDialog().getByRole('button', { name: 'บันทึกกิจกรรม', exact: true }).click();
    await fridayDialog().getByRole('alert').waitFor();
    assert.equal(await fridayDialog().getByLabel('ชื่อกิจกรรม *', { exact: true }).inputValue(), 'Fixture Write Retry');
    assert.equal([...fridayRecords.values()].some(r => r.title === 'Fixture Write Retry'), false);
    fridayWriteStatus = 200;
    await fridayDialog().getByRole('button', { name: 'บันทึกกิจกรรม', exact: true }).click();
    await fridayDialog().getByText('บันทึกกิจกรรมลงฐานข้อมูลกลางแล้ว', { exact: true }).waitFor();
    await fridayDialog().getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
    fridayListStatus = 503;
    await page.reload();
    await page.getByText('อ่านรายการกิจกรรมไม่สำเร็จ', { exact: true }).waitFor();
    assert.equal(await fridayKpi('กิจกรรมทั้งหมด').innerText(), '—');
    assert.match(await page.locator('#dashboard-directory').innerText(), /ยังแสดงรายการปัจจุบันไม่ได้/);
    assert.doesNotMatch(await page.locator('#dashboard-directory').innerText(), /ยังไม่มีกิจกรรมในช่วง/);
    await page.screenshot({ path: `${output}/friday-read-error.png`, fullPage: true });
    fridayListStatus = 200;
    await page.getByRole('button', { name: 'ลองอ่านรายการอีกครั้ง', exact: true }).click();
    await page.locator('.app-shell[data-ready="true"]').waitFor();
    assert.equal(await fridayKpi('กิจกรรมทั้งหมด').innerText(), '4');
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
    for (const width of [320, 390, 820]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of paths) {
        await go(path);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `mobile fits: ${path} ${width}`);
        const links = await page.locator('.dashboard-module-nav a').all();
        for (const link of links) {
          const rect = await link.boundingBox();
          assert.ok(rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= width, `reachable module at ${width}`);
        }
        if (path === '/electives' && width < 760) {
          assert.ok(await page.locator('.mobile-course-stats .status-select').evaluateAll(selects => selects.every(select => {
            const rect = select.getBoundingClientRect();
            return rect.width <= select.parentElement.getBoundingClientRect().width + 1;
          })), 'status controls do not overlap enrollment figures');
          await page.locator('#dashboard-directory .row-action').filter({ visible: true }).first().click();
          const dialog = page.locator('dialog[open]:not([data-dialog-status])');
          await dialog.getByRole('button', { name: 'แก้ไขข้อมูล', exact: true }).click();
          const save = await dialog.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).boundingBox();
          assert.ok(save.y >= 0 && save.y + save.height <= 844 && save.x + save.width <= width, 'mobile save stays in view');
          await dialog.getByRole('button', { name: 'ปิดรายละเอียด', exact: true }).click();
        }
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
  additionsActive = true;
  await checkAdditions({ page, context, base, go, check, theme, output });
  additionsActive = false;
  await check('demo overrides are isolated when a different staff account signs in', async () => {
    const before = await storage();
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await page.waitForURL('**/login');
    user = { ...user, id: 902, username: 'dashboard-fixture-2' };
    await login(); await page.waitForURL(base + '/');
    await go('/electives');
    assert.doesNotMatch(await page.locator('.nextlink-dashboard').innerText(), /\[Dashboard migration\]/);
    await go('/companies?company=partner-cloud');
    assert.doesNotMatch(await page.locator('main').innerText(), /Shared synthetic coordinator|ย้อนหลังสำหรับทดสอบ/);
    await go('/internship?year=2569&term=1&q=Mock%20Cloud&round=1');
    await page.locator('#internship-outcomes[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#internship-outcomes [data-stage="accepted"] > strong').innerText(), '0');
    assert.doesNotMatch(await page.locator('main').innerText(), /Synthetic result saved in browser check|Case ล่าสุดจากอีกแท็บ/);
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
  assert.deepEqual(unexpectedApi, [], 'only explicitly mocked business APIs were called; no unexpected writes or AI requests');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(failedAssets, [], 'no broken chunks');
  await writeFile(`${output}/${additionsOnly ? 'additions-results' : 'results'}.json`, JSON.stringify({ passed: results.length, results, errors, failedAssets, unexpectedApi, fridayRequests, backend: 'intercepted fixtures; not a live DB test' }, null, 2));
  await Promise.all(['failure.png', 'failure.txt'].map(name => rm(`${output}/${name}`, { force: true })));
  console.log(`dashboard browser: ok (${results.length} production regression checks)`);
} catch (error) {
  if (page) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {}); await writeFile(`${output}/failure.txt`, await page.locator('body').ariaSnapshot()).catch(() => {}); }
  console.error(logs); throw error;
} finally {
  await browser?.close(); server.kill('SIGTERM');
  if (server.exitCode === null) await once(server, 'exit');
}
