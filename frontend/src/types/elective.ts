/**
 * The wire shapes of "จัดตารางวิชาเลือก", hand-written for now.
 *
 * Everything else in `types/` comes from `api.ts`, which `npm run gen:api`
 * regenerates from the running backend's /openapi.json. These mirror
 * `backend/schemas/elective.py` exactly, and this file can be deleted — with
 * `types/index.ts` pointing at `Schemas["Elective"]` and friends instead — as
 * soon as gen:api can be run again.
 *
 * It cannot be run today, and not because of anything here: splitting the LINE
 * tables into their own database narrowed `schemas.line.LineGroup` to the three
 * columns that database actually has and moved the company half to a new
 * `GroupInfo`. Regenerating therefore changes `GroupLine` out from under about
 * thirty call sites in the groups screens, which now have to join the company
 * in themselves. That is a separate piece of work, and the planner should not
 * have to wait behind it.
 *
 * `?` here means exactly what it means in a generated file: the field has a
 * default on the Python side and may be left out of a request body.
 */

/** `electives.delivery_mode`. Same three words the planner's own types use. */
export type DeliveryMode = "ON_SITE" | "HYBRID" | "ONLINE";

/** `elective_rooms.tier` — a department room, or one that needs a request. */
export type RoomTier = "ready" | "needs_approval";

/** `elective_terms.status` — exactly one term is `current` at a time. */
export type TermStatus = "current" | "archived";

/** `elective_sessions.source` — put there by the scheduler, or by a person. */
export type SessionSource = "auto" | "manual";

/** The 18 weekly periods. The same strings as the planner's `SlotId`. */
export type ElectiveSlot =
  | "MON_AM" | "MON_PM" | "MON_EVE"
  | "TUE_AM" | "TUE_PM" | "TUE_EVE"
  | "WED_AM" | "WED_PM" | "WED_EVE"
  | "THU_AM" | "THU_PM" | "THU_EVE"
  | "FRI_AM" | "FRI_PM" | "FRI_EVE"
  | "SAT_AM" | "SAT_PM" | "SAT_EVE";

/** A letter is waited for, so it has an in-between state. */
export type ReceiptStatus = "NOT_RECEIVED" | "IN_PROGRESS" | "RECEIVED";

/** An MCV step is done by the staff themselves: done, or not. */
export type DoneStatus = "NOT_DONE" | "DONE";

// --- terms ---------------------------------------------------------------

export interface ElectiveTermCreate {
  /** ปีการศึกษา พ.ศ., e.g. 2569. */
  year: number;
  /** 1 = ต้น, 2 = ปลาย, 3 = ฤดูร้อน. */
  semester: 1 | 2 | 3;
}

export interface ElectiveTerm extends ElectiveTermCreate {
  id: number;
  status: TermStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

// --- rooms ---------------------------------------------------------------

export interface ElectiveRoomBlock {
  slot: ElectiveSlot;
  reason: string;
}

export interface ElectiveRoomWrite {
  name: string;
  building: string;
  floor: string;
  seats: number;
  seatsIsEstimated?: boolean;
  tier?: RoomTier;
  isActive?: boolean;
  blockedSlots?: ElectiveRoomBlock[];
}

export interface ElectiveRoom {
  id: number;
  name: string;
  building: string;
  floor: string;
  seats: number;
  seatsIsEstimated: boolean;
  tier: RoomTier;
  isActive: boolean;
  blockedSlots?: ElectiveRoomBlock[];
  createdAt: string | null;
  updatedAt: string | null;
}

// --- courses -------------------------------------------------------------

/**
 * A lecturer or coordinator as the form knows them — often just a name.
 *
 * `id` names a row in `employees` and wins when it is there. With only a name,
 * the backend looks for that name inside the same company and creates the row
 * if it is new, which is what lets a course be added the day the company's
 * email arrives.
 */
export interface ElectivePerson {
  id?: number | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ElectiveWrite {
  /** Left out means the term being planned. */
  termId?: number | null;
  companyId: number;
  courseCode: string;
  section?: number;
  electiveName: string;
  category: string;
  deliveryMode?: DeliveryMode;
  capacity: number;
  sessionsPerWeek?: number;
  weeks?: number;
  applicationFormUrl?: string | null;
  courseSyllabusUrl?: string | null;
  notes?: string | null;
  lecturer: ElectivePerson;
  coordinator?: ElectivePerson | null;
  /** Replaces the whole set of periods the company said it can teach. */
  availability?: ElectiveSlot[];
}

export interface Elective {
  id: number;
  termId: number;
  companyId: number;
  companyTh?: string | null;
  companyEn?: string | null;
  courseCode: string;
  section: number;
  electiveName: string;
  category: string;
  deliveryMode: DeliveryMode;
  capacity: number;
  sessionsPerWeek: number;
  weeks: number;
  applicationFormUrl?: string | null;
  courseSyllabusUrl?: string | null;
  notes?: string | null;
  lecturerId: number;
  lecturerName?: string | null;
  coordinatorId?: number | null;
  coordinatorName?: string | null;
  coordinatorEmail?: string | null;
  coordinatorPhone?: string | null;
  availability?: ElectiveSlot[];
  createdAt: string | null;
  updatedAt: string | null;
}

// --- periods -------------------------------------------------------------

export interface ElectiveSessionWrite {
  electiveId: number;
  slot: ElectiveSlot;
  /** null for an online course, or a period that has no room yet. */
  roomId?: number | null;
  /** Left out asks for the period's own bounds — 09:00–12:00 and so on. */
  startTime?: string | null;
  endTime?: string | null;
  isLocked?: boolean;
  source?: SessionSource;
}

export interface ElectiveSession {
  id: number;
  electiveId: number;
  termId: number;
  slot: ElectiveSlot;
  roomId: number | null;
  /** "13:30:00" — a `TIME` column, seconds included. */
  startTime: string;
  endTime: string;
  isLocked: boolean;
  source: SessionSource;
  createdAt: string | null;
  updatedAt: string | null;
}

// --- paperwork -----------------------------------------------------------

export interface ElectiveChecklist {
  electiveId: number;
  inviteLetter: ReceiptStatus;
  instructionLetter: ReceiptStatus;
  informLecturer: DoneStatus;
  createMcv: DoneStatus;
  inviteMentor: DoneStatus;
  inviteLecturer: DoneStatus;
  inviteStudents: DoneStatus;
  mcvJoinCode: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** PATCH body: the fields left out are the boxes nobody pressed. */
export interface ElectiveChecklistUpdate {
  inviteLetter?: ReceiptStatus | null;
  instructionLetter?: ReceiptStatus | null;
  informLecturer?: DoneStatus | null;
  createMcv?: DoneStatus | null;
  inviteMentor?: DoneStatus | null;
  inviteLecturer?: DoneStatus | null;
  inviteStudents?: DoneStatus | null;
  mcvJoinCode?: string | null;
}

// --- the whole page ------------------------------------------------------

export interface ElectivePlan {
  term: ElectiveTerm;
  rooms?: ElectiveRoom[];
  electives?: Elective[];
  sessions?: ElectiveSession[];
  checklists?: ElectiveChecklist[];
}
