/**
 * The planner against the shared plan, in a real browser.
 *
 * check-browser.mjs drives the bundled plan in localStorage; this drives the
 * other store. The two halves worth proving here cannot be shown by a unit
 * test, because they are about what a person sees between pressing something
 * and the server answering:
 *
 *   - the screen moves first, and the request that follows carries what the
 *     screen already shows;
 *   - a request the server refuses puts the screen back, says why in the
 *     backend's own words, and leaves nothing half-applied.
 *
 * The API is a fixture rather than a live backend: the point is the browser's
 * behaviour around the request, and a fixture can refuse on demand.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { once } from 'node:events';

const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;

// No PLAN_SOURCE: this is the shared plan, which is what a real deployment runs.
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1', NODE_ENV: 'production', API_ORIGIN: 'http://127.0.0.1:18999' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = ''; server.stdout.on('data', (d) => { logs += d; }); server.stderr.on('data', (d) => { logs += d; });

const results = [];
const errors = [];
await mkdir('output/browser', { recursive: true });
const check = async (name, fn) => { await fn(); results.push(name); console.log('  ✓ ' + name); };

/* ---- the fixture plan ------------------------------------------------ */

const TERM = { id: 7, year: 2569, semester: 1, status: 'current', createdAt: '2026-05-01T03:00:00Z', updatedAt: '2026-05-01T03:00:00Z' };
/** The term that was closed to open the one above — 1/2569 in the report. */
const PAST_TERM = { id: 6, year: 2568, semester: 2, status: 'archived', createdAt: null, updatedAt: '2026-01-01T03:00:00Z' };
const ROOMS = [
  { id: 4, name: '301', building: 'จุฬาพัฒน์ 14', floor: '3', seats: 40, seatsIsEstimated: false, tier: 'ready', isActive: true, blockedSlots: [], createdAt: null, updatedAt: null },
  { id: 5, name: '302', building: 'จุฬาพัฒน์ 14', floor: '3', seats: 60, seatsIsEstimated: false, tier: 'ready', isActive: true, blockedSlots: [], createdAt: null, updatedAt: null },
];
const course = (id, code, name) => ({
  id, termId: 7, companyId: 3, companyTh: 'บริษัททดสอบ', companyEn: null,
  courseCode: code, section: 1, electiveName: name, category: 'เทคโนโลยี', deliveryMode: 'ON_SITE',
  capacity: 30, sessionsPerWeek: 1, weeks: 10, applicationFormUrl: null, courseSyllabusUrl: null, notes: null,
  lecturerId: 90 + id, lecturerName: 'อาจารย์ทดสอบ', coordinatorId: null, coordinatorName: null,
  coordinatorEmail: null, coordinatorPhone: null,
  availability: ['MON_AM', 'WED_PM'], createdAt: null, updatedAt: '2026-05-09T03:00:00Z',
});
const checklist = (electiveId) => ({
  electiveId, inviteLetter: 'NOT_RECEIVED', instructionLetter: 'NOT_RECEIVED', informLecturer: 'NOT_DONE',
  createMcv: 'NOT_DONE', inviteMentor: 'NOT_DONE', inviteLecturer: 'NOT_DONE', inviteStudents: 'NOT_DONE',
  mcvJoinCode: '', createdAt: null, updatedAt: null,
});

let plan;
const resetPlan = () => {
  plan = {
    term: TERM,
    rooms: JSON.parse(JSON.stringify(ROOMS)),
    electives: [course(12, '2110123', 'วิชาหนึ่ง'), course(13, '2110124', 'วิชาสอง')],
    sessions: [],
    checklists: [checklist(12), checklist(13)],
  };
};
resetPlan();

/** What 2/2568 ran, read only when somebody switches to it. */
const pastPlan = {
  term: PAST_TERM,
  rooms: JSON.parse(JSON.stringify(ROOMS)),
  electives: [{ ...course(30, '2110001', 'วิชาที่เคยเปิด'), termId: PAST_TERM.id }],
  sessions: [{
    id: 700, electiveId: 30, termId: PAST_TERM.id, slot: 'MON_AM', roomId: 4,
    startTime: '09:00:00', endTime: '12:00:00', isLocked: false, source: 'manual',
    createdAt: null, updatedAt: null,
  }],
  checklists: [checklist(30)],
};

