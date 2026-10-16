import { isSlotId, slotRank, type SlotId } from "./slots.ts";
import type { Contact, DeliveryMode, PlanCourse } from "./plan-types.ts";

/**
 * The course list as a person edits it: the bundled courses, plus the ones they
 * typed in, minus the ones they took out, with their corrections laid over the
 * rest.
 *
 * Courses used to be a fixed fact from `data/plan-courses.json`, which was true
 * only for as long as nobody was using the planner for a real term. A company
 * offers a course in the middle of August, another withdraws one a week later,
 * and a list that can only be corrected by a deployment is a list somebody
 * keeps a spreadsheet beside. So edits live next to the seed rather than in it
 * — the file stays the department's shared starting point, and "คืนค่าเริ่มต้น"
 * is always a way back to it.
 *
 * This is deliberately the same shape as `lib/rooms.ts`, down to the routing in
 * `patchCourse`: the two lists answer the same question about ownership, and
 * one of them having a second answer is how the two drift apart.
 *
 * Everything here is a pure function over that state, so the rules can be
 * tested without a browser — see scripts/elective-plan/check-courses.mjs.
 */

/**
 * A correction to one course.
 *
 * Every field but the id, because a course is a fact a person was told on the
 * phone and any of it can be wrong: the company renames the course, sends a
 * different lecturer, moves it online. The id is the one thing that is the
 * app's rather than theirs — assignments and checklists are keyed by it.
 */
export type CourseOverride = Partial<Omit<PlanCourse, "id">>;

/**
 * Two pieces rather than one list, because they answer to different owners:
 * `added` is entirely a person's, `removed` is their correction *to the seed* —
 * which means a seeded course that changes in a later release still picks up
 * everything the person did not touch.
 */
export type CourseEdits = {
  added: PlanCourse[];
  removed: string[];
};

export const EMPTY_COURSE_EDITS: CourseEdits = { added: [], removed: [] };

/**
 * The half of the plan document that describes courses.
 *
 * `courseOverrides` predates `courseEdits` and keeps its place at the top of
 * the document so plans written by earlier versions still read; the functions
 * here take the pair because a correction has to land in exactly one of them.
 */
export type CourseState = {
  courseEdits: CourseEdits;
  courseOverrides: Record<string, CourseOverride>;
};

/** What the form collects. The id is not a person's to type. */
export type CourseDraft = Omit<PlanCourse, "id">;

export const DELIVERY_MODES: DeliveryMode[] = ["ON_SITE", "HYBRID", "ONLINE"];

export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  ON_SITE: "สอนที่ห้องเรียน",
  HYBRID: "ผสม (ใช้ห้องเรียน)",
  ONLINE: "ออนไลน์ (ไม่ใช้ห้อง)",
};

export const COURSE_CATEGORIES = [
  "วิศวกรรมซอฟต์แวร์",
  "ปัญญาประดิษฐ์และข้อมูล",
  "ความมั่นคงปลอดภัยไซเบอร์",
  "การวิเคราะห์ข้อมูล",
  "คลาวด์และ DevOps",
  "ผลิตภัณฑ์และ UX",
  "ธุรกิจและการจัดการ",
  "ระบบฝังตัวและ IoT",
] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

/** The week has 18 periods, so nothing can meet more often than that. */
const MAX_SESSIONS = 18;
const MAX_SECTION = 99;
const MAX_PEOPLE = 10000;
const MAX_WEEKS = 52;

const trimmed = (value: string | null | undefined): string => (value ?? "").trim();
const trimmedOrNull = (value: string | null | undefined): string | null => trimmed(value) || null;

/** Unique and in reading order, so two identical offers are stored identically. */
export function sortSlots(slots: SlotId[]): SlotId[] {
  return [...new Set(slots)].sort((a, b) => slotRank(a) - slotRank(b));
}

function readContact(contact: Contact | null | undefined): Contact | null {
  const name = trimmed(contact?.name);
  // A coordinator with no name is an email nobody can be asked about, so the
  // whole contact goes rather than half of one.
  if (!name) return null;
  return { name, email: trimmedOrNull(contact?.email), phone: trimmedOrNull(contact?.phone) };
}

