import { getJson, postJson } from "@/lib/services/http";
import { coordinatorService } from "@/lib/services/coordinator";
import type {
  Coordinator,
  GroupLine,
  ListResponse,
  UpdateLog,
} from "@/types";

/**
 * Composed here, not returned by the API.
 *
 * `POST /line/update-information` answers with the display names of the groups
 * whose extraction failed and nothing else, so the coordinators it just wrote
 * have to be fetched separately. That means two round trips per click and a
 * contract that does not appear in /openapi.json — the shape below is the only
 * place it is written down. design/feedback.md §3.5 is the fix: have the route
 * return `{ coordinators, errorGroups }` and this type comes from api.ts.
 */
export interface UpdateInformationResult {
  coordinators: Record<string, Coordinator[]>;
  /** Display names of the groups the extraction pass could not finish. */
  errorGroups: string[];
  /**
   * The error from the POST when it never answered, `null` when it did.
   *
   * Not thrown, on purpose. The pass commits group by group as it goes, so by
   * the time the POST gives up the rows are usually already in the database —
   * throwing here would send the store down its failure path, which leaves
   * `contacts` untouched and the screen showing state that is already stale.
   * The read below runs either way; the caller words a warning off this.
   */
  postError: unknown;
}

export const lineService = {
  getGroupLines: async (): Promise<GroupLine[]> => {
    const body = await getJson<ListResponse<GroupLine>>("/api/v1/line/groups");
    return body?.items ?? [];
  },

  /**
   * The history behind "แสดงประวัติการอัปเดตข้อมูล". The API already orders it
   * newest first, so the modal renders it as it arrives.
   */
  getUpdateLogs: async (): Promise<UpdateLog[]> => {
    const body = await getJson<ListResponse<UpdateLog>>(
      "/api/v1/line/update_logs",
    );
    return body?.items ?? [];
  },

  /**
   * The extraction pass, then the rows it wrote.
   *
   * The POST runs one LLM call per unread group inside a single request, so it
   * can take a minute or more and is the one call in this app that a proxy or a
   * flaky connection realistically gives up on. When that happens the server
   * carries on and commits anyway, so the coordinators are read regardless and
   * the failure is reported as `postError` rather than raised.
   */
  updateInformation: async (): Promise<UpdateInformationResult> => {
    let errorGroups: string[] = [];
    let postError: unknown = null;

    try {
      const failed = await postJson<ListResponse<string>>(
        "/api/v1/line/update-information",
        {},
      );
      errorGroups = failed?.items ?? [];
    } catch (error) {
      // A 401 has already torn the session down inside http.ts, and the read
      // below will fail the same way — so an expired token still ends up on
      // the store's failure path instead of being swallowed here.
      postError = error;
    }

    return {
      coordinators: await coordinatorService.getCoordinatorsByGroup(),
      errorGroups,
      postError,
    };
  },
};
