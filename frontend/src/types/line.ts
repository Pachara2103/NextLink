/**
 * Hand-written for the same reason as `contact.ts`: `api.ts` was generated
 * before `GET /line/update_logs` existed, so the shape is not in there yet.
 * Mirrors `backend/schemas/line.py::UpdateLog`; delete this once `npm run
 * gen:api` has been run against a backend carrying that route.
 */

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
