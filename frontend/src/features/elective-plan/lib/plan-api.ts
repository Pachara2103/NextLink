/**
 * The one translator between the API's words and the planner's.
 *
 * Two vocabularies describe the same plan. The API says `Elective`, `companyId`
 * and `slot`, with numeric ids, because that is what the tables say. The
 * planner says `PlanCourse`, `provider` and `slotId`, with string ids, because
 * that is what the grid, the scheduler and the export were written against —
 * and rewriting those to speak SQL would mean the day the backend renames a
 * column, every component changes.
 *
 * So the border is here, and it is the only place both words appear. Anything
 * that leaks past it (a `companyId` in a component, a `provider` in a request
 * body) is a bug in this file, not in the caller.
 *
 * Three things are not a rename and are worth knowing about:
 *
 * - **ids.** The database counts in integers; every domain id in this app is a
 *   string. `String(id)` one way, `serverId` the other, which refuses anything
 *   that is not a plain positive integer rather than sending `NaN` to a route.
 * - **the ids a course has that the grid never shows.** A `PlanCourse` has a
 *   provider *name*; writing one back needs `companyId`, `lecturerId` and
 *   `coordinatorId`. Rather than hang three invisible numbers off every course
 *   for the sake of the few writes that need them, `readPlan` returns them
 *   beside the payload in a `PlanIndex`.
 * - **time.** Postgres answers "13:30:00"; the pickers and every comparison in
 *   `slots.ts` use "13:30".
 */

import type {
  Elective,
  ElectiveChecklist,
  ElectiveChecklistUpdate,
  ElectivePerson,
  ElectivePlan,
  ElectiveRoom,
  ElectiveRoomWrite,
  ElectiveSession,
  ElectiveSessionWrite,
  ElectiveSlot,
  ElectiveTerm,
  ElectiveWrite,
} from "@/types";
import type { CourseChecklist } from "./checklist.ts";
import type { CourseDraft } from "./courses.ts";
import type { RoomDraft } from "./rooms.ts";
import type {
  ArchivedTerm,
  Assignment,
  Contact,
  PlanCourse,
  PlanPayload,
  PlanRoom,
  TermMeta,
  TermSeason,
} from "./plan-types.ts";
import { isSlotId, slotRank, type SlotId } from "./slots.ts";

/* ------------------------------------------------------------------ *
 * ids
 * ------------------------------------------------------------------ */

/**
 * The database's id for something the planner knows by a string.
 *
 * Strict on purpose. A course somebody typed in before this plan was on the
 * server has an id like `plan-2110123`, and `Number()` turns that into `NaN`,
 * which becomes the literal path `/electives/NaN`. Failing here names the
 * value instead.
 */
