import { readChecklist, type CourseChecklist } from "./checklist.ts";
import { EMPTY_COURSE_EDITS, mergeCourses, type CourseEdits, type CourseOverride } from "./courses.ts";
import { EMPTY_ROOM_EDITS, mergeRooms, type RoomEdits } from "./rooms.ts";
import { isSlotId, isTimeRange } from "./slots.ts";
import type { Assignment, PlanCourse, PlanPayload, PlanRoom } from "./plan-types.ts";

export const LEGACY_STORAGE_KEY = "nextlink.plan.v1";
// Versions 1/2 did not record a term; they were shipped for this term only.
export const LEGACY_TERM_ID = "2569-1";
export const storageKeyFor = (termId: string) => `nextlink.plan.v4.${termId}`;
/**
 * Where an earlier release would have written this term's plan, newest first.
 *
 * Version 4 added courses a person typed in themselves, so a v3 document is a
 * v4 document with none of them — it is read, shown, and written back under the
 * new key the first time anything is saved. Reading the old key rather than
 * renaming it means a browser that still has an older build open in another tab
 * keeps working from the plan it already knows.
 */
export const legacyKeysFor = (termId: string): string[] => [
  `nextlink.plan.v3.${termId}`,
  ...(termId === LEGACY_TERM_ID ? [LEGACY_STORAGE_KEY] : []),
];
export type { CourseOverride };
export type PlanData = {
  assignments: Assignment[];
  courseOverrides: Record<string, CourseOverride>;
  courseEdits: CourseEdits;
  roomEdits: RoomEdits;
  checklists: Record<string, Partial<CourseChecklist>>;
};
export type PlanDocument = PlanData & {
  version: 4;
  termId: string;
  dataset: string;
  seedRevision: string;
  revision: number;
  editedAt: string | null;
};

export const emptyPlanData = (): PlanData => ({ assignments: [], courseOverrides: {}, courseEdits: EMPTY_COURSE_EDITS, roomEdits: EMPTY_ROOM_EDITS, checklists: {} });
export const emptyDocument = (payload: PlanPayload): PlanDocument => ({
  ...emptyPlanData(), version: 4, termId: payload.term.id, dataset: payload.dataset,
  seedRevision: payload.seedRevision, revision: 0, editedAt: null,
});

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === "string"; }
function count(value: unknown, min = 0, max = 10000): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
function slots(value: unknown): boolean {
  return Array.isArray(value) && value.every((slot) => string(slot) && isSlotId(slot)) && new Set(value).size === value.length;
}
function blockedSlots(value: unknown): boolean {
  return Array.isArray(value) && value.every((slot) => object(slot) && string(slot.slotId) && isSlotId(slot.slotId) && string(slot.reason))
    && new Set(value.map((slot) => slot.slotId)).size === value.length;
}
function roomPatch(value: unknown, full = false): boolean {
  if (!object(value)) return false;
  if (full && (!string(value.id) || !/^[a-z0-9-]+$/.test(value.id))) return false;
  for (const key of ["name", "building", "floor"])
    if ((full || key in value) && (!string(value[key]) || !value[key].trim())) return false;
  if ((full || "seats" in value) && !count(value.seats, 1, 2000)) return false;
  if ((full || "tier" in value) && value.tier !== "READY" && value.tier !== "NEEDS_APPROVAL") return false;
  if ((full || "seatsIsEstimated" in value) && typeof value.seatsIsEstimated !== "boolean") return false;
  if ((full || "blockedSlots" in value) && !blockedSlots(value.blockedSlots)) return false;
  return Object.keys(value).every((key) => ["name", "building", "floor", "seats", "tier", "seatsIsEstimated", "blockedSlots", ...(full ? ["id"] : [])].includes(key));
}
function contact(value: unknown): boolean {
  if (value === null) return true;
  return object(value) && string(value.name) && Boolean(value.name.trim())
    && (value.email === null || string(value.email)) && (value.lineId === null || string(value.lineId))
    && Object.keys(value).every((key) => ["name", "email", "lineId"].includes(key));
}
const COURSE_TEXT_FIELDS = ["courseCode", "title", "category", "provider", "instructor"];
// minSeats ไม่ใช่ฟิลด์ของวิชาอีกแล้ว (capacity ตัวเดียวจบ) แต่ยังรับไว้ให้แผนที่
// บันทึกไว้ก่อนหน้าเปิดได้ แล้ว readStoredCourse ทิ้งค่านั้นตอนอ่านเข้ามา
const COURSE_FIELDS = [...COURSE_TEXT_FIELDS, "section", "coordinator", "deliveryMode", "availability", "sessionsPerWeek", "minSeats", "capacity", "weeks", "notes"];
/**
 * One course, or a correction to one. `full` is a course a person typed in, so
 * every field has to be there; without it this is a patch and only the keys
 * present are checked — the same two-in-one shape as `roomPatch` above.
 */
