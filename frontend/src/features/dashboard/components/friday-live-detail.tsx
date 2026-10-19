"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/services/http";
import { useAuth } from "@/store/auth-store";
import { fridayActivityService, type FridayActivityRecord, type FridayEditable, type FridayHistoryEntry, type FridayOptions, type FridayStatus } from "@/lib/services/friday-activity";
import type { AcademicPeriod } from "../lib/academic-period";
import { LIVE_FRIDAY_FORMATS, LIVE_FRIDAY_STATUSES, LIVE_FRIDAY_TRANSITIONS, fridayEditable, fridayLiveCount, fridayLiveDate, fridayLiveError, fridayLiveTimestamp, fridayNewDraft } from "../lib/friday-api";
import { FridayLiveFollowups } from "./friday-live-followups";
import { FridayLiveForm } from "./friday-live-form";
import { useUnsavedChanges } from "../lib/use-unsaved-changes";

const historyLabels: Record<string, string> = { "note.create": "เพิ่มบันทึก", "note.update": "แก้ไขบันทึก", "task.create": "สร้างงานติดตาม", "task.update": "แก้ไขงานติดตาม", create: "สร้างกิจกรรม", update: "แก้ไขกิจกรรม", transition: "เปลี่ยนสถานะ", "import.create": "นำเข้าและสร้างกิจกรรม", "import.update": "นำเข้าและแก้ไขกิจกรรม", "import.transition": "เปลี่ยนสถานะจากการนำเข้า" };