export function serverId(id: string, what = "รายการ"): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${what}นี้ยังไม่ได้บันทึกลงฐานข้อมูล (id = ${id})`);
  }
  return value;
}

/** What the API needs to write a course back, keyed by the planner's own id. */
export type CourseLink = {
  companyId: number;
  lecturerId: number;
  coordinatorId: number | null;
};

export type PlanIndex = {
  /** The term every write in this plan belongs to. */
  termId: number;
  courses: Map<string, CourseLink>;
};

/* ------------------------------------------------------------------ *
 * terms
 * ------------------------------------------------------------------ */

const SEASONS: Record<1 | 2 | 3, TermSeason> = {
  1: "FIRST",
  2: "SECOND",
  3: "SUMMER",
};

const SEASON_LABELS: Record<TermSeason, string> = {
  FIRST: "ภาคต้น",
  SECOND: "ภาคปลาย",
  SUMMER: "ภาคฤดูร้อน",
};

/** `"2569-1"`, `"2569-S"` — the id the router and the storage key already use. */
export function termKey(year: number, semester: 1 | 2 | 3): string {
  return `${year}-${semester === 3 ? "S" : semester}`;
}

/**
 * The row `elective_terms` holds, named the way a reader names it.
 *
 * The two labels are built here rather than stored, unlike the seed files
 * which carry both: a term written by `POST /terms` is two numbers, and a
 * label a person can edit is a label that can disagree with the numbers
 * beside it.
 */
export function readTerm(term: ElectiveTerm): TermMeta {
  const season = SEASONS[term.semester];
  return {
    id: termKey(term.year, term.semester),
    academicYear: term.year,
    season,
    label: `${SEASON_LABELS[season]} ปีการศึกษา ${term.year}`,
    shortLabel: `${term.semester === 3 ? "S" : term.semester}/${term.year}`,
    status: term.status === "current" ? "CURRENT" : "ARCHIVED",
  };
}

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

function readSlots(where: string, slots: ElectiveSlot[] | undefined): SlotId[] {
  const out: SlotId[] = [];
  for (const slot of slots ?? []) {
    if (!isSlotId(slot)) throw new Error(`${where}: ไม่รู้จักคาบ "${slot}"`);
    if (!out.includes(slot)) out.push(slot);
  }
  return out.sort((a, b) => slotRank(a) - slotRank(b));
}

/** "13:30:00" -> "13:30". Seconds exist in the column and nowhere in the UI. */
export function readTime(value: string): string {
  const [hours = "00", minutes = "00"] = value.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function readCoordinator(elective: Elective): Contact | null {
  const name = elective.coordinatorName?.trim();
  if (!name) return null;
  return {
    name,
    email: elective.coordinatorEmail?.trim() || null,
    phone: elective.coordinatorPhone?.trim() || null,
  };
}

export function readCourse(elective: Elective): PlanCourse {
  const where = `วิชา ${elective.courseCode}`;
  return {
    id: String(elective.id),
    courseCode: elective.courseCode,
    section: elective.section,
    title: elective.electiveName,
    category: elective.category,
    // The company's Thai name is what the whole page shows. A company with only
    // an English name is rare and still has to render as something.
    provider: elective.companyTh?.trim() || elective.companyEn?.trim() || "",
    instructor: elective.lecturerName?.trim() || "",
    coordinator: readCoordinator(elective),
    deliveryMode: elective.deliveryMode,
    availability: readSlots(where, elective.availability),
    sessionsPerWeek: elective.sessionsPerWeek,
    capacity: elective.capacity,
    weeks: elective.weeks,
    notes: elective.notes?.trim() || null,
  };
}

export function readRoom(room: ElectiveRoom): PlanRoom {
  return {
    id: String(room.id),
    name: room.name,
    building: room.building,
    floor: room.floor,
    seats: room.seats,
    seatsIsEstimated: room.seatsIsEstimated,
    tier: room.tier === "ready" ? "READY" : "NEEDS_APPROVAL",
    blockedSlots: (room.blockedSlots ?? [])
      .filter((block) => isSlotId(block.slot))
      .map((block) => ({ slotId: block.slot as SlotId, reason: block.reason }))
      .sort((a, b) => slotRank(a.slotId) - slotRank(b.slotId)),
  };
}

export function readSession(session: ElectiveSession): Assignment {
  if (!isSlotId(session.slot)) {
    throw new Error(`คาบที่บันทึกไว้ไม่รู้จัก: "${session.slot}"`);
  }
  return {
    id: String(session.id),
    courseId: String(session.electiveId),
    slotId: session.slot,
    roomId: session.roomId === null ? null : String(session.roomId),
    startTime: readTime(session.startTime),
    endTime: readTime(session.endTime),
    locked: session.isLocked,
    source: session.source === "auto" ? "AUTO" : "MANUAL",
  };
}

/**
 * The API's seven columns under the names the checklist table uses.
 *
 * The two disagree because they were named for different readers: the columns
 * say what the staff member does ("inform_lecturer"), the UI says which box on
 * which row ("mcvInstructorRequest"). Renaming either side to match would
 * break the other's history, so the pairing lives here, once, in both
 * directions — `checklistPatch` below is this table read right to left.
 */
export function readChecklistRow(row: ElectiveChecklist): CourseChecklist {
  return {
    invitationLetter: row.inviteLetter,
    teachingHoursLetter: row.instructionLetter,
    mcvInstructorRequest: row.informLecturer,
    mcvCourseCreated: row.createMcv,
    mentorAdded: row.inviteMentor,
    guestLecturerAdded: row.inviteLecturer,
    mcvJoinCode: row.mcvJoinCode,
    studentsAdded: row.inviteStudents,
  };
}

/**
 * A finished term as the course list reads it.
 *
 * Deliberately not the same shape as a live plan: a record of what happened
 * has no `Assignment`s to move, and it keeps each room's *name* rather than
 * its id, because a term that ended must keep reading correctly after a room
 * is renamed or retired.
 */
export function readArchivedTerm(plan: ElectivePlan): ArchivedTerm {
  const { payload, assignments } = readPlan(plan);
  const names = new Map(payload.rooms.map((room) => [room.id, room.name]));
  return {
    term: payload.term,
    dataset: payload.dataset,
    lastUpdated: payload.lastUpdated,
    isMock: false,
    courses: payload.courses,
    sessions: assignments.map((item) => ({
      courseId: item.courseId,
      slotId: item.slotId,
      roomName: item.roomId === null ? null : names.get(item.roomId) ?? null,
    })),
  };
}

export type ReadPlan = {
  payload: PlanPayload;
  assignments: Assignment[];
  checklists: Record<string, CourseChecklist>;
  index: PlanIndex;
};

/**
 * One `GET /plan` answer, split into the shapes the planner already holds.
 *
 * `seedRevision` and `dataset` exist because the stored-plan schema carries
 * them; on this path they name the term rather than a bundled file, and
 * nothing compares them against anything.
 */
export function readPlan(plan: ElectivePlan): ReadPlan {
  const term = readTerm(plan.term);
  const electives = plan.electives ?? [];
  const courses = electives.map(readCourse);
  const rooms = (plan.rooms ?? []).map(readRoom);

  const index: PlanIndex = {
    termId: plan.term.id,
    courses: new Map(
      electives.map((elective) => [
        String(elective.id),
        {
          companyId: elective.companyId,
          lecturerId: elective.lecturerId,
          coordinatorId: elective.coordinatorId ?? null,
        },
      ]),
    ),
  };

  const checklists: Record<string, CourseChecklist> = {};
  for (const row of plan.checklists ?? []) {
    checklists[String(row.electiveId)] = readChecklistRow(row);
  }

  // The newest thing anybody changed is what "อัปเดต" means once the plan is
  // shared: a bundled file has one timestamp, a table has one per row.
  const stamps = [
    ...electives.map((item) => item.updatedAt),
    ...(plan.sessions ?? []).map((item) => item.updatedAt),
    plan.term.updatedAt,
  ].filter((value): value is string => typeof value === "string");

  return {
    payload: {
      term,
      seedRevision: `term-${plan.term.id}`,
      dataset: `elective-terms/${term.id}`,
      lastUpdated: stamps.sort().at(-1) ?? new Date().toISOString(),
      timezone: "Asia/Bangkok",
      isMock: false,
      courses,
      rooms,
    },
    assignments: (plan.sessions ?? []).map(readSession),
    checklists,
    index,
  };
}

/* ------------------------------------------------------------------ *
 * writing
 * ------------------------------------------------------------------ */

function person(
  name: string | null | undefined,
  id: number | null | undefined,
  contact?: { email?: string | null; phone?: string | null } | null,
): ElectivePerson {
  return {
    // The id wins when the name has not changed: it names a row, where a name
    // only matches one. A renamed person keeps their row precisely because the
    // caller drops the id when the name is what was edited.
    id: id ?? null,
    name: name?.trim() || null,
    email: contact?.email?.trim() || null,
    phone: contact?.phone?.trim() || null,
  };
}

/**
 * A filled-in course form as the API takes it.
 *
 * `link` carries what the form does not show. A create has no link at all
 * beyond the company the user picked; an edit has the ids the course already
 * had, and passes them so that correcting a typo in "อาจารย์สมชัย" does not
 * hand the course to a different row — unless the name really did change, in
 * which case the caller drops `lecturerId` and lets the backend find or make
 * the person.
 */
export function courseWrite(
  draft: CourseDraft,
  link: {
    companyId: number;
    termId?: number | null;
    lecturerId?: number | null;
    coordinatorId?: number | null;
  },
): ElectiveWrite {
  return {
    termId: link.termId ?? null,
    companyId: link.companyId,
    courseCode: draft.courseCode.trim(),
    section: draft.section,
    electiveName: draft.title.trim(),
    category: draft.category.trim(),
    deliveryMode: draft.deliveryMode,
    capacity: draft.capacity,
    sessionsPerWeek: draft.sessionsPerWeek,
    weeks: draft.weeks,
    applicationFormUrl: null,
    courseSyllabusUrl: null,
    notes: draft.notes?.trim() || null,
    lecturer: person(draft.instructor, link.lecturerId),
    coordinator: draft.coordinator
      ? person(draft.coordinator.name, link.coordinatorId, draft.coordinator)
      : null,
    availability: [...draft.availability].sort((a, b) => slotRank(a) - slotRank(b)),
  };
}

/**
 * A room, with or without the periods it is already taken for.
 *
 * `RoomDraft` — what the room form collects — has no `blockedSlots`, because
 * those are edited in the room's own timetable rather than in the form. Left
 * out here they are left alone: `PUT /rooms/{id}` writes them only when the
 * caller sends them, so saving the form never silently clears the grid.
 */
export function roomWrite(room: RoomDraft | Omit<PlanRoom, "id">): ElectiveRoomWrite {
  const blocked = "blockedSlots" in room ? room.blockedSlots : null;
  return {
    name: room.name.trim(),
    building: room.building.trim(),
    floor: room.floor.trim(),
    seats: room.seats,
    seatsIsEstimated: room.seatsIsEstimated,
    tier: room.tier === "READY" ? "ready" : "needs_approval",
    isActive: true,
    blockedSlots: blocked
      ? [...blocked]
          .sort((a, b) => slotRank(a.slotId) - slotRank(b.slotId))
          .map((block) => ({ slot: block.slotId, reason: block.reason }))
      : [],
  };
}

/**
 * One period, as a place / move / retime / lock all send it.
 *
 * The same body for all four because the route is a whole-row write and the
 * four differ only in which field the user meant to change. `startTime` left
 * out asks the backend for the period's own bounds, which is what a fresh
 * placement and a move to another period both want; a retime sends both.
 */
export function sessionWrite(input: {
  courseId: string;
  slotId: SlotId;
  roomId: string | null;
  locked?: boolean;
  source?: Assignment["source"];
  startTime?: string | null;
  endTime?: string | null;
}): ElectiveSessionWrite {
  return {
    electiveId: serverId(input.courseId, "วิชา"),
    slot: input.slotId,
    roomId: input.roomId === null ? null : serverId(input.roomId, "ห้อง"),
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    isLocked: input.locked ?? false,
    source: input.source === "AUTO" ? "auto" : "manual",
  };
}

/** An assignment already in hand, sent back unchanged apart from what moved. */
export function sessionWriteFrom(
  assignment: Assignment,
  changes: Partial<Pick<Assignment, "slotId" | "roomId" | "locked" | "startTime" | "endTime">> = {},
): ElectiveSessionWrite {
  const next = { ...assignment, ...changes };
  const moved = next.slotId !== assignment.slotId;
  return sessionWrite({
    courseId: next.courseId,
    slotId: next.slotId,
    roomId: next.roomId,
    locked: next.locked,
    source: next.source,
    // Moving to another period resets the clock times to that period's bounds;
    // a room-only move keeps whatever somebody typed. Same rule as
    // `moveAssignment` — one behaviour, whichever half of the app applies it.
    startTime: moved ? null : next.startTime,
    endTime: moved ? null : next.endTime,
  });
}

/** `readChecklistRow` backwards, over only the boxes that were pressed. */
export function checklistPatch(patch: Partial<CourseChecklist>): ElectiveChecklistUpdate {
  const out: ElectiveChecklistUpdate = {};
  if (patch.invitationLetter !== undefined) out.inviteLetter = patch.invitationLetter;
  if (patch.teachingHoursLetter !== undefined) out.instructionLetter = patch.teachingHoursLetter;
  if (patch.mcvInstructorRequest !== undefined) out.informLecturer = patch.mcvInstructorRequest;
  if (patch.mcvCourseCreated !== undefined) out.createMcv = patch.mcvCourseCreated;
  if (patch.mentorAdded !== undefined) out.inviteMentor = patch.mentorAdded;
  if (patch.guestLecturerAdded !== undefined) out.inviteLecturer = patch.guestLecturerAdded;
  if (patch.studentsAdded !== undefined) out.inviteStudents = patch.studentsAdded;
  if (patch.mcvJoinCode !== undefined) out.mcvJoinCode = patch.mcvJoinCode;
  return out;
}