/**
 * วิชาหนึ่งแถวอย่างที่เก็บอยู่จริง เติมค่าที่เพิ่งมีทีหลังและทิ้งค่าที่เลิกใช้
 * ไปแล้ว - แผนที่คนเก็บไว้ตั้งแต่รุ่นก่อนจึงยังเปิดได้ และสิ่งที่ไหลเข้าไปถึง
 * React มีรูปเดียวเสมอ
 */
function readStoredCourse(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { section: 1, ...value };
  delete next.minSeats;
  return next;
}

function coursePatch(value: unknown, full = false): boolean {
  if (!object(value)) return false;
  if (full && (!string(value.id) || !/^[a-z0-9-]+$/.test(value.id))) return false;
  for (const key of COURSE_TEXT_FIELDS)
    if ((full || key in value) && (!string(value[key]) || !value[key].trim())) return false;
  if ((full || "coordinator" in value) && !contact(value.coordinator)) return false;
  if ((full || "deliveryMode" in value) && !["ON_SITE", "HYBRID", "ONLINE"].includes(String(value.deliveryMode))) return false;
  if ((full || "availability" in value) && !slots(value.availability)) return false;
  if ((full || "sessionsPerWeek" in value) && !count(value.sessionsPerWeek, 1, 18)) return false;
  if ((full || "weeks" in value) && !count(value.weeks, 1, 52)) return false;
  // section และ minSeats ไม่บังคับแม้ใน full: แผนที่บันทึกก่อนมีตอนเรียนยังต้อง
  // เปิดได้ และแผนที่บันทึกตอนยังมี minSeats ก็เช่นกัน
  if ("section" in value && !count(value.section, 1, 99)) return false;
  if ("minSeats" in value && !count(value.minSeats)) return false;
  if ((full || "capacity" in value) && !count(value.capacity)) return false;
  if ((full || "notes" in value) && !(value.notes === null || string(value.notes))) return false;
  return Object.keys(value).every((key) => [...COURSE_FIELDS, ...(full ? ["id"] : [])].includes(key));
}