export function FridayLiveDetail({ id, period, options, onClose, beforeWrite, onMutation, onCreated }: { id: string | null; period: AcademicPeriod; options: FridayOptions; onClose: () => void; beforeWrite: () => void; onMutation: () => void; onCreated: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const historyGeneration = useRef(0);
  const { user } = useAuth();
  const defaultOwnerId = options.owners.find(owner => owner.id === user?.id)?.id ?? "";
  const [record, setRecord] = useState<FridayActivityRecord | null>(null);
  const [draft, setDraft] = useState<FridayEditable | null>(() => id ? null : fridayNewDraft(period, defaultOwnerId));
  const [editing, setEditing] = useState(!id);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<FridayHistoryEntry[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [followupState, setFollowupState] = useState({ dirty: false, busy: false, uncertain: false });
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [latest, setLatest] = useState<FridayActivityRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<FridayStatus | "">("");
  const [reason, setReason] = useState("");
  const [editReason, setEditReason] = useState("");
  const pendingCreate = useRef<(FridayEditable & { idempotencyKey: string }) | null>(null);
  const [createUncertain, setCreateUncertain] = useState(false);
  const dirty = followupState.dirty || Boolean(reason || nextStatus) || (editing && draft !== null && (Boolean(editReason) || JSON.stringify(draft) !== JSON.stringify(record ? fridayEditable(record) : fridayNewDraft(period, defaultOwnerId))));
  useUnsavedChanges(dirty || saving || createUncertain || followupState.busy);

  const refreshHistory = useCallback(async (activityId: string, cursor?: string) => {
    const requestGeneration = ++historyGeneration.current;
    setHistoryLoading(true);
    try {
      const result = await fridayActivityService.history(activityId, cursor);
      if (historyGeneration.current === requestGeneration) { setHistory(previous => cursor ? [...previous, ...result.items] : result.items); setHistoryCursor(result.nextCursor ?? null); setHistoryError(null); }
    } catch (cause) { if (historyGeneration.current === requestGeneration) setHistoryError(fridayLiveError(cause)); }
    finally { if (historyGeneration.current === requestGeneration) setHistoryLoading(false); }
  }, []);

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
  useEffect(() => {
    if (!id) return;
    let current = true;
    void fridayActivityService.get(id).then(item => { if (current) { setRecord(item); setDraft(fridayEditable(item)); } }).catch(cause => { if (current) setError(fridayLiveError(cause)); }).finally(() => { if (current) setLoading(false); });
    const historyTask = window.setTimeout(() => void refreshHistory(id), 0);
    return () => { current = false; window.clearTimeout(historyTask); historyGeneration.current += 1; };
  }, [id, refreshHistory]);
  function requestClose() { if (inFlight.current || followupState.busy) return; if (createUncertain || followupState.uncertain) { setError("กรุณาตรวจผลคำสั่งบันทึกที่ยังไม่ทราบผลก่อนปิดรายละเอียด"); return; } if (dirty && !window.confirm("ปิดแบบฟอร์มและทิ้งการแก้ไขที่ยังไม่ได้บันทึกหรือไม่?")) return; onClose(); }
  async function handleFailure(cause: unknown) {
    setError(fridayLiveError(cause));
    if (cause instanceof ApiError && cause.status === 409 && record) {
      try { setLatest(await fridayActivityService.get(record.id)); } catch { setError(`${fridayLiveError(cause)} · อ่านฉบับล่าสุดไม่สำเร็จ กรุณาลองตรวจอีกครั้ง`); }
    }
  }
  function accepted(item: FridayActivityRecord, message: string) { setRecord(previous => previous && previous.revision > item.revision ? previous : item); setDraft(fridayEditable(item)); setLatest(null); setError(null); setNotice(message); setEditing(false); setNextStatus(""); setReason(""); onMutation(); void refreshHistory(item.id); if (!id) onCreated(item.id); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || inFlight.current) return;
    inFlight.current = true; historyGeneration.current += 1;
    setSaving(true); setError(null); setNotice(null); beforeWrite();
    try {
      let item: FridayActivityRecord;
      if (record) {
        item = await fridayActivityService.update(record.id, { ...draft, expectedRevision: record.revision, reason: editReason.trim() || null });
      } else {
        // A lost response may follow a committed insert. Keep the entire
        // command, not just its key, until its receipt has been recovered.
        pendingCreate.current ??= { ...draft, idempotencyKey: crypto.randomUUID() };
        item = await fridayActivityService.create(pendingCreate.current);
        pendingCreate.current = null; setCreateUncertain(false);
      }
      accepted(item, "บันทึกกิจกรรมลงฐานข้อมูลกลางแล้ว"); setEditReason("");
    } catch (cause) {
      if (!record) {
        const ambiguous = !(cause instanceof ApiError) || cause.status >= 500;
        setCreateUncertain(ambiguous);
        if (!ambiguous) pendingCreate.current = null;
      }
      await handleFailure(cause); onMutation();
    }
    finally { inFlight.current = false; setSaving(false); }
  }
  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || !nextStatus || inFlight.current) return;
    inFlight.current = true; historyGeneration.current += 1;
    setSaving(true); setError(null); setNotice(null); beforeWrite();
    try { accepted(await fridayActivityService.transition(record.id, { expectedRevision: record.revision, status: nextStatus, reason: reason.trim() || null }), "บันทึกการเปลี่ยนสถานะแล้ว"); }
    catch (cause) { await handleFailure(cause); onMutation(); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="course-dialog friday-dialog friday-live-dialog" aria-labelledby="friday-live-title" onCancel={event => { event.preventDefault(); requestClose(); }} onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div><div className="dialog-header"><div><p className="section-kicker">Friday Activity · ฐานข้อมูลกลาง</p><h2 id="friday-live-title">{record?.title ?? (id ? "รายละเอียดกิจกรรม" : "สร้างกิจกรรมใหม่")}</h2></div><div className="dialog-header-actions">{record && !editing && <button className="secondary-button" type="button" disabled={saving || followupState.dirty || followupState.busy} onClick={() => { setDraft(fridayEditable(record)); setEditing(true); setNotice(null); }}>แก้ไขข้อมูล</button>}<button className="icon-button" type="button" aria-label="ปิดรายละเอียด" onClick={requestClose} disabled={saving || followupState.busy}>×</button></div></div>
      <div className="dialog-content" tabIndex={0}>
        {loading && <p role="status">กำลังอ่านกิจกรรมจากฐานข้อมูลกลาง…</p>}
        {error && <p className="edit-save-error" role="alert">{error}</p>}
        {createUncertain && <p role="alert">ยังยืนยันผลสร้างกิจกรรมไม่ได้ แบบฟอร์มถูกพักไว้ กด “ตรวจผลและลองคำสั่งเดิม” เพื่อป้องกันกิจกรรมซ้ำ</p>}
        {notice && <p className="edit-save-message" role="status">{notice}</p>}
        {latest && <section className="friday-live-conflict" aria-label="ข้อมูลฉบับล่าสุด"><h3>ฉบับล่าสุดที่ผู้อื่นบันทึก</h3><p>{latest.title} · {LIVE_FRIDAY_STATUSES[latest.status]} · แก้ไข {fridayLiveTimestamp(latest.updatedAt)}</p><p>แบบฟอร์มของคุณยังไม่ถูกแทนที่ ตรวจฉบับล่าสุดก่อนนำการแก้ไขไปกรอกใหม่</p><details><summary>ดูรายละเอียดฉบับล่าสุดก่อนเลือก</summary><p>ปีการศึกษา {latest.academicYear + 543} · {latest.term === "FIRST" ? "เทอม 1" : latest.term === "SECOND" ? "เทอม 2" : "ภาคฤดูร้อน"} · {LIVE_FRIDAY_FORMATS[latest.format]} · {latest.domain || "ยังไม่ระบุศาสตร์"}</p><p>{latest.description || "ยังไม่มีรายละเอียด"}</p><p>ผู้รับผิดชอบ: {options.owners.find(owner => owner.id === latest.ownerUserId)?.name ?? "เจ้าหน้าที่เดิมไม่อยู่ในทะเบียนที่ใช้งาน"}</p><p>บริษัท: {latest.companies.map(company => company.name).join(" · ") || "ยังไม่กำหนด"}</p><p>ผู้เกี่ยวข้อง: {latest.people.map(person => `${person.name} (${person.role === "speaker" ? "วิทยากร" : "ผู้ประสานงาน"})`).join(" · ") || "ยังไม่กำหนด"}</p>{latest.sessions.map((session, index) => <p key={session.id ?? index}>รอบ {index + 1}: {fridayLiveDate(session.sessionDate)} · {session.startTime || "ยังไม่ระบุเวลาเริ่ม"} - {session.endTime || "ยังไม่ระบุเวลาสิ้นสุด"} · {session.location || "ยังไม่ระบุสถานที่"} · {session.status === "held" ? "จัดแล้ว" : session.status === "cancelled" ? "ยกเลิก" : "วางแผน"} · รับ {fridayLiveCount(session.capacity)} / จอง {fridayLiveCount(session.booked)} / มาจริง {fridayLiveCount(session.attended)}</p>)}</details><button className="secondary-button" type="button" disabled={saving} onClick={() => { setRecord(latest); setDraft(fridayEditable(latest)); setEditing(false); setLatest(null); setError(null); void refreshHistory(latest.id); }}>โหลดฉบับล่าสุดแทนแบบฟอร์มของฉัน</button></section>}
        {!loading && editing && draft && <form id="friday-live-edit" onSubmit={save}><p className="edit-mode-note">บันทึกลงฐานข้อมูลกลาง เจ้าหน้าที่คนอื่นเห็นข้อมูลหลังโหลดใหม่</p><FridayLiveForm draft={draft} options={options} disabled={saving || createUncertain} onChange={setDraft} />{record && <div className="course-edit-grid detail-section"><label className="edit-field-full"><span>เหตุผลการแก้ไข{["confirmed", "in_progress", "completed", "cancelled"].includes(record.status) ? " *" : ""}</span><input required={["confirmed", "in_progress", "completed", "cancelled"].includes(record.status)} disabled={saving} maxLength={2000} value={editReason} onChange={event => setEditReason(event.target.value)} /></label></div>}</form>}
        {!loading && !editing && record && <>
          <div className="dialog-grid"><div className="detail-block"><span>สถานะกิจกรรม</span><strong>{LIVE_FRIDAY_STATUSES[record.status]}</strong></div><div className="detail-block"><span>ปีการศึกษา / ภาค</span><strong>{record.academicYear + 543} / {record.term === "FIRST" ? "1" : record.term === "SECOND" ? "2" : "ฤดูร้อน"}</strong></div><div className="detail-block"><span>รูปแบบ / ศาสตร์</span><strong>{LIVE_FRIDAY_FORMATS[record.format]} · {record.domain || "ยังไม่ระบุศาสตร์"}</strong></div><div className="detail-block"><span>เจ้าหน้าที่ผู้รับผิดชอบ</span><strong>{options.owners.find(owner => owner.id === record.ownerUserId)?.name ?? "ยังไม่กำหนด"}</strong></div></div>
          <section className="detail-section note-section"><h3>รายละเอียด</h3><p>{record.description || "ยังไม่มีรายละเอียด"}</p></section>
          <section className="detail-section"><h3>บริษัทที่ร่วมกิจกรรม</h3><p>{record.companies.map(company => company.name).join(" · ") || "ยังไม่กำหนดบริษัท"}</p></section>
          <section className="detail-section"><h3>ผู้ประสานงาน / วิทยากร</h3>{record.people.length ? <ul>{record.people.map((person, index) => <li key={person.id ?? index}>{person.name} · {person.role === "speaker" ? "วิทยากร" : "ผู้ประสานงาน"}{person.namespace === "guest" ? " · ผู้ร่วมกิจกรรมภายนอก" : ""}</li>)}</ul> : <p className="panel-caption">ยังไม่กำหนดรายชื่อ</p>}</section>
          <section className="detail-section"><h3>รอบจัดกิจกรรม ({record.sessions.length})</h3>{record.sessions.map((session, index) => <article className="friday-live-session" key={session.id ?? index}><strong>รอบที่ {index + 1} · {fridayLiveDate(session.sessionDate)}</strong><p>{session.startTime ?? "ยังไม่ระบุเวลาเริ่ม"} - {session.endTime ?? "ยังไม่ระบุเวลาสิ้นสุด"} · {session.location || "ยังไม่ระบุสถานที่"}</p><p>{session.status === "held" ? "จัดแล้ว" : session.status === "cancelled" ? "ยกเลิก" : "วางแผน"} · รับ {fridayLiveCount(session.capacity)} · จอง {fridayLiveCount(session.booked)} · มาจริง {fridayLiveCount(session.attended)}</p></article>)}{record.sessions.length === 0 && <p className="panel-caption">ยังไม่มีรอบจัดกิจกรรม</p>}<p className="panel-caption">— หมายถึงยังไม่ทราบ · จำนวนมาจริงนับเป็นคน-ครั้ง</p></section>
          <section className="detail-section"><h3>เปลี่ยนสถานะกิจกรรม</h3><form className="course-edit-grid" onSubmit={transition}><label><span>สถานะถัดไป</span><select required value={nextStatus} disabled={saving || Boolean(latest) || followupState.dirty || followupState.busy} onChange={event => setNextStatus(event.target.value as FridayStatus | "")}><option value="">เลือกสถานะ</option>{LIVE_FRIDAY_TRANSITIONS[record.status].map(status => <option value={status} key={status}>{LIVE_FRIDAY_STATUSES[status]}</option>)}</select></label><label><span>เหตุผล / บันทึกการติดตาม</span><input required maxLength={2000} value={reason} disabled={saving || Boolean(latest) || followupState.dirty || followupState.busy} onChange={event => setReason(event.target.value)} /></label><button className="primary-button" type="submit" disabled={saving || !nextStatus || !reason.trim() || Boolean(latest) || followupState.dirty || followupState.busy}>{saving ? "กำลังบันทึก…" : "บันทึกสถานะ"}</button></form></section>
        </>}
        {record && !editing && <FridayLiveFollowups record={record} options={options} disabled={saving || Boolean(latest) || Boolean(nextStatus || reason)} onState={setFollowupState} beforeWrite={() => { historyGeneration.current++; setHistoryLoading(false); beforeWrite(); }} onSaved={item => accepted(item, "อัปเดตบันทึกและงานติดตามแล้ว")} />}
        {record && <section className="detail-section"><h3>ประวัติการบันทึก</h3>{historyError && <p role="alert">อ่านประวัติไม่สำเร็จ: {historyError}</p>}{history.length === 0 && !historyError && <p className="panel-caption">ยังไม่มีประวัติที่อ่านได้</p>}<ol className="friday-live-history">{history.map(entry => <li key={entry.id}><strong>{historyLabels[entry.operation] ?? "บันทึกกิจกรรม"}</strong><p>{entry.actorName || "เจ้าหน้าที่"} · {fridayLiveTimestamp(entry.recordedAt)}</p>{entry.reason && <p>{entry.reason}</p>}{entry.detail && <details><summary>ข้อมูลที่บันทึก</summary><p className="friday-followup-text">{entry.detail.after.body ?? entry.detail.after.title}</p>{entry.detail.kind === "task" && <p>ผู้รับผิดชอบ: {entry.detail.after.assigneeName} · กำหนดส่ง: {fridayLiveDate(entry.detail.after.dueDate ?? null)} · สถานะ: {entry.detail.after.status === "done" ? "เสร็จแล้ว" : entry.detail.after.status === "cancelled" ? "ยกเลิก" : "รอดำเนินการ"}</p>}{entry.detail.before && <p className="friday-followup-text">ฉบับก่อน: {entry.detail.before.body ?? entry.detail.before.title}{entry.detail.before.status && ` · ${entry.detail.before.status}`}</p>}</details>}{entry.before?.status && entry.after?.status && entry.before.status !== entry.after.status && <p>{LIVE_FRIDAY_STATUSES[entry.before.status]} -&gt; {LIVE_FRIDAY_STATUSES[entry.after.status]}</p>}{entry.before?.title !== entry.after?.title && <p>{entry.before?.title || "ยังไม่มีชื่อ"} -&gt; {entry.after?.title || "ยังไม่มีชื่อ"}</p>}</li>)}</ol>{historyCursor && <button type="button" className="secondary-button" disabled={historyLoading || saving || followupState.busy} onClick={() => void refreshHistory(record.id, historyCursor)}>อ่านประวัติเพิ่มเติม</button>}{historyError && <button type="button" className="text-button" disabled={saving || followupState.busy} onClick={() => void refreshHistory(record.id)}>ลองอ่านประวัติอีกครั้ง</button>}</section>}
      </div>
      {editing && draft && <div className="dialog-edit-footer"><button className="secondary-button" type="button" disabled={saving || createUncertain} onClick={() => { if (dirty && !window.confirm("ยกเลิกการแก้ไขที่ยังไม่ได้บันทึกหรือไม่?")) return; if (!record) onClose(); else { setDraft(fridayEditable(record)); setEditing(false); setError(null); } }}>ยกเลิก</button><button className="primary-button" form="friday-live-edit" type="submit" disabled={saving || !draft.title.trim() || Boolean(latest)}>{saving ? "กำลังบันทึก…" : createUncertain ? "ตรวจผลและลองคำสั่งเดิม" : "บันทึกกิจกรรม"}</button></div>}
    </div>
  </dialog>;
}
