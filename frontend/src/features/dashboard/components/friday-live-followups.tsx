"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/services/http";
import { fridayActivityService, type FridayActivityRecord, type FridayOptions } from "@/lib/services/friday-activity";
import { fridayFollowupService as api, type FollowupPage, type FollowupWrite, type FridayNote, type FridayTask, type NoteFields, type NoteVersion, type TaskFields } from "@/lib/services/friday-followup";
import { fridayLiveDate, fridayLiveError, fridayLiveTimestamp } from "../lib/friday-api";

type NoteDraft = { type: "note"; id: string | null; revision: number; reason: string; fields: NoteFields };
type TaskDraft = { type: "task"; id: string | null; revision: number; reason: string; fields: TaskFields };
type Draft = (NoteDraft | TaskDraft) & { original?: FridayNote | FridayTask };
type Command = { type: "note"; id: string | null; payload: NoteFields & FollowupWrite } | { type: "task"; id: string | null; payload: TaskFields & FollowupWrite };
const statusLabels = { open: "รอดำเนินการ", done: "เสร็จแล้ว", cancelled: "ยกเลิก" };
const emptyPage = <T,>(): FollowupPage<T> => ({ items: [], nextCursor: null });

function bangkokInput(value: string | null) {
  return value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16) : "";
}
function NoteContent({ note }: { note: NoteFields }) {
  return <><strong>{note.kind === "fact" ? "ข้อเท็จจริงที่เจ้าหน้าที่บันทึก" : "ความคิดเห็น"}</strong><p className="friday-followup-text">{note.body}</p>{note.reference && <p className="friday-followup-text">แหล่งอ้างอิง: {note.reference}</p>}<p className="panel-caption">เกิดเหตุ: {note.occurredAt ? fridayLiveTimestamp(note.occurredAt) : "ไม่ระบุ"}</p></>;
}

