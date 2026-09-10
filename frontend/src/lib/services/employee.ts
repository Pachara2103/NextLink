import { deleteJson, getJson, postJson, putJson } from "@/lib/services/http";
import type {
  Employee,
  EmployeeCreate,
  EmployeeUpdate,
  ListResponse,
  StatusResponse,
} from "@/types";

/**
 * `employees` — the people the extraction pass finds in LINE chat, plus the
 * ones added by hand from the directory page.
 *
 * Keyed by **company** id throughout, because `employees.company_id` is the FK
 * the table carries. The console renders per LINE group, so a group reaches its
 * people through `GroupLine.companyId`; a group with no company row has none,
 * and rebinding a group to another company therefore cannot carry the old
 * company's staff across.
 *
 * There are two pairs of writes, and which one to use is not a preference:
 *
 * - `update` / `remove` touch PostgreSQL only, for a row still `pending`. It
 *   has no Company→Employee edge in the graph yet, so there is nothing there
 *   to keep in step.
 * - `create` / `syncUpdate` / `syncRemove` write both halves under one
 *   transaction, for a row that is (or is about to become) part of the graph.
 *   Reaching for the pg-only pair on one of those leaves Neo4j holding what
 *   the database no longer says.
 */

/** The console renders per company, the API returns one flat list. */
export function groupByCompanyId(
  list: Employee[],
): Record<number, Employee[]> {
  const byCompany: Record<number, Employee[]> = {};
  for (const person of list) {
    (byCompany[person.companyId] ??= []).push(person);
  }
  return byCompany;
}

async function list(): Promise<Employee[]> {
  const body = await getJson<ListResponse<Employee>>("/api/v1/employees");
  return body?.items ?? [];
}

export const employeeService = {
  list,

  getEmployeesByCompany: async (): Promise<Record<number, Employee[]>> =>
    groupByCompanyId(await list()),

  /**
   * Approve: flips the row to `active` and merges the Employee node under its
   * Company, so this is the moment a reviewed person enters the graph.
   */
  approve: (employeeId: number) =>
    postJson<StatusResponse>(`/api/v1/employees/${employeeId}/approve`, {}),

  /**
   * Decline: deletes the pending row outright. It is not a status change —
   * there is no `declined` any more, and a row nobody wants is a row the
   * table should not carry.
   */
  decline: (employeeId: number) =>
    deleteJson<StatusResponse>(`/api/v1/employees/${employeeId}`),

  /**
   * Adds one person by hand, both halves at once. `status` and `companyId` are
   * part of the body: the column is NOT NULL and the CHECK is closed, so
   * neither can be inferred server-side.
   */
  create: (payload: EmployeeCreate) =>
    postJson<StatusResponse>("/api/v1/employees", payload),

  /**
   * Edits a row that is still `pending`. PostgreSQL only, on purpose — see the
   * note at the top of this file.
   */
  update: (employeeId: number, patch: EmployeeUpdate) =>
    putJson<StatusResponse>(`/api/v1/employees/${employeeId}`, patch),

  /** Edits a reviewed row, keeping the graph in step. */
  syncUpdate: (employeeId: number, patch: EmployeeUpdate) =>
    putJson<StatusResponse>(`/api/v1/employees/${employeeId}/sync`, patch),

  /** Deletes a reviewed row from both halves. */
  syncRemove: (employeeId: number) =>
    deleteJson<StatusResponse>(`/api/v1/employees/${employeeId}/sync`),
};
