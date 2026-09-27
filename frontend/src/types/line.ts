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