export function FridayLiveFollowups({ record, options, disabled, onState, beforeWrite, onSaved }: {
  record: FridayActivityRecord; options: FridayOptions; disabled: boolean;
  onState: (state: { dirty: boolean; busy: boolean; uncertain: boolean }) => void;
  beforeWrite: () => void; onSaved: (activity: FridayActivityRecord) => void;
}) {
  const [notes, setNotes] = useState(emptyPage<FridayNote>);
  const [tasks, setTasks] = useState(emptyPage<FridayTask>);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [latest, setLatest] = useState<{ activity: FridayActivityRecord; item: FridayNote | FridayTask | null } | null>(null);
  const [versions, setVersions] = useState<{ id: string; items: NoteVersion[]; nextCursor: number | null } | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const conflictPanel = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const versionGeneration = useRef(0);
  const inFlight = useRef(false);
  const pending = useRef<Command | null>(null);
  const mounted = useRef(true);
  const invalidateReads = useCallback(() => { generation.current++; versionGeneration.current++; }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidateReads(); }; }, [invalidateReads]);
  useEffect(() => { onState({ dirty: draft !== null, busy, uncertain }); }, [draft, busy, uncertain, onState]);

  useEffect(() => { if (latest) conflictPanel.current?.scrollIntoView({ block: "start" }); }, [latest]);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setLoadError(null);
    try {
      const [nextNotes, nextTasks] = await Promise.all([api.notes(record.id), api.tasks(record.id)]);
      if (generation.current === request) { setNotes(nextNotes); setTasks(nextTasks); }
    } catch (cause) { if (generation.current === request) setLoadError(fridayLiveError(cause)); }
    finally { if (generation.current === request) setLoading(false); }
  }, [record.id]);
  useEffect(() => { const timer = window.setTimeout(() => void reload(), 0); return () => { clearTimeout(timer); invalidateReads(); }; }, [reload, invalidateReads]);

  async function more(type: "note" | "task") {
    const cursor = type === "note" ? notes.nextCursor : tasks.nextCursor;
    if (!cursor || loading) return;
    const request = ++generation.current;
    setLoading(true); setLoadError(null);
    try {
      if (type === "note") {
        const page = await api.notes(record.id, cursor);
        if (generation.current === request) setNotes(previous => ({ ...page, items: [...previous.items, ...page.items] }));
      } else {
        const page = await api.tasks(record.id, cursor);
        if (generation.current === request) setTasks(previous => ({ ...page, items: [...previous.items, ...page.items] }));
      }
    } catch (cause) { if (generation.current === request) setLoadError(fridayLiveError(cause)); }
    finally { if (generation.current === request) setLoading(false); }
  }
  async function showVersions(id: string, cursor?: number) {
    const request = ++versionGeneration.current;
    setVersionsLoading(true); setVersionsError(null);
    try {
      const page = await api.versions(record.id, id, cursor);
      if (versionGeneration.current === request) setVersions(previous => ({ ...page, id, items: cursor && previous?.id === id ? [...previous.items, ...page.items] : page.items }));
    } catch (cause) { if (versionGeneration.current === request) setVersionsError(fridayLiveError(cause)); }
    finally { if (versionGeneration.current === request) setVersionsLoading(false); }
  }
  function start(next: Draft) { setDraft(next); setLatest(null); setError(null); setNotice(null); pending.current = null; }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || inFlight.current || latest) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    generation.current++; versionGeneration.current++; setLoading(false); setVersionsLoading(false); beforeWrite();
    const command: Command = pending.current ?? (draft.type === "note"
      ? { type: "note", id: draft.id, payload: { ...draft.fields, expectedRevision: draft.revision, reason: draft.reason.trim() || null, idempotencyKey: crypto.randomUUID() } }
      : { type: "task", id: draft.id, payload: { ...draft.fields, expectedRevision: draft.revision, reason: draft.reason.trim() || null, idempotencyKey: crypto.randomUUID() } });
    pending.current = command;
    try {
      const result = command.type === "note" ? await api.saveNote(record.id, command.id, command.payload) : await api.saveTask(record.id, command.id, command.payload);
      if (!mounted.current) return;
      pending.current = null; setUncertain(false); setDraft(null); setVersions(null);
      onSaved(result.activity); setNotice(command.type === "note" ? "บันทึกข้อความและประวัติแล้ว" : "บันทึกงานติดตามแล้ว");
      await reload();
    } catch (cause) {
      if (!mounted.current) return;
      setError(fridayLiveError(cause));
      // A 5xx/disconnection can occur after commit. Freeze the exact command and
      // retry its receipt before allowing an edited payload/new idempotency key.
      const ambiguous = !(cause instanceof ApiError) || cause.status >= 500;
      setUncertain(ambiguous);
      if (!ambiguous) pending.current = null;
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const current = command.id
            ? await (command.type === "note" ? api.note(record.id, command.id) : api.task(record.id, command.id))
            : { activity: await fridayActivityService.get(record.id), item: null };
          if (mounted.current) setLatest(current);
        }
        catch { if (mounted.current) setError("อ่านฉบับล่าสุดไม่สำเร็จ ร่างยังอยู่ กรุณาลองบันทึกอีกครั้งเพื่อตรวจใหม่"); }
        await reload();
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const locked = busy || uncertain || disabled;
  const cannotStart = disabled || busy || draft !== null || loading || Boolean(loadError);
  const currentItem = latest?.item ?? draft?.original;
  const requiresReason = draft?.type === "note" ? Boolean(draft.id) : Boolean(draft?.id && currentItem && "status" in currentItem && currentItem.status !== draft.fields.status && (draft.fields.status === "cancelled" || currentItem.status !== "open"));
  const overdue = (task: FridayTask) => task.status === "open" && task.dueDate < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <section className="detail-section friday-followups" aria-label="บันทึกและงานติดตาม">
    <h3>บันทึกและงานติดตาม</h3>
    <p className="panel-caption">แยกข้อเท็จจริงที่เจ้าหน้าที่บันทึกออกจากความคิดเห็น พร้อมแหล่งอ้างอิงและเวลาที่เกิดเหตุ</p>
    <div className="friday-live-actions"><button className="secondary-button" type="button" disabled={cannotStart} onClick={() => start({ type: "note", id: null, revision: record.revision, reason: "", fields: { kind: "fact", body: "", reference: null, occurredAt: null } })}>เพิ่มบันทึก</button><button className="secondary-button" type="button" disabled={cannotStart} onClick={() => start({ type: "task", id: null, revision: record.revision, reason: "", fields: { title: "", description: null, assigneeUserId: record.ownerUserId, dueDate: "", status: "open" } })}>เพิ่มงานติดตาม</button><button className="text-button" type="button" disabled={busy || loading || uncertain} onClick={() => void reload()}>โหลดบันทึกและงานใหม่</button></div>
    {loading && <p role="status">กำลังอ่านบันทึกและงานติดตาม…</p>}
    {loadError && <p role="alert">อ่านบันทึกหรืองานไม่สำเร็จ: {loadError}</p>}
    {error && <p className="edit-save-error" role="alert">{error}</p>}
    {notice && <p className="edit-save-message" role="status">{notice}</p>}
    {uncertain && <p role="alert">ยังยืนยันผลบันทึกไม่ได้ แบบฟอร์มถูกพักไว้ กด “ตรวจผลและลองคำสั่งเดิม” เพื่อป้องกันรายการซ้ำ</p>}
    {draft && <form onSubmit={save} className="friday-followup-editor" aria-label={draft.type === "note" ? "แบบฟอร์มบันทึก" : "แบบฟอร์มงานติดตาม"}>
      <h4>{draft.id ? "แก้ไข" : "เพิ่ม"}{draft.type === "note" ? "บันทึก" : "งานติดตาม"}</h4>
      {latest && <div ref={conflictPanel} className="friday-live-conflict" role="alert"><strong>มีข้อมูลฉบับใหม่ · รุ่น {latest.activity.revision}</strong><p>{latest.activity.title} · แก้ไข {fridayLiveTimestamp(latest.activity.updatedAt)}</p><p>ร่างของคุณยังอยู่ ตรวจรายการปัจจุบันด้านล่างก่อนบันทึกอีกครั้ง</p>{currentItem && <details open><summary>รายการฉบับปัจจุบัน</summary>{"body" in currentItem ? <NoteContent note={currentItem} /> : <><p>{currentItem.title} · {statusLabels[currentItem.status]} · {currentItem.assigneeName} · {fridayLiveDate(currentItem.dueDate)}</p><p className="friday-followup-text">{currentItem.description || "ยังไม่มีรายละเอียดงาน"}</p></>}</details>}<button type="button" className="secondary-button" disabled={busy || loading || Boolean(loadError)} onClick={() => { onSaved(latest.activity); setDraft({ ...draft, revision: latest.activity.revision, original: latest.item ?? draft.original }); setLatest(null); setError(null); }}>ตรวจแล้ว ใช้ร่างนี้กับรุ่นล่าสุด</button></div>}
      <fieldset disabled={locked} className="friday-live-fields"><div className="course-edit-grid">
        {draft.type === "note" ? <>
          <label><span>ประเภทบันทึก</span><select value={draft.fields.kind} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, kind: e.target.value as NoteFields["kind"] } })}><option value="fact">ข้อเท็จจริง</option><option value="comment">ความคิดเห็น</option></select></label>
          <label><span>เวลาเกิดเหตุ (เวลาไทย ไม่จำเป็นต้องระบุ)</span><input type="datetime-local" value={bangkokInput(draft.fields.occurredAt)} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, occurredAt: e.target.value ? `${e.target.value}:00+07:00` : null } })} /></label>
          <label className="edit-field-full"><span>ข้อความบันทึก *</span><textarea required maxLength={10000} rows={4} value={draft.fields.body} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, body: e.target.value } })} /></label>
          <label className="edit-field-full"><span>แหล่งอ้างอิง / หลักฐาน</span><textarea maxLength={2000} rows={2} value={draft.fields.reference ?? ""} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, reference: e.target.value || null } })} /></label>
        </> : <>
          <label className="edit-field-full"><span>ชื่องานติดตาม *</span><input required maxLength={500} value={draft.fields.title} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, title: e.target.value } })} /></label>
          <label><span>ผู้รับผิดชอบงาน *</span><select required value={draft.fields.assigneeUserId} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, assigneeUserId: e.target.value } })}><option value="">เลือกเจ้าหน้าที่</option>{!options.owners.some(o => o.id === draft.fields.assigneeUserId) && draft.fields.assigneeUserId && <option value={draft.fields.assigneeUserId}>ผู้รับผิดชอบเดิม (ไม่อยู่ในทะเบียนที่ใช้งาน)</option>}{options.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label><span>กำหนดส่ง (ค.ศ.) *</span><input type="date" required value={draft.fields.dueDate} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, dueDate: e.target.value } })} /></label>
          <label className="edit-field-full"><span>รายละเอียดงาน</span><textarea maxLength={10000} rows={3} value={draft.fields.description ?? ""} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, description: e.target.value || null } })} /></label>
          {draft.id && <label><span>สถานะงานติดตาม</span><select value={draft.fields.status} onChange={e => setDraft({ ...draft, fields: { ...draft.fields, status: e.target.value as TaskFields["status"] } })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        </>}
        {draft.id && <label className="edit-field-full"><span>เหตุผลแก้ไข{requiresReason ? " *" : ""}</span><input maxLength={2000} required={requiresReason} value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label>}
      </div></fieldset>
      <div className="friday-live-actions"><button className="primary-button" type="submit" disabled={busy || disabled || Boolean(latest)}>{busy ? "กำลังบันทึก…" : uncertain ? "ตรวจผลและลองคำสั่งเดิม" : draft.type === "note" ? "บันทึกข้อความ" : "บันทึกงานติดตาม"}</button><button className="secondary-button" type="button" disabled={locked} onClick={() => { if (window.confirm("ทิ้งร่างที่ยังไม่ได้บันทึกหรือไม่?")) { setDraft(null); setLatest(null); setError(null); } }}>ยกเลิกร่าง</button></div>
    </form>}
    <h4>ข้อเท็จจริงและความคิดเห็น</h4>
    {!notes.items.length && !loading && !loadError && <p className="panel-caption">ยังไม่มีบันทึก</p>}
    {notes.items.map(note => <article key={note.id} className="friday-followup-card" aria-label={`บันทึก ${note.id}`}><NoteContent note={note} /><p className="panel-caption">บันทึกโดย {note.authorName} · {fridayLiveTimestamp(note.recordedAt)} · ฉบับ {note.version}{note.version > 1 && ` · แก้ไขโดย ${note.updatedByName} ${fridayLiveTimestamp(note.updatedAt)}`}</p><div className="friday-live-actions"><button className="text-button" type="button" disabled={cannotStart} onClick={() => start({ type: "note", id: note.id, original: note, revision: record.revision, reason: "", fields: { kind: note.kind, body: note.body, reference: note.reference, occurredAt: note.occurredAt } })}>แก้ไขบันทึก {note.id}</button><button className="text-button" type="button" disabled={busy || versionsLoading} onClick={() => void showVersions(note.id)}>ประวัติบันทึก {note.id}</button></div></article>)}
    {notes.nextCursor && <button className="secondary-button" type="button" disabled={loading || busy} onClick={() => void more("note")}>อ่านบันทึกเพิ่มเติม</button>}
    {versionsError && <p role="alert">อ่านประวัติบันทึกไม่สำเร็จ: {versionsError}</p>}
    {versions && <section aria-label="ฉบับก่อนหน้าของบันทึก" className="friday-followup-versions"><h4>ประวัติบันทึก {versions.id}</h4>{versions.items.map(v => <article className="friday-followup-card" key={v.version}><strong>ฉบับ {v.version} · {v.editorName} · {fridayLiveTimestamp(v.recordedAt)}</strong><NoteContent note={v.snapshot} />{v.reason && <p>เหตุผล: {v.reason}</p>}</article>)}{versions.nextCursor && <button className="secondary-button" type="button" disabled={versionsLoading || busy} onClick={() => void showVersions(versions.id, versions.nextCursor!)}>อ่านฉบับก่อนหน้าเพิ่มเติม</button>}<button className="text-button" type="button" onClick={() => { versionGeneration.current++; setVersions(null); setVersionsLoading(false); }}>ปิดประวัติบันทึก</button></section>}
    <h4>งานติดตาม</h4>
    {!tasks.items.length && !loading && !loadError && <p className="panel-caption">ยังไม่มีงานติดตาม</p>}
    {tasks.items.map(task => <article className="friday-followup-card" key={task.id} aria-label={`งานติดตาม ${task.id}`}><strong>{task.title}</strong><p><span className={`status-pill ${task.status === "done" ? "tone-green" : "tone-neutral"}`}>{statusLabels[task.status]}</span>{overdue(task) && <span className="status-pill tone-orange">เลยกำหนด</span>}</p><p>ผู้รับผิดชอบ: {task.assigneeName} · กำหนดส่ง: {fridayLiveDate(task.dueDate)}</p>{task.description && <p className="friday-followup-text">{task.description}</p>}<p className="panel-caption">สร้างโดย {task.authorName} · {fridayLiveTimestamp(task.recordedAt)} · แก้ไขโดย {task.updatedByName} · ฉบับ {task.version}</p><button className="text-button" type="button" disabled={cannotStart} onClick={() => start({ type: "task", id: task.id, original: task, revision: record.revision, reason: "", fields: { title: task.title, description: task.description, assigneeUserId: task.assigneeUserId, dueDate: task.dueDate, status: task.status } })}>แก้ไขงานติดตาม {task.id}</button></article>)}
    {tasks.nextCursor && <button className="secondary-button" type="button" disabled={loading || busy} onClick={() => void more("task")}>อ่านงานติดตามเพิ่มเติม</button>}
  </section>;
}
