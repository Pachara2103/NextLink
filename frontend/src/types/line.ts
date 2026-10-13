/**
 * The LINE side of the console's vocabulary.
 *
 * `LineGroup` and `GroupLine` are names for shapes `api.ts` already carries —
 * the interesting part is that they are two different shapes now, see below.
 * `CompanyLine` is the third shape, and the only one written out by hand: it
 * is a *company* with its LINE group folded in, which is the opposite
 * direction from `GroupLine` and is not a shape any endpoint answers with.
 * `UpdateLog` is still hand-written for the same reason as `contact.ts`:
 * `api.ts` was generated before `GET /line/update_logs` existed, so the shape
 * is not in there yet. It mirrors `backend/schemas/line.py::UpdateLog`; delete
 * it once `npm run gen:api` has been run against a backend carrying that route.
 */

import type { components } from "./api";

type Schemas = components["schemas"];

/**
 * One row of `line_groups`, exactly as `GET /line/groups` now returns it.
 *
 * Nothing about a company on it any more. `line_groups` lives in `line_db` and
 * `companies` in `nl_db`, so the backend cannot join the two — it returns the
 * LINE side alone and the console merges in `GET /companies` itself.
 */
export type LineGroup = Schemas["LineGroup"];

/**
 * A LINE group as the console renders it: the `line_groups` row with the
 * company row that points at it (`companies.group_id`) folded in.
 *
 * Composed client-side by `lineService.getGroupLines()` — it is not a shape any
 * single endpoint answers with. The company half is all-or-nothing: a group no
 * company row points at gets `companyId: null`, `hasCompany: false` and empty
 * names, which is exactly what "ยังไม่ได้ผูกบริษัท" means to the panels.
 *
 * `hasCompany` is derived, never read off the wire: a company row points at
 * this group, i.e. some `companies.group_id` equals this `groupId`. There is no
 * confirmation flag behind it any more — `companies.is_linked` is gone, and
 * `group_id is not null` is the only thing that says a group and a company
 * belong together.
 *
 * Identical to `backend/schemas/line.py::GroupInfo`, and deliberately so: this
 * object is sent back as-is in `groupData` on the next "อัปเดตข้อมูล", so the
 * extraction pass does not have to read the merge back out of two databases —
 * and `has_company` is what tells it whether to insert a company row for the
 * group or reuse the one already there.
 */
export type GroupLine = Schemas["GroupInfo"];

/**
 * A company with the LINE group it points at folded in — the shape the cards
 * on กลุ่มไลน์และบริษัท render.
 *
 * `GroupLine` is the same join read from the other end, and the difference is
 * which rows survive it: `GroupLine` has one entry per **LINE group**, so a
 * company with no group at all is simply not in the list. That page needs
 * those companies — they are its "บริษัทที่ยังไม่ผูกกลุ่มไลน์" section — so it
 * reads the join company-first instead, and `groupId` / `displayName` /
 * `pictureUrl` are the ones allowed to be null here.
 *
 * `updatedAt` is the **company's**, unlike `GroupLine.updatedAt` which is the
 * group's: these cards are sorted and stamped by when the company last
 * changed, which is what a rename or a re-bind on this page actually touches.
 */
export interface CompanyLine {
  /** `companies.id`. Always present — this list is built from company rows. */
  companyId: number;
  /** `companies.group_id`. Null for a company no group is bound to yet. */
  groupId: string | null;
  /** `line_groups.display_name` of that group; null when there is no group. */
  displayName: string | null;
  /** `line_groups.picture_url` of that group; null when there is no group. */
  pictureUrl: string | null;
  companyTh: string | null;
  companyEn: string | null;
  aliases: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** One press of "อัปเดตข้อมูล". */
export interface UpdateLog {
  id: number;
  userId: number;
  /** The name of the user who ran it — users.display_name is nullable. */
  displayName: string | null;
  /** Groups the extraction pass could not finish on that run. Never null. */
  errorGroups: string[];
  createdAt: string;
}

/**
 * ร่างผลสรุปของกลุ่มไลน์ที่ยังไม่ได้ผูกบริษัท — `GET /line/summary-drafts`
 *
 * Hand-written for the same reason as `UpdateLog`: `api.ts` predates the
 * route. Mirrors `backend/schemas/line.py::LineSummaryDraft`; replace with the
 * generated schema once `npm run gen:api` has been run.
 *
 * Nothing in a draft is in `companies` / `employees` yet. The extraction pass
 * parks it here because `employees.company_id` cannot be moved later, so the
 * user decides first whether the group belongs to a company already in the
 * system (`candidates`) or to a new one.
 */
export interface DraftContact {
  nameTh?: string | null;
  nameEn?: string | null;
  nickname?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  relevant?: Schemas["RelevantType"] | null;
}

export interface CompanyCandidate {
  companyId: number;
  companyTh: string | null;
  companyEn: string | null;
  aliases?: string[] | null;
  /** Non-null: bound to another LINE group now, picking it moves it here. */
  groupId?: string | null;
  /** 0–1, higher is more likely the same company. */
  score: number;
  reasons: string[];
}

export interface LineSummaryDraft {
  id: number;
  groupId: string;
  status: "pending" | "committed" | "discarded";
  groupName?: string | null;
  companyTh?: string | null;
  companyEn?: string | null;
  aliases?: string[] | null;
  contacts: DraftContact[];
  candidates: CompanyCandidate[];
  createdBy?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * What the user picked for one coordinator in the draft, by its position in
 * `contacts`. `link` = the same person as `employeeId`, already in the chosen
 * company: no new row, only the blank fields on that row are filled.
 * Coordinators left out are decided by the server (duplicate → skip, else create).
 */
export type CoordinatorAction = "create" | "link" | "skip";

export interface CoordinatorDecision {
  index: number;
  action: CoordinatorAction;
  employeeId?: number | null;
  /** The contact as edited on screen; omitted = as the AI summarised it. */
  data?: DraftContact | null;
}

export type CommitDraftRequest =
  | {
      mode: "existing";
      companyId: number;
      coordinators?: CoordinatorDecision[];
    }
  | {
      mode: "new";
      company?: {
        companyTh?: string | null;
        companyEn?: string | null;
        aliases?: string[] | null;
      };
      /** `link` is rejected here — a new company has nobody to link to. */
      coordinators?: CoordinatorDecision[];
    };

/** One draft coordinator next to the person in the company most likely the same. */
export interface ContactMatch {
  index: number;
  contact: DraftContact;
  employeeId: number | null;
  /** Which of อีเมล / เบอร์โทร / ชื่อ… matched. Empty when no one did. */
  matchedBy: string[];
  suggestedAction: CoordinatorAction;
}

/** `GET /line/summary-drafts/{id}/compare?companyId=` — read-only. */
export interface DraftComparison {
  draftId: number;
  companyId: number;
  existing: Schemas["Employee"][];
  matches: ContactMatch[];
}

export interface CommitDraftResult {
  draftId: number;
  companyId: number;
  companyCreated: boolean;
  createdEmployees: number;
  /** Linked to a person already in the company — no new row. */
  linkedEmployees: number;
  /** Not saved: a duplicate of someone in that company (same email / phone / name), or skipped by the user. */
  skippedDuplicates: number;
}
