import {
  deleteJson,
  getJson,
  patchJson,
  postJson,
  putJson,
} from "@/lib/services/http";
import type {
  Elective,
  ElectiveChecklist,
  ElectiveChecklistUpdate,
  ElectivePlan,
  ElectiveRoom,
  ElectiveRoomBlock,
  ElectiveRoomWrite,
  ElectiveSession,
  ElectiveSessionWrite,
  ElectiveSlot,
  ElectiveTerm,
  ElectiveTermCreate,
  ElectiveWrite,
  ListResponse,
  StatusResponse,
} from "@/types";

const BASE = "/api/v1/electives";

/**
 * The wire calls of "จัดตารางวิชาเลือก". Nothing here knows what a plan means —
 * it is `/api/v1/electives` spelled in TypeScript, and the translation to the
 * planner's own vocabulary happens one layer up in `plan-api.ts`.
 *
 * `plan` is not an optimisation. The page shows the term, the rooms, the
 * courses, the periods and the paperwork as one picture, and five separate
 * reads can disagree with each other — a period pointing at a room that the
 * rooms call already deleted. One read is one consistent moment.
 */
export const electiveService = {
  plan: (termId?: number): Promise<ElectivePlan> =>
    getJson<ElectivePlan>(`${BASE}/plan${termId ? `?termId=${termId}` : ""}`),

  // --- terms -------------------------------------------------------------

  listTerms: async (): Promise<ElectiveTerm[]> =>
    (await getJson<ListResponse<ElectiveTerm>>(`${BASE}/terms`))?.items ?? [],

  currentTerm: (): Promise<ElectiveTerm> =>
    getJson<ElectiveTerm>(`${BASE}/terms/current`),

  /** Opening a term closes the one being planned, in one transaction. */
  createTerm: (payload: ElectiveTermCreate): Promise<ElectiveTerm> =>
    postJson<ElectiveTerm>(`${BASE}/terms`, payload),

  archiveTerm: (id: number): Promise<ElectiveTerm> =>
    postJson<ElectiveTerm>(`${BASE}/terms/${id}/archive`, {}),

  // --- rooms -------------------------------------------------------------

  listRooms: async (includeInactive = false): Promise<ElectiveRoom[]> =>
    (
      await getJson<ListResponse<ElectiveRoom>>(
        `${BASE}/rooms${includeInactive ? "?includeInactive=true" : ""}`,
      )
    )?.items ?? [],

  createRoom: (payload: ElectiveRoomWrite): Promise<ElectiveRoom> =>
    postJson<ElectiveRoom>(`${BASE}/rooms`, payload),

  updateRoom: (id: number, payload: ElectiveRoomWrite): Promise<ElectiveRoom> =>
    putJson<ElectiveRoom>(`${BASE}/rooms/${id}`, payload),

  /** Replaces the whole set of periods the room is already taken for. */
  setRoomBlocks: (id: number, blocks: ElectiveRoomBlock[]): Promise<ElectiveRoom> =>
    putJson<ElectiveRoom>(`${BASE}/rooms/${id}/blocks`, blocks),

  removeRoom: (id: number): Promise<StatusResponse> =>
    deleteJson<StatusResponse>(`${BASE}/rooms/${id}`),

  // --- courses -----------------------------------------------------------

  listElectives: async (termId?: number): Promise<Elective[]> =>
    (
      await getJson<ListResponse<Elective>>(
        `${BASE}${termId ? `?termId=${termId}` : ""}`,
      )
    )?.items ?? [],

  createElective: (payload: ElectiveWrite): Promise<Elective> =>
    postJson<Elective>(BASE, payload),

  updateElective: (id: number, payload: ElectiveWrite): Promise<Elective> =>
    putJson<Elective>(`${BASE}/${id}`, payload),

  removeElective: (id: number): Promise<StatusResponse> =>
    deleteJson<StatusResponse>(`${BASE}/${id}`),

  /**
   * The availability grid only. Kept apart from `updateElective` because a
   * person toggles one cell at a time, and sending the whole course back to
   * change one period would overwrite whatever someone else just corrected.
   */
  setAvailability: (id: number, slots: ElectiveSlot[]): Promise<Elective> =>
    putJson<Elective>(`${BASE}/${id}/availability`, slots),

  // --- periods -----------------------------------------------------------

  placeSession: (payload: ElectiveSessionWrite): Promise<ElectiveSession> =>
    postJson<ElectiveSession>(`${BASE}/sessions`, payload),

  updateSession: (
    id: number,
    payload: ElectiveSessionWrite,
  ): Promise<ElectiveSession> =>
    putJson<ElectiveSession>(`${BASE}/sessions/${id}`, payload),

  removeSession: (id: number): Promise<StatusResponse> =>
    deleteJson<StatusResponse>(`${BASE}/sessions/${id}`),

  /** "จัดตารางใหม่": the unlocked periods are replaced, the locked ones stay. */
  replaceSessions: async (
    sessions: ElectiveSessionWrite[],
    termId?: number,
  ): Promise<ElectiveSession[]> =>
    (
      await putJson<ListResponse<ElectiveSession>>(
        `${BASE}/sessions${termId ? `?termId=${termId}` : ""}`,
        sessions,
      )
    )?.items ?? [],

  // --- paperwork ---------------------------------------------------------

  checklist: (electiveId: number): Promise<ElectiveChecklist> =>
    getJson<ElectiveChecklist>(`${BASE}/${electiveId}/checklist`),

  /** PATCH, not PUT: the fields left out are the ones nobody touched. */
  updateChecklist: (
    electiveId: number,
    patch: ElectiveChecklistUpdate,
  ): Promise<ElectiveChecklist> =>
    patchJson<ElectiveChecklist>(`${BASE}/${electiveId}/checklist`, patch),
};
