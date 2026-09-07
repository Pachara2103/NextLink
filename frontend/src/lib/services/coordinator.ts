import { postJson, getJson, putJson,deleteJson } from "@/lib/services/http";
import type {
  Coordinator,
  CoordinatorUpdate,
  ListResponse,
  StatusResponse,
} from "@/types";

/** The console renders per group, the API returns one flat list. */
export function groupByGroupId(
  list: Coordinator[],
): Record<string, Coordinator[]> {
  const byGroup: Record<string, Coordinator[]> = {};
  for (const person of list) {
    (byGroup[person.groupId] ??= []).push(person);
  }
  return byGroup;
}

async function list(): Promise<Coordinator[]> {
  const body = await getJson<ListResponse<Coordinator>>("/api/v1/coordinators");
  return body?.items ?? [];
}

export const coordinatorService = {
  list,

  getCoordinatorsByGroup: async (): Promise<Record<string, Coordinator[]>> =>
    groupByGroupId(await list()),

  approve: (coordinatorId: number) =>
    postJson<StatusResponse>(
      `/api/v1/coordinators/${coordinatorId}/approve`,
      {},
    ),

  decline: (coordinatorId: number) =>
    deleteJson<StatusResponse>(
      `/api/v1/coordinators/${coordinatorId}`,
    ),

  /**
   * The body is CoordinatorUpdate, which has no id, status or timestamps in it
   * at all — so there is nothing to strip off before sending any more. The id
   * goes in the path, where the route reads it from.
   */
  update: (coordinatorId: number, patch: CoordinatorUpdate) =>
    putJson<StatusResponse>(`/api/v1/coordinators/${coordinatorId}`, patch),
};
