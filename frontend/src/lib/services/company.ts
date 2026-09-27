import { getJson, postJson, putJson } from "@/lib/services/http";
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
   * Clears `companies.group_id` — the company row stays, so it moves to
   * "บริษัทที่ยังไม่ผูกกลุ่มไลน์" and its LINE group becomes free to bind
   * somewhere else. It is not a delete: the people and notes filed under this
   * company are all keyed by company id and survive it.
   */
  unlink: (companyId: number) =>
    postJson<StatusResponse>(`/api/v1/companies/${companyId}/unlink`, {}),

  /**
   * The reverse: points an existing company at a LINE group.
   *
   * `group_id` goes in the **query string**, not the body — `link_company_api`
   * declares it as a bare `str` parameter, which FastAPI reads as a query
   * param. Sent as a JSON body (as it was) the route never sees it and answers
   * 422.
   */
  link: (companyId: number, groupId: string) =>
    postJson<StatusResponse>(
      `/api/v1/companies/${companyId}/link?group_id=${encodeURIComponent(groupId)}`,
      {},
    ),
};
