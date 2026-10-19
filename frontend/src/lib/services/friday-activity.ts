import { getJson, postJson, putJson } from "@/lib/services/http";

export type FridayStatus = "draft" | "contacting" | "invited" | "confirmed" | "in_progress" | "completed" | "cancelled";
export type FridayFormat = "talk" | "workshop" | "visit" | "hackathon" | "other" | "unknown";
export type FridayTerm = "FIRST" | "SECOND" | "SUMMER";
export type FridayPerson = { id?: string; namespace: "employee" | "contact" | "guest"; sourceId: string | null; name: string; role: "speaker" | "coordinator" };
export type FridaySession = { id?: string; sessionDate: string | null; startTime: string | null; endTime: string | null; location: string | null; status: "planned" | "held" | "cancelled"; capacity: number | null; booked: number | null; attended: number | null };
export type FridayEditable = { academicYear: number; term: FridayTerm; title: string; description: string | null; domain: string | null; format: FridayFormat; ownerUserId: string; companyIds: string[]; people: FridayPerson[]; sessions: FridaySession[] };
export type FridayActivityRecord = FridayEditable & { id: string; companies: { id: string; name: string }[]; status: FridayStatus; revision: number; createdAt: string; updatedAt: string };
export type FridayListQuery = { academicYear: number; term: FridayTerm; status?: string; companyId?: string; search?: string; page: number; pageSize: number };
export type FridayListResponse = { items: FridayActivityRecord[]; total: number; page: number; pageSize: number; summary: { total: number; completed: number; companies: number; attended: number | null; unknownAttendance: number }; source: "postgresql"; lastUpdated: string | null };
export type FridayOptions = { companies: { id: string; name: string }[]; people: { namespace: "employee" | "contact"; sourceId: string; name: string; companyId: string | null }[]; owners: { id: string; name: string }[]; periods: { academicYear: number; term: FridayTerm }[] };
export type FridayHistoryEntry = { id: string; activityId: string; actorUserId: string | null; actorName: string | null; operation: string; reason: string | null; detail?: { kind: "note" | "task"; before: { body?: string; title?: string; status?: string; assigneeName?: string; dueDate?: string } | null; after: { body?: string; title?: string; status?: string; assigneeName?: string; dueDate?: string } } | null; before: FridayActivityRecord | null; after: FridayActivityRecord | null; occurredAt: string; recordedAt: string };

const base = "/api/v1/friday-activities";
export const fridayActivityService = {
  list(query: FridayListQuery) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    return getJson<FridayListResponse>(`${base}?${params}`);
  },
  options: () => getJson<FridayOptions>(`${base}/options`),
  get: (id: string) => getJson<FridayActivityRecord>(`${base}/${encodeURIComponent(id)}`),
  history: (id: string, cursor?: string) => getJson<{ items: FridayHistoryEntry[]; nextCursor: string | null }>(`${base}/${encodeURIComponent(id)}/history${cursor ? `?beforeId=${encodeURIComponent(cursor)}` : ""}`),
  create: (payload: FridayEditable & { idempotencyKey: string }) => postJson<FridayActivityRecord>(base, payload),
  update: (id: string, payload: FridayEditable & { expectedRevision: number; reason?: string | null }) => putJson<FridayActivityRecord>(`${base}/${encodeURIComponent(id)}`, payload),
  transition: (id: string, payload: { expectedRevision: number; status: FridayStatus; reason: string | null }) => postJson<FridayActivityRecord>(`${base}/${encodeURIComponent(id)}/transitions`, payload),
};
