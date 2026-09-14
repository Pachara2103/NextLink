import assert from 'node:assert/strict';
import {
  blankState,
  placeholderId,
  reconcileCourse,
  reconcileRoom,
  reconcileSession,
  withChecklist,
  withCourses,
  withDocument,
  withRooms,
} from '../../src/features/elective-plan/lib/plan-state.ts';
import { readPlan, serverId } from '../../src/features/elective-plan/lib/plan-api.ts';

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log('  ✓ ' + name); }

const term = { id: 7, year: 2569, semester: 1, status: 'current', createdAt: null, updatedAt: null };
const elective = (over = {}) => ({
  id: 12, termId: 7, companyId: 3, companyTh: 'บริษัททดสอบ', companyEn: null,
  courseCode: '2110123', section: 1, electiveName: 'วิชาทดสอบ', category: 'เทคโนโลยี',
  deliveryMode: 'ON_SITE', capacity: 30, sessionsPerWeek: 1, weeks: 10,
  applicationFormUrl: null, courseSyllabusUrl: null, notes: null,
  lecturerId: 90, lecturerName: 'อาจารย์ทดสอบ', coordinatorId: null, coordinatorName: null,
  coordinatorEmail: null, coordinatorPhone: null, availability: ['MON_AM'],
  createdAt: null, updatedAt: null, ...over,
});
const room = (over = {}) => ({
  id: 4, name: '301', building: 'จุฬาพัฒน์ 14', floor: '3', seats: 40, seatsIsEstimated: false,
  tier: 'ready', isActive: true, blockedSlots: [], createdAt: null, updatedAt: null, ...over,
});
const session = (over = {}) => ({
  id: 55, electiveId: 12, termId: 7, slot: 'MON_AM', roomId: 4, startTime: '09:00:00',
  endTime: '12:00:00', isLocked: false, source: 'manual', createdAt: null, updatedAt: null, ...over,
});

function loaded() {
  const read = readPlan({ term, rooms: [room()], electives: [elective()], sessions: [], checklists: [] });
  return { payload: read.payload, document: { ...blankState().document, assignments: [], checklists: {} }, index: read.index };
}

check('an unread plan is empty rather than undefined, so a first paint has something to draw', () => {
  const state = blankState();
  assert.deepEqual(state.payload.courses, []);
  assert.deepEqual(state.payload.rooms, []);
  assert.deepEqual(state.document.assignments, []);
  assert.equal(state.index.termId, 0);
  // The three edit maps exist and stay empty on this path — `effective()` reads
  // them on every render and must not have to guard.
  assert.deepEqual(state.document.courseEdits, { added: [], removed: [] });
  assert.deepEqual(state.document.courseOverrides, {});
});

check('each `with*` replaces one part and shares the rest', () => {
  const state = loaded();
  const next = withDocument(state, { assignments: [{ id: 'x' }] });
  assert.equal(next.payload, state.payload, 'facts are untouched by a decision');
  assert.equal(next.document.checklists, state.document.checklists);
  assert.notEqual(next.document, state.document);
  assert.equal(withCourses(state, []).payload.rooms, state.payload.rooms);
  assert.equal(withRooms(state, []).payload.courses, state.payload.courses);
});

check('a checklist patch touches one course and one field', () => {
  const state = withChecklist(loaded(), '12', { mcvJoinCode: 'ABC' });
  assert.deepEqual(state.document.checklists, { 12: { mcvJoinCode: 'ABC' } });
  const again = withChecklist(state, '12', { createMcv: 'DONE' });
  assert.deepEqual(again.document.checklists['12'], { mcvJoinCode: 'ABC', createMcv: 'DONE' });
  assert.deepEqual(withChecklist(again, '13', { createMcv: 'DONE' }).document.checklists['12'], {
    mcvJoinCode: 'ABC', createMcv: 'DONE',
  });
});