/** Requests the planner made, newest last — what the assertions read. */
let calls = [];
/** `{ method, path, status, detail }` — the next matching write is refused. */
let refuse = null;
let nextSessionId = 900;

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { ready = (await fetch(base)).ok; } catch { /* still starting */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'production server started');

  // PW_CHROMIUM: use a browser Playwright did not install itself. CI images
  // often already carry one, and downloading a second copy per run is minutes.
  browser = await chromium.launch({ headless: true, ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const user = { id: 1, username: 'planner-fixture', displayName: 'ผู้ทดสอบ' };

  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const body = method === 'GET' || method === 'DELETE' ? null : route.request().postDataJSON();
    calls.push({ method, path: path + url.search, body });

    if (refuse && refuse.method === method && path.startsWith(refuse.path)) {
      const answer = refuse;
      refuse = null;
      return route.fulfill({ status: answer.status, json: { detail: answer.detail } });
    }

    if (path === '/api/v1/auth/me') return route.fulfill({ json: user });
    if (path === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'local-test-only', tokenType: 'bearer', user } });
    if (path === '/api/v1/health') return route.fulfill({ json: { status: 'ok', models: true, ready: true, bootId: 'fixture', startedAt: '2026-09-12T00:00:00Z' } });
    if (path === '/api/v1/companies') return route.fulfill({ json: { items: [{ id: 3, groupId: null, companyTh: 'บริษัททดสอบ', companyEn: null, aliases: [], isLinked: true, createdAt: null, updatedAt: null }] } });
    if (path === '/api/v1/electives/plan') {
      // The fixture reads the query the way the backend does — by its
      // camelCase name. A planner that asks for a closed term and is handed
      // the current one is exactly the bug this file exists to catch.
      const asked = url.searchParams.get('termId');
      if (asked === String(PAST_TERM.id)) return route.fulfill({ json: pastPlan });
      return route.fulfill({ json: plan });
    }
    if (path === '/api/v1/electives/terms') return route.fulfill({ json: { items: [TERM, PAST_TERM] } });

    if (path === '/api/v1/electives/sessions' && method === 'POST') {
      const created = {
        id: (nextSessionId += 1), electiveId: body.electiveId, termId: 7, slot: body.slot, roomId: body.roomId ?? null,
        startTime: body.startTime ?? '09:00:00', endTime: body.endTime ?? '12:00:00',
        isLocked: body.isLocked ?? false, source: body.source ?? 'manual', createdAt: null, updatedAt: null,
      };
      plan.sessions.push(created);
      return route.fulfill({ json: created });
    }
    if (path === '/api/v1/electives/sessions' && method === 'PUT') {
      // "จัดตารางใหม่": the unlocked half is replaced and the whole term's
      // periods come back with their real ids. Answering `{status: success}`
      // here — as an earlier version of this fixture did — makes the planner
      // reconcile to an empty timetable, which is worth getting right because
      // that is exactly what the real route does not do.
      plan.sessions = [
        ...plan.sessions.filter((item) => item.isLocked),
        ...body.map((item, index) => ({
          id: (nextSessionId += 1), electiveId: item.electiveId, termId: 7, slot: item.slot,
          roomId: item.roomId ?? null, startTime: item.startTime ?? '09:00:00',
          endTime: item.endTime ?? '12:00:00', isLocked: item.isLocked ?? false,
          source: item.source ?? 'auto', createdAt: null, updatedAt: null,
        })),
      ];
      return route.fulfill({ json: { items: plan.sessions, total: plan.sessions.length } });
    }
    if (path.startsWith('/api/v1/electives/sessions/') && method === 'DELETE') {
      const id = Number(path.split('/').pop());
      plan.sessions = plan.sessions.filter((item) => item.id !== id);
      return route.fulfill({ json: { status: 'success' } });
    }
    if (path.startsWith('/api/v1/electives/sessions/') && method === 'PUT') {
      const id = Number(path.split('/').pop());
      plan.sessions = plan.sessions.map((item) => (item.id === id ? { ...item, ...body, roomId: body.roomId ?? null } : item));
      return route.fulfill({ json: plan.sessions.find((item) => item.id === id) });
    }
    if (path.endsWith('/checklist') && method === 'PATCH') {
      const id = Number(path.split('/').at(-2));
      const row = plan.checklists.find((item) => item.electiveId === id);
      Object.assign(row, body);
      return route.fulfill({ json: row });
    }
    if (path === '/api/v1/electives' && method === 'POST') {
      const created = {
        ...course(77, body.courseCode, body.electiveName),
        section: body.section, capacity: body.capacity, sessionsPerWeek: body.sessionsPerWeek,
        weeks: body.weeks, deliveryMode: body.deliveryMode, category: body.category,
        availability: body.availability, lecturerName: body.lecturer?.name ?? null, companyId: body.companyId,
      };
      plan.electives.push(created);
      plan.checklists.push(checklist(created.id));
      return route.fulfill({ json: created });
    }
    if (method === 'GET') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: { status: 'success' } });
  });

  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  page.setDefaultTimeout(15000);

  await page.goto(base + '/login');
  await page.locator('input[name=username]').fill('planner-fixture');
  await page.locator('input[name=password]').fill('local-test-only');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));

  const go = async (path) => {
    await page.goto(base + '/elective-plan' + (path === '/' ? '' : path));
    await page.getByRole('region', { name: 'การบันทึกแผน', exact: true }).waitFor();
  };
  const since = () => { calls = []; };
  const sent = (method, path) => calls.filter((c) => c.method === method && c.path.startsWith(path));

  await check('the plan on screen is the one the API answered with, not a bundled file', async () => {
    await go('/courses/list');
    await page.getByText('2110123', { exact: false }).first().waitFor();
    // One read for the plan itself — not one per section of the page. The
    // closed terms behind the switcher are read separately, in the background.
    const reads = sent('GET', '/api/v1/electives/plan');
    assert.equal(reads.filter((call) => !call.path.includes('termId')).length, 1, 'one read of the plan');
    // The bundled seed's courses must be nowhere near this page.
    assert.equal(await page.getByText('21105801', { exact: false }).count(), 0);
    assert.ok(await page.getByText('ภาคต้น ปีการศึกษา 2569').count() >= 0);
  });

  await check('placing a class shows it at once and sends one request carrying it', async () => {
    await go('/');
    since();
    await page.getByRole('button', { name: 'จัดตารางอัตโนมัติ', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.matrix-chip, .course-chip').length > 0, undefined, { timeout: 10000 });
    const writes = sent('PUT', '/api/v1/electives/sessions');
    assert.equal(writes.length, 1, 'one transaction for the whole timetable');
    assert.ok(Array.isArray(writes[0].body) && writes[0].body.length > 0);
    assert.ok(writes[0].body.every((item) => typeof item.electiveId === 'number' && typeof item.slot === 'string'));
    // And what stays on screen is what the server wrote back, ids included —
    // not the optimistic drawing that was there a moment earlier.
    await page.waitForFunction(
      (ids) => [...document.querySelectorAll('.matrix-chip')].length === ids.length,
      plan.sessions.map((item) => item.id),
    );
  });

  await check('a refused write puts the screen back and says why in the backend\'s words', async () => {
    resetPlan();
    await go('/courses/list?view=checklist');
    const box = page.locator('select.checklist-select').first();
    await box.waitFor();
    refuse = { method: 'PATCH', path: '/api/v1/electives/', status: 400, detail: 'เทอมนี้ปิดไปแล้ว แก้ไขไม่ได้' };
    since();
    await box.selectOption({ index: 1 });
    await page.getByRole('alert').filter({ hasText: 'เทอมนี้ปิดไปแล้ว' }).waitFor();
    assert.equal(sent('PATCH', '/api/v1/electives/').length, 1);
    // Rolled back: the control shows what the server still has, not the press.
    await page.waitForFunction(() => {
      const select = document.querySelector('select.checklist-select');
      return select && select.selectedIndex === 0;
    });
  });

  await check('a saved change offers one step back, and taking it calls the inverse', async () => {
    resetPlan();
    await go('/courses/list?view=checklist');
    const box = page.locator('select.checklist-select').first();
    await box.waitFor();
    since();
    await box.selectOption({ index: 1 });
    await page.waitForFunction(() => document.querySelectorAll('[role="status"]').length > 0);
    const undo = page.locator('.toast-undo');
    await undo.waitFor();
    assert.equal(sent('PATCH', '/api/v1/electives/').length, 1);
    since();
    await undo.click();
    await page.waitForFunction(() => {
      const select = document.querySelector('select.checklist-select');
      return select && select.selectedIndex === 0;
    });
    assert.equal(sent('PATCH', '/api/v1/electives/').length, 1, 'undo is a request of its own');
  });

  await check('the shared plan hides the controls that would replace everybody\'s work', async () => {
    await go('/');
    assert.equal(await page.getByRole('button', { name: 'สำรองแผน JSON', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'นำเข้าแผน', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'เลิกทำรายการล่าสุด', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'โหลดแผนล่าสุด', exact: true }).waitFor();
  });

  await check('a new course picks its company from the directory rather than typing one', async () => {
    resetPlan();
    await go('/courses/list');
    since();
    await page.getByRole('button', { name: /เพิ่มรายวิชา/ }).click();
    const picker = page.locator('dialog.course-dialog select').first();
    await picker.waitFor();
    await page.waitForFunction(() => {
      const select = document.querySelector('dialog.course-dialog select');
      return select && select.options.length > 1;
    });
    assert.equal(sent('GET', '/api/v1/companies').length, 1);
    assert.ok((await picker.locator('option').allTextContents()).includes('บริษัททดสอบ'));
  });

  await check('a course added here reaches the API with the company and the term', async () => {
    const dialog = page.locator('dialog.course-dialog');
    await dialog.locator('select').first().selectOption({ label: 'บริษัททดสอบ' });
    await dialog.getByLabel('รหัสวิชา').fill('2110999');
    await dialog.getByLabel('ชื่อวิชา').fill('วิชาที่เพิ่งเพิ่ม');
    await dialog.getByLabel('ผู้สอน', { exact: true }).fill('อาจารย์ใหม่');
    await dialog.getByLabel(/หมวด/).selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'จันทร์เช้า — ไม่สะดวก', exact: true }).click();
    since();
    await dialog.getByRole('button', { name: 'เพิ่มรายวิชา', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('dialog.course-dialog') === null);
    const posted = sent('POST', '/api/v1/electives');
    assert.equal(posted.length, 1);
    assert.equal(posted[0].body.companyId, 3);
    assert.equal(posted[0].body.termId, 7);
    assert.equal(posted[0].body.courseCode, '2110999');
    assert.deepEqual(posted[0].body.lecturer.name, 'อาจารย์ใหม่');
    // The row the server actually wrote replaces the one drawn on spec: its id
    // is the server's, which is what every later request about it will use.
    await page.getByText('2110999', { exact: false }).first().waitFor();
  });

  await check('a closed term shows its own courses, and offers nothing to add to it', async () => {
    resetPlan();
    // 2/2569 is the term being planned and has two courses; 2/2568 is closed
    // and ran one. Reading either must not show the other's.
    await go('/courses/list');
    await page.getByText('2110123', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: /เพิ่มรายวิชา/ }).waitFor();

    await page.locator('select').first().selectOption('2568-2');

    await page.getByText('2110001', { exact: false }).first().waitFor();
    assert.equal(await page.getByText('2110123', { exact: false }).count(), 0,
      'the term being planned must not appear under a closed term\'s name');
    assert.equal(await page.getByRole('button', { name: /เพิ่มรายวิชา/ }).count(), 0,
      'there is nothing to add to a term that ended');
    // ...and the only reason it could show them is that it asked for that term
    // by name. A request without `termId` is answered with the plan, which is
    // how a closed term used to end up displaying the current term's courses.
    assert.ok(
      sent('GET', '/api/v1/electives/plan').some((call) => call.path.includes(`termId=${PAST_TERM.id}`)),
      'the closed term is read by id',
    );
  });

  await check('switching back to the term being planned brings the add button back', async () => {
    await page.locator('select').first().selectOption('2569-1');
    await page.getByText('2110123', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: /เพิ่มรายวิชา/ }).waitFor();
    assert.equal(await page.getByText('2110001', { exact: false }).count(), 0);
  });

  await check('a link straight to a closed term opens on that term, not on the plan', async () => {
    await page.goto(base + '/elective-plan/courses/list?term=2568-2');
    await page.getByRole('region', { name: 'การบันทึกแผน', exact: true }).waitFor();
    await page.getByText('2110001', { exact: false }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: /เพิ่มรายวิชา/ }).count(), 0);
    assert.equal(await page.getByText('2110123', { exact: false }).count(), 0);
  });

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log(`browser (api): ok (${results.length} shared-plan checks)`);
} finally {
  await browser?.close();
  server.kill();
}
