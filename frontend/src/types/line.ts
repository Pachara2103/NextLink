/**
 * The LINE side of the console's vocabulary.
 *
 * `LineGroup` and `GroupLine` are names for shapes `api.ts` already carries —
 * the interesting part is that they are two different shapes now, see below.
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
 * company row points at gets `companyId: null`, `isLinked: false` and empty
 * names, which is exactly what "ยังไม่ได้ผูกบริษัท" means to the panels.
 *
 * Identical to `backend/schemas/line.py::GroupInfo`, and deliberately so: this
 * object is sent back as-is in `groupData` on the next "อัปเดตข้อมูล", so the
 * extraction pass does not have to read the merge back out of two databases.
 */
export type GroupLine = Schemas["GroupInfo"];

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