/** Runtime validation at the persistence boundary; no partial/unsafe casts reach React. */
export function decodePlan(raw: string, payload: PlanPayload): { document: PlanDocument; migrated: boolean } {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || ![1, 2, 3, 4].includes(value.version as number)) throw new Error("ไม่รู้จักรูปแบบไฟล์แผน");
  const legacy = value.version === 1 || value.version === 2;
  if (legacy && payload.term.id !== LEGACY_TERM_ID) throw new Error("แผนรุ่นเก่าเป็นของเทอม 2569-1");
  if (!legacy && (value.termId !== payload.term.id || value.dataset !== payload.dataset)) throw new Error("ไฟล์แผนนี้เป็นของคนละเทอมหรือชุดข้อมูล");
  if (!legacy && (!count(value.revision, 0, Number.MAX_SAFE_INTEGER) || !string(value.seedRevision))) throw new Error("ข้อมูลรุ่นของแผนไม่ถูกต้อง");
  if (value.editedAt !== null && value.editedAt !== undefined && (!string(value.editedAt) || !Number.isFinite(Date.parse(value.editedAt)))) throw new Error("วันที่บันทึกแผนไม่ถูกต้อง");
  if (!Array.isArray(value.assignments)) throw new Error("รายการคาบเรียนไม่ถูกต้อง");
  const courseOverrides = value.courseOverrides ?? {};
  // Absent before version 4, which is the whole of the migration: a plan made
  // before courses could be typed in is a plan with none added.
  const courseEdits = value.courseEdits ?? EMPTY_COURSE_EDITS;
  const edits = value.roomEdits ?? EMPTY_ROOM_EDITS;
  const checklists = value.checklists ?? {};
  if (!object(courseOverrides) || !Object.values(courseOverrides).every((patch) => coursePatch(patch))) throw new Error("ข้อมูลแก้ไขวิชาไม่ถูกต้อง");
  if (!object(courseEdits) || !Array.isArray(courseEdits.added) || !courseEdits.added.every((course) => coursePatch(course, true))
    || !Array.isArray(courseEdits.removed) || !courseEdits.removed.every(string)) throw new Error("ข้อมูลวิชาที่เพิ่มเองไม่ถูกต้อง");
  if (!object(edits) || !object(edits.overrides) || !Object.values(edits.overrides).every((value) => roomPatch(value))
    || !Array.isArray(edits.added) || !edits.added.every((value) => roomPatch(value, true))
    || !Array.isArray(edits.removed) || !edits.removed.every(string)) throw new Error("ข้อมูลแก้ไขห้องไม่ถูกต้อง");
  if (!object(checklists) || !Object.values(checklists).every(object)) throw new Error("ข้อมูลเช็กลิสต์ไม่ถูกต้อง");
  const rooms = mergeRooms(payload.rooms, edits as RoomEdits);
  const roomIds = new Set(rooms.map((room) => room.id));
  if (roomIds.size !== rooms.length) throw new Error("มีรหัสห้องซ้ำในแผน");
  const added = (courseEdits.added as Record<string, unknown>[]).map(readStoredCourse) as unknown as PlanCourse[];
  const overrides = Object.fromEntries(Object.entries(courseOverrides as Record<string, Record<string, unknown>>)
    .map(([id, patch]) => {
      const next = { ...patch };
      delete next.minSeats;
      return [id, next];
    })) as Record<string, CourseOverride>;
  const knownCourses = new Set([...payload.courses, ...added].map((course) => course.id));
  if (knownCourses.size !== payload.courses.length + added.length) throw new Error("มีรหัสวิชาซ้ำกับวิชาเดิมในแผน");
  const edited: CourseEdits = { added, removed: courseEdits.removed as string[] };
  const courses = new Map(mergeCourses(payload.courses, {
    courseEdits: edited, courseOverrides: overrides,
  }).map((course) => [course.id, course]));
  const ids = new Set<string>(), sessions = new Set<string>();
  for (const item of value.assignments) {
    if (!object(item) || !string(item.id) || !item.id || !string(item.courseId) || !courses.has(item.courseId)
      || !string(item.slotId) || !isSlotId(item.slotId) || !isTimeRange(item.startTime, item.endTime)
      || typeof item.locked !== "boolean" || !["MANUAL", "AUTO"].includes(String(item.source))
      || !(item.roomId === null || (string(item.roomId) && roomIds.has(item.roomId)))) throw new Error("มีคาบที่อ้างอิงวิชา ห้อง หรือเวลาไม่ถูกต้อง");
    if (courses.get(item.courseId)?.deliveryMode === "ONLINE" && item.roomId !== null) throw new Error("คาบออนไลน์ไม่ควรใช้ห้องเรียน");
    // Legacy roomless onsite decisions remain visible with NO_ROOM_AVAILABLE;
    // commands refuse new ones, and the user can move/recover existing work.
    const session = `${item.courseId}@${item.slotId}`;
    if (ids.has(item.id) || sessions.has(session)) throw new Error("มีคาบหรือรหัสคาบซ้ำในแผน");
    ids.add(item.id); sessions.add(session);
  }
  // Removed seed references require explicit recovery rather than silently
  // throwing away work after a deployment changes the bundled facts. A course
  // the person hid is still "known", so hiding one does not invalidate the
  // paperwork already recorded against it.
  if (Object.keys(overrides).some((id) => !knownCourses.has(id)) || Object.keys(checklists).some((id) => !knownCourses.has(id))) throw new Error("แผนมีข้อมูลของวิชาที่ไม่อยู่ในชุดข้อมูลปัจจุบัน");
  const knownRooms = new Set([...payload.rooms, ...(edits.added as PlanRoom[])].map((room) => room.id));
  if (knownRooms.size !== payload.rooms.length + edits.added.length) throw new Error("มีรหัสห้องซ้ำกับห้องเดิมในแผน");
  if (Object.keys(edits.overrides).some((id) => !knownRooms.has(id))) throw new Error("แผนอ้างอิงห้องที่ถูกนำออกจากชุดข้อมูล");
  const document: PlanDocument = {
    ...emptyDocument(payload), assignments: value.assignments as Assignment[],
    courseOverrides: overrides, courseEdits: edited, roomEdits: edits as RoomEdits,
    checklists: Object.fromEntries(Object.entries(checklists).map(([id, value]) => [id, readChecklist(value as Partial<CourseChecklist>)])),
    revision: legacy ? 0 : value.revision as number,
    editedAt: string(value.editedAt) ? value.editedAt : null,
  };
  return { document, migrated: legacy || value.version !== 4 || value.seedRevision !== payload.seedRevision };
}
