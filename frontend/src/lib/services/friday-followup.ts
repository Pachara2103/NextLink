import { getJson, postJson, putJson } from "./http";
import type { FridayActivityRecord } from "./friday-activity";

type RecordInfo = { id: string; activityId: string; authorUserId: string; authorName: string; updatedByUserId: string; updatedByName: string; version: number; recordedAt: string; updatedAt: string };
export type NoteFields = { kind: "fact" | "comment"; body: string; reference: string | null; occurredAt: string | null };
export type TaskFields = { title: string; description: string | null; assigneeUserId: string; dueDate: string; status: "open" | "done" | "cancelled" };
export type FridayNote = NoteFields & RecordInfo;
export type FridayTask = TaskFields & RecordInfo & { assigneeName: string };
export type NoteVersion = { version: number; editorUserId: string; editorName: string; reason: string | null; snapshot: FridayNote; recordedAt: string };
export type FollowupWrite = { expectedRevision: number; idempotencyKey: string; reason: string | null };
export type FollowupResult = { activity: FridayActivityRecord; item: FridayNote | FridayTask };
export type FollowupPage<T> = { items: T[]; nextCursor: string | null };
const base = (id: string) => `/api/v1/friday-activities/${encodeURIComponent(id)}`;
const pageQuery = (cursor?: string) => cursor ? `?beforeId=${encodeURIComponent(cursor)}` : "";
export const fridayFollowupService = {
  note: (id: string, noteId: string) => getJson<FollowupResult>(`${base(id)}/notes/${encodeURIComponent(noteId)}`),
  task: (id: string, taskId: string) => getJson<FollowupResult>(`${base(id)}/tasks/${encodeURIComponent(taskId)}`),
  notes: (id: string, cursor?: string) => getJson<FollowupPage<FridayNote>>(`${base(id)}/notes${pageQuery(cursor)}`),
  tasks: (id: string, cursor?: string) => getJson<FollowupPage<FridayTask>>(`${base(id)}/tasks${pageQuery(cursor)}`),
  versions: (id: string, noteId: string, cursor?: number) => getJson<{ items: NoteVersion[]; nextCursor: number | null }>(`${base(id)}/notes/${encodeURIComponent(noteId)}/versions${cursor ? `?beforeVersion=${cursor}` : ""}`),
  saveNote: (id: string, noteId: string | null, payload: NoteFields & FollowupWrite) => noteId
    ? putJson<FollowupResult>(`${base(id)}/notes/${encodeURIComponent(noteId)}`, payload)
    : postJson<FollowupResult>(`${base(id)}/notes`, payload),
  saveTask: (id: string, taskId: string | null, payload: TaskFields & FollowupWrite) => taskId
    ? putJson<FollowupResult>(`${base(id)}/tasks/${encodeURIComponent(taskId)}`, payload)
    : postJson<FollowupResult>(`${base(id)}/tasks`, payload),
};