check('a placed period takes the id the server gave it, matched by course and period', () => {
  const optimistic = { id: '12:session:1', courseId: '12', slotId: 'MON_AM', roomId: '4', startTime: '09:00', endTime: '12:00', locked: false, source: 'MANUAL' };
  const other = { ...optimistic, id: '13:session:1', courseId: '13', slotId: 'WED_PM' };
  const state = withDocument(loaded(), { assignments: [other, optimistic] });
  const settled = reconcileSession(session())(state);
  assert.deepEqual(settled.document.assignments.map((item) => item.id), ['13:session:1', '55']);
  assert.equal(serverId(settled.document.assignments[1].id), 55);
  // The other course's period is the same object it was: nothing else moved.
  assert.equal(settled.document.assignments[0], other);
});

check('a period for a course that is no longer on screen changes nothing', () => {
  const state = withDocument(loaded(), { assignments: [] });
  assert.deepEqual(reconcileSession(session())(state).document.assignments, []);
});

check('a new course takes the server id, and its paperwork follows it', () => {
  const placeholder = placeholderId('course');
  const state = withDocument(
    withCourses(loaded(), [
      ...loaded().payload.courses,
      { id: placeholder, courseCode: '2110999', section: 1, title: 'ใหม่', category: 'x', provider: 'บริษัททดสอบ', instructor: 'อ.', coordinator: null, deliveryMode: 'ON_SITE', availability: ['MON_AM'], sessionsPerWeek: 1, capacity: 10, weeks: 10, notes: null },
    ]),
    { checklists: { [placeholder]: { createMcv: 'DONE' } } },
  );

  const settled = reconcileCourse(elective({ id: 77, courseCode: '2110999', electiveName: 'ใหม่', companyId: 3, lecturerId: 91, coordinatorId: 8 }))(state);
  const added = settled.payload.courses.find((course) => course.courseCode === '2110999');
  assert.equal(added.id, '77');
  assert.equal(added.title, 'ใหม่');
  // Paperwork ticked before the answer came back belongs to the same course.
  assert.deepEqual(settled.document.checklists, { 77: { createMcv: 'DONE' } });
  // And the ids the grid never shows are now known for it.
  assert.deepEqual(settled.index.courses.get('77'), { companyId: 3, lecturerId: 91, coordinatorId: 8 });
  // The course that was already there kept its own entry.
  assert.ok(settled.index.courses.has('12'));
});

check('two sections of one code are two courses, and only the right one is replaced', () => {
  const first = { id: 'a', courseCode: '2110999', section: 1, title: 'ตอนหนึ่ง', category: 'x', provider: 'p', instructor: 'i', coordinator: null, deliveryMode: 'ON_SITE', availability: ['MON_AM'], sessionsPerWeek: 1, capacity: 10, weeks: 10, notes: null };
  const second = { ...first, id: 'b', section: 2, title: 'ตอนสอง' };
  const state = withCourses(loaded(), [first, second]);
  const settled = reconcileCourse(elective({ id: 78, courseCode: '2110999', section: 2, electiveName: 'ตอนสอง' }))(state);
  assert.deepEqual(settled.payload.courses.map((course) => course.id), ['a', '78']);
});

check('a new room takes the server id, matched by building and name', () => {
  const placeholder = placeholderId('room');
  const state = withRooms(loaded(), [
    ...loaded().payload.rooms,
    { id: placeholder, name: 'ENG-201', building: 'วิศวฯ 4', floor: '2', seats: 80, seatsIsEstimated: true, tier: 'NEEDS_APPROVAL', blockedSlots: [] },
  ]);
  const settled = reconcileRoom(room({ id: 9, name: 'ENG-201', building: 'วิศวฯ 4', floor: '2', seats: 80, seatsIsEstimated: true, tier: 'needs_approval' }))(state);
  assert.deepEqual(settled.payload.rooms.map((item) => item.id), ['4', '9']);
  assert.equal(settled.payload.rooms[1].tier, 'NEEDS_APPROVAL');
});

check('a placeholder id is refused by the request builder rather than sent as NaN', () => {
  for (const kind of ['course', 'room', 'session']) {
    assert.throws(() => serverId(placeholderId(kind), 'วิชา'), /ยังไม่ได้บันทึกลงฐานข้อมูล/);
  }
  // ...and two drawn in the same millisecond are still two rows on screen.
  assert.notEqual(placeholderId('course'), placeholderId('room'));
});

console.log(`plan state: ok (${checks} checks)`);