export function courseDraftFrom(course: PlanCourse): CourseDraft {
  return {
    courseCode: course.courseCode,
    section: course.section,
    title: course.title,
    category: course.category,
    provider: course.provider,
    instructor: course.instructor,
    coordinator: course.coordinator ? { ...course.coordinator } : null,
    deliveryMode: course.deliveryMode,
    availability: [...course.availability],
    sessionsPerWeek: course.sessionsPerWeek,
    capacity: course.capacity,
    weeks: course.weeks,
    notes: course.notes,
  };
}

/** What gets stored: trimmed, de-duplicated and sorted, whatever was typed. */
export function normalizeCourseDraft(draft: CourseDraft): CourseDraft {
  return {
    courseCode: trimmed(draft.courseCode),
    section: draft.section,
    title: trimmed(draft.title),
    category: trimmed(draft.category),
    provider: trimmed(draft.provider),
    instructor: trimmed(draft.instructor),
    coordinator: readContact(draft.coordinator),
    deliveryMode: draft.deliveryMode,
    availability: sortSlots(draft.availability),
    sessionsPerWeek: draft.sessionsPerWeek,
    capacity: draft.capacity,
    weeks: draft.weeks,
    notes: trimmedOrNull(draft.notes),
  };
}

const whole = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

/**
 * One message, or null — the same bargain as `validateRoomDraft`. A form with a
 * dozen fields that answers with a dozen problems is a wall of red; the reader
 * fixes one thing and the next one appears if it is still wrong.
 *
 * The rules are the ones `readCourse` in lib/plan-data.ts enforces on the seed
 * file, said in Thai instead of thrown at build time. A course somebody types
 * has to be as sound as one the department shipped, or the scheduler meets a
 * course it cannot reason about.
 */
export function validateCourseDraft(draft: CourseDraft, courses: PlanCourse[], editingId?: string): string | null {
  const next = normalizeCourseDraft(draft);
  if (!next.courseCode) return "ต้องมีรหัสวิชา";
  if (!next.title) return "ต้องมีชื่อวิชา";
  // รหัสเดียวกันคนละตอนเรียนคือคนละวิชา - ซ้ำได้เฉพาะรหัส+ตอนพร้อมกัน
  const clash = courses.find(
    (course) => course.id !== editingId
      && course.courseCode.trim().toLowerCase() === next.courseCode.toLowerCase()
      && course.section === next.section,
  );
  if (clash) return `มีวิชารหัส ${next.courseCode} ตอน ${next.section} อยู่แล้ว (${clash.title})`;
  // Company and lecturer are not paperwork: the scheduler refuses to put two
  // courses with the same lecturer, or the same company, in one period. Left
  // blank they would all read as one very busy lecturer called "".
  if (!next.provider) return "ต้องระบุบริษัทผู้สอน";
  if (!next.instructor) return "ต้องระบุชื่อผู้สอน";
  if (!next.category) return "ต้องระบุหมวดของวิชา";
  if (!DELIVERY_MODES.includes(next.deliveryMode)) return "รูปแบบการสอนไม่ถูกต้อง";
  if (!whole(next.section, 1, MAX_SECTION)) return `ตอนเรียนต้องเป็นจำนวนเต็ม 1–${MAX_SECTION}`;
  if (!whole(next.sessionsPerWeek, 1, MAX_SESSIONS)) return `จำนวนคาบต่อสัปดาห์ต้องเป็นจำนวนเต็ม 1–${MAX_SESSIONS}`;
  if (!whole(next.weeks, 1, MAX_WEEKS)) return `จำนวนสัปดาห์ต้องเป็นจำนวนเต็ม 1–${MAX_WEEKS}`;
  if (!whole(next.capacity, 0, MAX_PEOPLE)) return `จำนวนที่รับต้องเป็นจำนวนเต็ม 0–${MAX_PEOPLE}`;
  if (next.availability.some((slot) => !isSlotId(slot))) return "มีช่วงเวลาที่ระบบไม่รู้จัก";
  if (next.availability.length < next.sessionsPerWeek) {
    return `วิชานี้ต้องได้ ${next.sessionsPerWeek} คาบต่อสัปดาห์ จึงต้องเลือกช่วงที่สะดวกอย่างน้อย ${next.sessionsPerWeek} ช่วง (ตอนนี้เลือก ${next.availability.length})`;
  }
  if (next.coordinator?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.coordinator.email)) {
    return "อีเมลผู้ประสานงานไม่ถูกต้อง";
  }
  return null;
}

