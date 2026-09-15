"use client";

import { CompanyContacts } from "./company-contacts";
import { useCompanyDirectory } from "../lib/use-company-directory";
import { companyKey } from "../lib/company-directory";
import type { Ref } from "react";
import { DialogEditFooter } from "./dialog-edit-footer";
import { FridayCompanyFeedback, FridayStudentRatings } from "./friday-evaluations";
import { useRecordEditor } from "../lib/use-record-editor";
import { FRIDAY_FORMAT, FRIDAY_STATUS, formatFridayDate, fridayCount, fridayFollowUps, fridayScore, toFridayDraft, type FridayActivity, type FridayDraft } from "../lib/friday-activity";

export function FridayDetailDialog({ activity, dialogRef, onClose, onSave }: {
  activity: FridayActivity; dialogRef: Ref<HTMLDialogElement>; onClose: () => void;
  onSave: (id: string, draft: FridayDraft) => Promise<boolean>;
}) {
  const editor = useRecordEditor({ record: activity, toDraft: toFridayDraft, onSave, onClose });
  const { draft, updateDraft } = editor;
  const directory = useCompanyDirectory();
  const contacts = directory.items.find(c => c.id === companyKey("friday", activity.companyId))?.contacts ?? [];
  const comments = activity.studentEvaluations.filter(response => response.suggestedTopic || response.suggestion);
  return <dialog ref={dialogRef} className="course-dialog friday-dialog" tabIndex={-1} aria-labelledby="friday-dialog-title" onCancel={editor.handleCancel} onClick={editor.handleBackdropClick}>
    <div>
      <div className="dialog-header">
        <div><p className="section-kicker">{activity.companyName} · ครั้งที่ {activity.sequence}</p><h2 id="friday-dialog-title">{activity.title}</h2></div>
        <div className="dialog-header-actions">
          {!editor.isEditing && <button className="secondary-button" type="button" onClick={editor.startEditing}>แก้ไขข้อมูล</button>}
          <button className="icon-button" type="button" onClick={editor.requestClose} disabled={editor.saving} aria-label="ปิดรายละเอียด">×</button>
        </div>
      </div>
      <div className="dialog-statusbar"><div><span>{FRIDAY_STATUS[activity.status]}</span><strong>{fridayFollowUps(activity).join(" · ") || "ไม่มีรายการต้องติดตาม"}</strong></div></div>
      <div className="dialog-content" tabIndex={0}>
        <CompanyContacts module="friday" sourceId={activity.companyId} selectedIds={activity.contactIds} />
        {editor.isEditing && draft ? <form id="friday-edit-form" className="course-edit-form" onSubmit={editor.saveEditing}>
          <p className="edit-mode-note">ข้อมูลทดลอง · บันทึกไว้ในเบราว์เซอร์นี้</p>
          <fieldset className="cap-checkboxes"><legend>ผู้ประสานงานประจำกิจกรรม (เลือกได้หลายคน)</legend><p className="panel-caption">ไม่เลือก = ยังไม่กำหนดผู้รับผิดชอบประจำกิจกรรม โดยจะแสดงผู้ติดต่อระดับบริษัท</p>{contacts.map(c => <label key={c.id}><input type="checkbox" checked={draft.contactIds?.includes(c.id) ?? false} onChange={e => updateDraft("contactIds", e.target.checked ? [...(draft.contactIds ?? []), c.id] : (draft.contactIds ?? []).filter(id => id !== c.id))} />{c.name} · {c.role} · {c.status}</label>)}{draft.contactIds?.filter(id => !contacts.some(c => c.id === id)).map(id => <label key={id}><input type="checkbox" checked onChange={() => updateDraft("contactIds", draft.contactIds?.filter(value => value !== id))} />ผู้ติดต่อที่ถูกลบ: {id} (เอาเครื่องหมายออกเพื่อยกเลิกการอ้างอิง)</label>)}</fieldset>
          <div className="course-edit-grid">
            <label className="edit-field-full"><span>ชื่อกิจกรรม</span><input required value={draft.title} onChange={event => updateDraft("title", event.target.value)} /></label>
            <label><span>ศาสตร์</span><input required value={draft.domain} onChange={event => updateDraft("domain", event.target.value)} /></label>
            <label><span>รูปแบบ</span><select value={draft.format} onChange={event => updateDraft("format", event.target.value as FridayDraft["format"])}>{Object.entries(FRIDAY_FORMAT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>สถานะกิจกรรม</span><select value={draft.status} onChange={event => updateDraft("status", event.target.value as FridayDraft["status"])}>{Object.entries(FRIDAY_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>วันที่จัดกิจกรรม (ค.ศ.)</span><input type="date" value={draft.date ?? ""} onChange={event => updateDraft("date", event.target.value || null)} /></label>
            <label><span>เวลาเริ่ม</span><input type="time" value={draft.startTime} onChange={event => updateDraft("startTime", event.target.value)} /></label>
            <label><span>เวลาสิ้นสุด</span><input type="time" value={draft.endTime} onChange={event => updateDraft("endTime", event.target.value)} /></label>
            <label className="edit-field-full"><span>ห้อง / สถานที่</span><input value={draft.location} onChange={event => updateDraft("location", event.target.value)} /></label>
            {([ ["capacity", "จำนวนรับ"], ["booked", "จำนวนจอง"], ["attended", "จำนวนมาจริง"] ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min={0} step={1} value={draft[key] ?? ""} placeholder="ยังไม่มีข้อมูล" onChange={event => updateDraft(key, event.target.value === "" ? null : Number(event.target.value))} /></label>)}
            <p className="panel-caption edit-field-full">เว้นว่างเมื่อยังไม่ทราบจำนวน · 0 หมายถึงไม่มีคน · จำนวนมาจริงอาจมากกว่าจำนวนรับได้</p>
            <label className="edit-field-full"><span>รายละเอียดกิจกรรม</span><textarea rows={3} value={draft.description} onChange={event => updateDraft("description", event.target.value)} /></label>
            <label className="edit-field-full"><span>ลิงก์เผยแพร่หรือรูปภาพ</span><input type="url" value={draft.publicationUrl} placeholder="https://…" onChange={event => updateDraft("publicationUrl", event.target.value)} /></label>
            <label className="edit-field-full"><span>หมายเหตุ</span><textarea rows={3} value={draft.notes} onChange={event => updateDraft("notes", event.target.value)} /></label>
          </div>
        </form> : <>
          <div className="dialog-grid">
            <div className="detail-block"><span>วันและเวลา</span><strong>{formatFridayDate(activity.date)}</strong><small>{activity.startTime || "ยังไม่ระบุเวลาเริ่ม"} – {activity.endTime || "ยังไม่ระบุเวลาสิ้นสุด"}</small></div>
            <div className="detail-block"><span>รูปแบบและสถานที่</span><strong>{FRIDAY_FORMAT[activity.format]}</strong>{activity.rawFormat !== undefined && <small>ข้อความต้นทาง: {activity.rawFormat || "ไม่ได้ระบุ"}</small>}<small>{activity.location || "ยังไม่ระบุสถานที่"}</small></div>
            <div className="detail-block"><span>ศาสตร์</span><strong>{activity.domain}</strong></div>
            {([ ["capacity", "จำนวนรับ"], ["booked", "จำนวนจอง"], ["attended", "จำนวนมาจริง"] ] as const).map(([key, label]) => <div className="detail-block" key={key}><span>{label}</span><strong>{fridayCount(activity[key])}{activity[key] !== null ? " คน" : ""}</strong></div>)}
          </div>
          <section className="detail-section note-section"><h3>รายละเอียดกิจกรรม</h3><p>{activity.description || "ยังไม่มีรายละเอียด"}</p></section>
          <section className="detail-section"><h3>ผลประเมินจากนิสิต</h3>
            {activity.status === "completed" ? <><p className="panel-caption">{activity.studentEvaluations.length} แบบประเมิน · เฉลี่ยจากคำตอบที่มีคะแนนในแต่ละด้าน</p><FridayStudentRatings activities={[activity]} /></> : <p className="panel-caption">ยังไม่สรุปผลประเมินสำหรับกิจกรรมที่ยังไม่จัดหรือยกเลิก</p>}
            <p className="friday-reported-score">คะแนนสรุปที่บันทึกในตารางต้นทาง: <strong>{fridayScore(activity.reportedScore)}{activity.reportedScore !== null ? " / 5" : ""}</strong><small>แสดงแยกจากคะแนนที่คำนวณจากแบบประเมิน</small></p>
            {comments.length > 0 && <details className="friday-comments"><summary>หัวข้อที่สนใจและข้อเสนอแนะ ({comments.length} คำตอบ)</summary>{comments.map((response, index) => <div className="friday-feedback" key={response.id}><strong>คำตอบที่ {index + 1}</strong><dl><dt>หัวข้อที่สนใจ</dt><dd>{response.suggestedTopic || "ไม่ได้ตอบ"}</dd><dt>ข้อเสนอแนะ</dt><dd>{response.suggestion || "ไม่ได้ตอบ"}</dd></dl></div>)}</details>}
          </section>
          <section className="detail-section"><h3>ผลประเมินจากบริษัท</h3><p className="panel-caption">ความคิดเห็น 3 ด้านจากแบบประเมินบริษัท</p><FridayCompanyFeedback activity={activity} /></section>
          <section className="detail-section note-section"><h3>หมายเหตุ</h3><p>{activity.notes || "ไม่มีหมายเหตุ"}</p></section>
          <section className="detail-section"><h3>ลิงก์เผยแพร่หรือรูปภาพ</h3>{activity.publicationUrl ? <a href={activity.publicationUrl} target="_blank" rel="noreferrer">เปิดลิงก์กิจกรรม ↗</a> : <p className="panel-caption">ยังไม่มีลิงก์</p>}</section>
        </>}
        {editor.saveMessage && <p className="edit-save-message" role="status">{editor.saveMessage}</p>}
      </div>
      {editor.isEditing && <DialogEditFooter formId="friday-edit-form" onCancel={editor.cancelEditing} dirty={editor.hasUnsavedEdits} error={editor.saveError} saving={editor.saving} />}
    </div>
  </dialog>;
}
