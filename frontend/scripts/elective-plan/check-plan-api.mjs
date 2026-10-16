import assert from 'node:assert/strict';
import {
  checklistPatch,
  courseWrite,
  readPlan,
  readTerm,
  readTime,
  roomWrite,
  serverId,
  sessionWrite,
  sessionWriteFrom,
  termKey,
} from '../../src/features/elective-plan/lib/plan-api.ts';
import { courseDraftFrom, normalizeCourseDraft } from '../../src/features/elective-plan/lib/courses.ts';
import { roomDraftFrom } from '../../src/features/elective-plan/lib/rooms.ts';

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log('  ✓ ' + name); }

const term = (over = {}) => ({
  id: 7, year: 2569, semester: 1, status: 'current',
  createdAt: '2026-05-01T03:00:00Z', updatedAt: '2026-05-02T03:00:00Z', ...over,
});

const elective = (over = {}) => ({
  id: 12, termId: 7, companyId: 3, companyTh: 'บริษัททดสอบ', companyEn: 'Test Co',
  courseCode: '2110123', section: 2, electiveName: 'วิชาทดสอบ', category: 'เทคโนโลยี',
  deliveryMode: 'ON_SITE', capacity: 40, sessionsPerWeek: 1, weeks: 10,
  applicationFormUrl: null, courseSyllabusUrl: null, notes: '  ',
  lecturerId: 99, lecturerName: ' อาจารย์สมชาย ',
  coordinatorId: 100, coordinatorName: 'คุณนลิน', coordinatorEmail: ' narin@example.com ', coordinatorPhone: null,
  availability: ['WED_PM', 'MON_AM', 'MON_AM'],
  createdAt: '2026-05-03T03:00:00Z', updatedAt: '2026-05-09T03:00:00Z', ...over,
});

const room = (over = {}) => ({
  id: 4, name: '301', building: 'จุฬาพัฒน์ 14', floor: '3', seats: 40,
  seatsIsEstimated: false, tier: 'ready', isActive: true,
  blockedSlots: [{ slot: 'FRI_PM', reason: 'สอบ' }, { slot: 'TUE_AM', reason: 'งานคณะ' }],
  createdAt: null, updatedAt: null, ...over,
});

const session = (over = {}) => ({
  id: 55, electiveId: 12, termId: 7, slot: 'MON_AM', roomId: 4,
  startTime: '09:00:00', endTime: '12:00:00', isLocked: false, source: 'manual',
  createdAt: null, updatedAt: '2026-05-10T03:00:00Z', ...over,
});

const checklistRow = (over = {}) => ({
  electiveId: 12, inviteLetter: 'IN_PROGRESS', instructionLetter: 'NOT_RECEIVED',
  informLecturer: 'DONE', createMcv: 'NOT_DONE', inviteMentor: 'NOT_DONE',
  inviteLecturer: 'DONE', inviteStudents: 'NOT_DONE', mcvJoinCode: 'ABC123',
  createdAt: null, updatedAt: null, ...over,
});

const plan = (over = {}) => ({
  term: term(), rooms: [room()], electives: [elective()],
  sessions: [session()], checklists: [checklistRow()], ...over,
});

check('a term becomes the id, labels and status the planner already speaks', () => {
  assert.deepEqual(readTerm(term()), {
    id: '2569-1', academicYear: 2569, season: 'FIRST',
    label: 'ภาคต้น ปีการศึกษา 2569', shortLabel: '1/2569', status: 'CURRENT',
  });
  assert.equal(readTerm(term({ semester: 2, status: 'archived' })).status, 'ARCHIVED');
  assert.equal(readTerm(term({ semester: 2 })).label, 'ภาคปลาย ปีการศึกษา 2569');
  // ฤดูร้อนใช้ S ในคีย์ ไม่ใช่ 3 - URL กับคีย์ใน localStorage เขียนแบบนี้มาตั้งแต่แรก
  assert.equal(termKey(2569, 3), '2569-S');
  assert.equal(readTerm(term({ semester: 3 })).shortLabel, 'S/2569');
});

check('a course arrives with the names the grid shows, trimmed and in order', () => {
  const course = readPlan(plan()).payload.courses[0];
  assert.equal(course.id, '12');
  assert.equal(course.title, 'วิชาทดสอบ');
  assert.equal(course.provider, 'บริษัททดสอบ');
  assert.equal(course.instructor, 'อาจารย์สมชาย');
  assert.equal(course.section, 2);
  // ซ้ำถูกตัด และเรียงตามลำดับการอ่านตาราง
  assert.deepEqual(course.availability, ['MON_AM', 'WED_PM']);
  // ช่องว่างล้วนคือไม่มีหมายเหตุ ไม่ใช่หมายเหตุที่เป็นช่องว่าง
  assert.equal(course.notes, null);
  assert.deepEqual(course.coordinator, { name: 'คุณนลิน', email: 'narin@example.com', phone: null });
});

