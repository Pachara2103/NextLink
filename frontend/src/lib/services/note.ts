import { deleteJson, getJson, postJson, putJson } from "@/lib/services/http";
import type { ListResponse, Note, NoteInput, StatusResponse } from "@/types";

export const noteService = {
  /**
   * Every note, unfiltered. The panel filters by year/term/level/source on the
   * client and shows "แสดง N จาก TOTAL" over the whole set, so it needs all of
   * them — and there are far fewer notes than LINE messages.
   */
  list: async (): Promise<Note[]> => {
    const body = await getJson<ListResponse<Note>>("/api/v1/notes");
    return body?.items ?? [];
  },

  create: (payload: NoteInput) =>
    postJson<StatusResponse>("/api/v1/notes", payload),

  update: (id: number, payload: NoteInput) =>
    putJson<StatusResponse>(`/api/v1/notes/${id}`, payload),

  remove: (id: number) => deleteJson<StatusResponse>(`/api/v1/notes/${id}`),
};
