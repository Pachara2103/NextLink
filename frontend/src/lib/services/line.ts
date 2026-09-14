import { getJson, postJson } from "@/lib/services/http";
import { companyService } from "@/lib/services/company";
import { employeeService } from "@/lib/services/employee";
import type {
  Company,
  Employee,
  GroupLine,
  LineGroup,
  ListResponse,
  UpdateLog,
} from "@/types";

/**
 * The two halves of a `GroupLine`, joined on `group_id`.
 *
 * The join is here because it cannot be in SQL: `line_groups` lives in
 * `line_db` and `companies` in `nl_db`, two connections, so `GET /line/groups`
 * returns the LINE half and `GET /companies` the company half.
 *
 * A group with no company row still becomes a `GroupLine` — with `companyId:
 * null`, `isLinked: false` and no names — because that is what the panels read
 * as "ยังไม่ได้ผูกบริษัท". Dropping it here would make unlinked groups vanish
 * off the screen instead.
 *
 * `createdAt` / `updatedAt` are the **group's**, not the company's: the column
 * the console shows is when the LINE group was seen, and it has to keep meaning
 * that for a group whose company row was written minutes ago by the extraction
 * pass.
 */
export function mergeGroupLines(
  groups: LineGroup[],
  companies: Company[],
): GroupLine[] {
  const byGroupId = new Map<string, Company>();
  for (const company of companies) {
    // `GET /companies` filters to `group_id is not null` already; the guard is
    // for the type, and for the day that filter changes.
    if (company.groupId) byGroupId.set(company.groupId, company);
  }

  return groups.map((group) => {
    const company = byGroupId.get(group.groupId);
    return {
      groupId: group.groupId,
      displayName: group.displayName,
      pictureUrl: group.pictureUrl,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      companyTh: company?.companyTh ?? null,
      companyEn: company?.companyEn ?? null,
      aliases: company?.aliases ?? [],
      isLinked: company?.isLinked ?? false,
      companyId: company?.id ?? null,
    };
  });
}

/**
 * The same merge, shaped the way `POST /line/update-information` wants it:
 * keyed by group id. The server used to rebuild this itself, once per run,
 * out of both databases — now the console hands over what it is already
 * holding, so the pass starts on the LLM work straight away.
 */
export function toGroupData(groups: GroupLine[]): Record<string, GroupLine> {
  return Object.fromEntries(groups.map((group) => [group.groupId, group]));
}

/**
 * Composed here, not returned by the API.
 *
 * `POST /line/update-information` answers with the display names of the groups
 * whose extraction failed and nothing else, so the employees it just wrote
 * have to be fetched separately. That means two round trips per click and a
 * contract that does not appear in /openapi.json — the shape below is the only
 * place it is written down. design/feedback.md §3.5 is the fix: have the route
 * return `{ employees, errorGroups }` and this type comes from api.ts.
 */
export interface UpdateInformationResult {
  /** Keyed by company id — see the note at the top of `services/employee.ts`. */
  employees: Record<number, Employee[]>;
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
  /** The LINE half on its own — `line_groups`, nothing joined in. */
  getLineGroups: async (): Promise<LineGroup[]> => {
    const body = await getJson<ListResponse<LineGroup>>("/api/v1/line/groups");
    return body?.items ?? [];
  },

  /**
   * What the panels render: both halves, merged here.
   *
   * Two requests, in parallel — see `mergeGroupLines` for why the server cannot
   * do it in one. Callers that need the companies for their own sake (the store
   * keeps a directory for "ค้นหาบริษัทที่มีอยู่") should read both themselves
   * and call `mergeGroupLines`, rather than fetching companies twice.
   */
  getGroupLines: async (): Promise<GroupLine[]> => {
    const [groups, companies] = await Promise.all([
      lineService.getLineGroups(),
      companyService.list(),
    ]);
    return mergeGroupLines(groups, companies);
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
   * carries on and commits anyway, so the employees are read regardless and
   * the failure is reported as `postError` rather than raised.
   *
   * `groups` is the merged list the screen is already showing, and it is what
   * decides the scope of the run: a group missing from it is not summarised at
   * all. So pass a list read fresh, not one the user has been sitting on —
   * otherwise a group added on LINE since the last sync is skipped.
   */
  updateInformation: async (
    groups: GroupLine[],
  ): Promise<UpdateInformationResult> => {
    let errorGroups: string[] = [];
    let postError: unknown = null;

    try {
      const failed = await postJson<ListResponse<string>>(
        "/api/v1/line/update-information",
        { groupData: toGroupData(groups) },
        // The one call that legitimately runs for minutes: one LLM pass per
        // unread group, inside a single request. The 15s default would cut it
        // off while the server is still working — and the server does not
        // stop when we do, so that read as "failed" while rows were being
        // written.
        { timeoutMs: 10 * 60 * 1000 },
      );
      errorGroups = failed?.items ?? [];
    } catch (error) {
      // A 401 has already torn the session down inside http.ts, and the read
      // below will fail the same way — so an expired token still ends up on
      // the store's failure path instead of being swallowed here.
      postError = error;
    }

    return {
      employees: await employeeService.getEmployeesByCompany(),
      errorGroups,
      postError,
    };
  },
};