check('a company with only an English name still renders as something', () => {
  const only = readPlan(plan({ electives: [elective({ companyTh: null })] })).payload.courses[0];
  assert.equal(only.provider, 'Test Co');
  const neither = readPlan(plan({ electives: [elective({ companyTh: '  ', companyEn: null })] })).payload.courses[0];
  assert.equal(neither.provider, '');
});

check('a room keeps its tier and lists the periods it is taken for in week order', () => {
  const mapped = readPlan(plan()).payload.rooms[0];
  assert.equal(mapped.id, '4');
  assert.equal(mapped.tier, 'READY');
  assert.deepEqual(mapped.blockedSlots.map((block) => block.slotId), ['TUE_AM', 'FRI_PM']);
  const other = readPlan(plan({ rooms: [room({ tier: 'needs_approval', blockedSlots: undefined })] })).payload.rooms[0];
  assert.equal(other.tier, 'NEEDS_APPROVAL');
  assert.deepEqual(other.blockedSlots, []);
});

check('a period loses the seconds the column carries and nothing else', () => {
  const placed = readPlan(plan()).assignments[0];
  assert.deepEqual(placed, {
    id: '55', courseId: '12', slotId: 'MON_AM', roomId: '4',
    startTime: '09:00', endTime: '12:00', locked: false, source: 'MANUAL',
  });
  assert.equal(readTime('13:05:59'), '13:05');
  const online = readPlan(plan({ sessions: [session({ roomId: null, isLocked: true, source: 'auto' })] })).assignments[0];
  assert.equal(online.roomId, null);
  assert.equal(online.locked, true);
  assert.equal(online.source, 'AUTO');
});

check('the checklist columns land on the boxes the table draws', () => {
  const read = readPlan(plan()).checklists['12'];
  assert.deepEqual(read, {
    invitationLetter: 'IN_PROGRESS', teachingHoursLetter: 'NOT_RECEIVED',
    mcvInstructorRequest: 'DONE', mcvCourseCreated: 'NOT_DONE',
    mentorAdded: 'NOT_DONE', guestLecturerAdded: 'DONE',
    mcvJoinCode: 'ABC123', studentsAdded: 'NOT_DONE',
  });
  // และกลับทางได้ครบทุกช่อง ไม่ใช่แค่ช่องที่นึกออก
  const back = checklistPatch(read);
  assert.deepEqual(back, {
    inviteLetter: 'IN_PROGRESS', instructionLetter: 'NOT_RECEIVED',
    informLecturer: 'DONE', createMcv: 'NOT_DONE', inviteMentor: 'NOT_DONE',
    inviteLecturer: 'DONE', inviteStudents: 'NOT_DONE', mcvJoinCode: 'ABC123',
  });
  assert.equal(Object.keys(back).length, Object.keys(read).length);
});

check('a patch carries only the box that was pressed', () => {
  assert.deepEqual(checklistPatch({ mcvCourseCreated: 'DONE' }), { createMcv: 'DONE' });
  // ล้างรหัส join เป็นค่าว่างคือการแก้ ไม่ใช่การไม่ส่ง
  assert.deepEqual(checklistPatch({ mcvJoinCode: '' }), { mcvJoinCode: '' });
  assert.deepEqual(checklistPatch({}), {});
});

check('one read gives a plan whose parts point at each other', () => {
  const read = readPlan(plan());
  assert.equal(read.payload.term.id, '2569-1');
  assert.equal(read.payload.isMock, false);
  // อัปเดตล่าสุด = แถวที่ใหม่ที่สุด ไม่ใช่เวลาที่โหลด
  assert.equal(read.payload.lastUpdated, '2026-05-10T03:00:00Z');
  const ids = new Set(read.payload.courses.map((course) => course.id));
  assert.ok(read.assignments.every((item) => ids.has(item.courseId)));
  assert.deepEqual(Object.keys(read.checklists), ['12']);
  assert.deepEqual(read.index.courses.get('12'), { companyId: 3, lecturerId: 99, coordinatorId: 100 });
  assert.equal(read.index.termId, 7);
});

check('an empty term reads as an empty plan rather than a crash', () => {
  const read = readPlan({ term: term() });
  assert.deepEqual(read.payload.courses, []);
  assert.deepEqual(read.payload.rooms, []);
  assert.deepEqual(read.assignments, []);
  assert.deepEqual(read.checklists, {});
  assert.equal(typeof read.payload.lastUpdated, 'string');
});

check('an id the database never issued is refused by name, not sent as NaN', () => {
  assert.equal(serverId('12'), 12);
  for (const bad of ['plan-2110123', '', 'NaN', '0', '-3', '1.5']) {
    assert.throws(() => serverId(bad, 'วิชา'), /วิชานี้ยังไม่ได้บันทึกลงฐานข้อมูล/, bad);
  }
});

