import { deleteJson, getJson, postJson, putJson } from "@/lib/services/http";
import type {
  Company,
  CompanyInput,
  ListResponse,
  StatusResponse,
} from "@/types";

/**
 * The two writes are keyed differently, and that is the whole contract:
 *
 * - create is keyed by **group** id, because it is the act of binding a group
 *   to a company that does not exist yet (companies.group_id is UNIQUE)
 * - update is keyed by **company** id, because renaming a company that is
 *   already there has nothing to do with which group points at it
 *
 * `GroupLine.companyId` is what tells the two apart: null means no row exists
 * for this group yet, so create; anything else means a row is already there —
 * including one the extraction pass wrote and nobody has confirmed — so update.
 */
export const companyService = {
  /** The company directory, for the "ค้นหาบริษัทที่มีอยู่" mode. */
  list: async (): Promise<Company[]> => {
    const body = await getJson<ListResponse<Company>>("/api/v1/companies");
    return body?.items ?? [];
  },

  create: (groupId: string, payload: CompanyInput) =>
    postJson<StatusResponse>(`/api/v1/companies/${groupId}`, payload),

  update: (companyId: number, payload: CompanyInput) =>
    putJson<StatusResponse>(`/api/v1/companies/${companyId}`, payload),

  /**
   * Unlink: drops the company row, so the group's LEFT JOIN gives companyId =
   * null and isLinked = false and it moves back to "ยังไม่ได้ผูกบริษัท". Keyed
   * by company id, like update.
   */
  remove: (companyId: number) =>
    deleteJson<StatusResponse>(`/api/v1/companies/${companyId}`),
};