/**
 * An id from the course code, ASCII only, `plan-` in front like the seed's.
 *
 * The code is what a reader would call the course anyway, and it is already
 * ASCII on every form the department uses. The prefix keeps an id from reading
 * like a bare number in an export or a URL, and the counter is there for the
 * case a code collides with something already taken — including a seeded course
 * that has been hidden and so is not in the visible list any more.
 */
export function makeCourseId(draft: CourseDraft, taken: Iterable<string>): string {
  const used = new Set(taken);
  const ascii = draft.courseCode
    .replace(/[^\x20-\x7e]+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // ตอนเรียนอยู่ในรหัสตั้งแต่ตอนที่สอง: ตอนแรกคือกรณีปกติ และ id ที่ลงท้าย
  // ด้วย -1 ทุกวิชาอ่านเหมือนเลขรันมากกว่าเลขตอน
  const suffix = draft.section > 1 ? `-${draft.section}` : "";
  const base = ascii ? `plan-${ascii}${suffix}` : "plan-course";
  if (!used.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** The courses as they are now. Order: the seed's, then whatever was added. */
export function mergeCourses(seed: PlanCourse[], state: CourseState): PlanCourse[] {
  const removed = new Set(state.courseEdits.removed);
  const apply = (course: PlanCourse): PlanCourse => {
    const override = state.courseOverrides[course.id];
    return override ? { ...course, ...override } : course;
  };
  return [...seed.map(apply), ...state.courseEdits.added.map(apply)].filter((course) => !removed.has(course.id));
}

/** Every id the plan has ever spoken for, hidden seed courses included. */
export function takenCourseIds(seed: PlanCourse[], edits: CourseEdits): string[] {
  return [...seed.map((course) => course.id), ...edits.added.map((course) => course.id)];
}

export function isAddedCourse(edits: CourseEdits, courseId: string): boolean {
  return edits.added.some((course) => course.id === courseId);
}

export function addCourse(state: CourseState, draft: CourseDraft, taken: Iterable<string>): { state: CourseState; id: string } {
  const id = makeCourseId(draft, taken);
  const course: PlanCourse = { id, ...normalizeCourseDraft(draft) };
  return {
    state: { ...state, courseEdits: { ...state.courseEdits, added: [...state.courseEdits.added, course] } },
    id,
  };
}

/**
 * Patch a course, writing to whichever half of the state owns it.
 *
 * A course a person added is theirs outright, so the patch lands on the course
 * itself; a seeded course keeps its seed and collects an override. Writing an
 * override for an added course would work too, and would leave two records of
 * one course to disagree the first time either is edited — which is exactly
 * what would happen the first time somebody ticked a period for a course they
 * had typed in themselves.
 */
export function patchCourse(state: CourseState, courseId: string, patch: CourseOverride): CourseState {
  if (isAddedCourse(state.courseEdits, courseId)) {
    return {
      ...state,
      courseEdits: {
        ...state.courseEdits,
        added: state.courseEdits.added.map((course) => (course.id === courseId ? { ...course, ...patch } : course)),
      },
    };
  }
  return {
    ...state,
    courseOverrides: { ...state.courseOverrides, [courseId]: { ...(state.courseOverrides[courseId] ?? {}), ...patch } },
  };
}

/**
 * Remove a course. An added course is forgotten; a seeded one is hidden.
 *
 * Hiding rather than deleting is what makes the seed file the shared truth: a
 * person who drops a course they should not have gets it back from "คืนค่า
 * เริ่มต้น", and the next person to open the app on another machine still sees
 * the department's own list.
 */
export function deleteCourse(state: CourseState, courseId: string): CourseState {
  const courseOverrides = { ...state.courseOverrides };
  delete courseOverrides[courseId];
  const { added, removed } = state.courseEdits;
  if (isAddedCourse(state.courseEdits, courseId)) {
    return { courseOverrides, courseEdits: { added: added.filter((course) => course.id !== courseId), removed } };
  }
  return {
    courseOverrides,
    courseEdits: { added, removed: removed.includes(courseId) ? removed : [...removed, courseId] },
  };
}