check('a filled-in course form becomes a body the API accepts', () => {
  const course = readPlan(plan()).payload.courses[0];
  const body = courseWrite(normalizeCourseDraft(courseDraftFrom(course)), {
    companyId: 3, termId: 7, lecturerId: 99, coordinatorId: 100,
  });
  assert.equal(body.courseCode, '2110123');
  assert.equal(body.electiveName, 'วิชาทดสอบ');
  assert.equal(body.companyId, 3);
  assert.equal(body.termId, 7);
  assert.deepEqual(body.availability, ['MON_AM', 'WED_PM']);
  assert.deepEqual(body.lecturer, { id: 99, name: 'อาจารย์สมชาย', email: null, phone: null });
  assert.deepEqual(body.coordinator, { id: 100, name: 'คุณนลิน', email: 'narin@example.com', phone: null });
  assert.equal(body.notes, null);
});

check('a course with no coordinator sends null, and a new one sends no ids', () => {
  const course = readPlan(plan({ electives: [elective({ coordinatorName: null, coordinatorId: null })] })).payload.courses[0];
  const body = courseWrite(normalizeCourseDraft(courseDraftFrom(course)), { companyId: 3 });
  assert.equal(body.coordinator, null);
  assert.equal(body.termId, null, 'ไม่ส่ง term = เทอมที่กำลังจัดอยู่');
  // ไม่มี id แปลว่า "หาจากชื่อ แล้วสร้างให้ถ้ายังไม่มี" ซึ่งคือสิ่งที่ตั้งใจ
  assert.deepEqual(body.lecturer, { id: null, name: 'อาจารย์สมชาย', email: null, phone: null });
});

check('a room form is sent without touching the periods it is taken for', () => {
  const mapped = readPlan(plan()).payload.rooms[0];
  const full = roomWrite(mapped);
  assert.equal(full.tier, 'ready');
  assert.deepEqual(full.blockedSlots, [
    { slot: 'TUE_AM', reason: 'งานคณะ' }, { slot: 'FRI_PM', reason: 'สอบ' },
  ]);
  // ฟอร์มแก้ห้องไม่มีช่อง "คาบที่ติดงานอื่น" - ส่งไปเป็นชุดว่างไม่ได้แปลว่าล้าง
  const fromForm = roomWrite(roomDraftFrom(mapped));
  assert.deepEqual(fromForm.blockedSlots, []);
  assert.equal(fromForm.seats, 40);
  assert.equal(roomWrite({ ...roomDraftFrom(mapped), tier: 'NEEDS_APPROVAL' }).tier, 'needs_approval');
});

check('placing a period asks for the period bounds; a retime sends the times', () => {
  const fresh = sessionWrite({ courseId: '12', slotId: 'WED_PM', roomId: '4' });
  assert.deepEqual(fresh, {
    electiveId: 12, slot: 'WED_PM', roomId: 4,
    startTime: null, endTime: null, isLocked: false, source: 'manual',
  });
  assert.equal(sessionWrite({ courseId: '12', slotId: 'WED_PM', roomId: null }).roomId, null);
  assert.equal(sessionWrite({ courseId: '12', slotId: 'WED_PM', roomId: '4', source: 'AUTO' }).source, 'auto');
});

check('moving to another period drops custom times, moving room keeps them', () => {
  const placed = { ...readPlan(plan()).assignments[0], startTime: '09:30', endTime: '11:30' };
  const movedRoom = sessionWriteFrom(placed, { roomId: '9' });
  assert.equal(movedRoom.roomId, 9);
  assert.equal(movedRoom.startTime, '09:30', 'เปลี่ยนห้องอย่างเดียวไม่ควรลบเวลาที่ตั้งเอง');
  const movedSlot = sessionWriteFrom(placed, { slotId: 'WED_PM' });
  assert.equal(movedSlot.slot, 'WED_PM');
  assert.equal(movedSlot.startTime, null, 'ย้ายคาบแล้วเวลากลับไปเป็นขอบคาบใหม่');
  assert.equal(sessionWriteFrom(placed, { locked: true }).isLocked, true);
  assert.equal(sessionWriteFrom(placed).startTime, '09:30');
});

check('an unknown period from the server is named, not drawn nowhere', () => {
  assert.throws(() => readPlan(plan({ electives: [elective({ availability: ['WED_MORNING'] })] })), /ไม่รู้จักคาบ/);
  assert.throws(() => readPlan(plan({ sessions: [session({ slot: 'SUN_AM' })] })), /ไม่รู้จัก/);
  // ห้องต่างออกไป: คาบที่อ่านไม่ออกคือคำเตือนที่ลบออกได้ ไม่ใช่แผนที่เปิดไม่ได้
  const survived = readPlan(plan({ rooms: [room({ blockedSlots: [{ slot: 'NOPE', reason: 'x' }, { slot: 'MON_PM', reason: 'ซ่อม' }] })] }));
  assert.deepEqual(survived.payload.rooms[0].blockedSlots, [{ slotId: 'MON_PM', reason: 'ซ่อม' }]);
});

console.log(`plan api: ok (${checks} checks)`);
