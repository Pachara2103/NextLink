"use client";
import { CompanyContacts } from "./company-contacts";

import { useState, type Ref } from "react";
import { CapstoneRanking } from "@/features/dashboard/components/capstone-ranking";
import type { CapstoneDataset, CapstoneDraft, CapstoneTopic, CompanyRanking, TopicStatus, TeamPhase } from "@/features/dashboard/lib/capstone-types";
import { toCapstoneDraft, needsChangeReason } from "@/features/dashboard/lib/capstone-edit";
import { useRecordEditor } from "@/features/dashboard/lib/use-record-editor";
import { TOPIC_STATUSES, TEAM_PHASES } from "@/features/dashboard/lib/capstone-statuses";
import { applicationCount, confirmedCount, interestCount, studentIds } from "@/features/dashboard/lib/capstone-stats";
import { formatUpdated } from "@/features/dashboard/lib/format";

export type CapstoneTab = "topic" | "teams" | "company" | "notes";
const tabs: { id: CapstoneTab; label: string }[] = [
  { id: "topic", label: "หัวข้อและข้อตกลง" }, { id: "teams", label: "กลุ่มและอันดับ" },
  { id: "company", label: "บริษัท–อาจารย์" }, { id: "notes", label: "บันทึกและประวัติ" },
];
function Field({ label, value, editing, multiline = false, onChange }: { label: string; value: string; editing: boolean; multiline?: boolean; onChange: (value: string) => void }) {
  return <label className="cap-field"><span>{label}</span>{editing
    ? multiline ? <textarea maxLength={20000} value={value} onChange={e => onChange(e.target.value)} /> : <input maxLength={20000} value={value} onChange={e => onChange(e.target.value)} />
    : <span className="cap-field-value">{value || "ยังไม่มีข้อมูล"}</span>}</label>;
}

export function CapstoneDetailDialog({ topic, data, dialogRef, initialTab, initialRound, onClose, onSave, storageWarning }: {
  topic: CapstoneTopic | null; data: CapstoneDataset; dialogRef: Ref<HTMLDialogElement>;
  initialTab: CapstoneTab; initialRound: string; onClose: () => void; onSave: (draft: CapstoneDraft) => boolean | Promise<boolean>; storageWarning: string;
}) {
  const editor = useRecordEditor<CapstoneTopic, CapstoneDraft>({ record: topic, toDraft: t => toCapstoneDraft(t, data), onSave: (_id, draft) => onSave(draft), onClose });
  const { isEditing, draft, setDraft } = editor;
  const [tab, setTab] = useState<CapstoneTab>(initialTab);
  const [round, setRound] = useState(() => topic?.rounds.includes(initialRound) ? initialRound : topic?.rounds[0] ?? "");
  const [error, setError] = useState("");
  const current = isEditing && draft ? draft.topic : topic;
  const relationships = isEditing && draft ? draft.relationships : data.relationships.filter(r => r.companyId === topic?.companyId);
  const company = data.companies.find(c => c.id === current?.companyId);
  const setTopic = <K extends keyof CapstoneTopic>(key: K, value: CapstoneTopic[K]) => setDraft(d => d ? { ...d, topic: { ...d.topic, [key]: value } } : d);
  function setRanking(next: CompanyRanking) {
    if (!current) return;
    setTopic("rankings", [...current.rankings.filter(r => r.round !== next.round), next]);
  }
  const needsReason = Boolean(topic && current && needsChangeReason(topic, current));

  return <dialog ref={dialogRef} className="cap-dialog" tabIndex={-1} aria-labelledby="cap-dialog-title" onCancel={editor.handleCancel} onClick={editor.handleBackdropClick}>
    {current && <>
      <div className="dialog-header">
        <div><p className="section-kicker">{current.id} · ปี {current.year}</p><h2 id="cap-dialog-title">{current.title}</h2><p className="panel-caption">{company?.name ?? "หัวข้อจากนิสิต / อาจารย์"}</p></div>
        <div className="dialog-header-actions">
          {!isEditing && <button className="secondary-button" type="button" onClick={() => { editor.startEditing(); setError(""); }}>แก้ไขข้อมูล</button>}
          <button className="icon-button" type="button" onClick={editor.requestClose} disabled={editor.saving} aria-label="ปิดรายละเอียด">×</button>
        </div>
      </div>
      <div className="cap-dialog-tabs" role="group" aria-label="หมวดรายละเอียด">{tabs.map(t => <button key={t.id} type="button" aria-pressed={tab === t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      <form className="cap-dialog-form" onSubmit={async event => {
        event.preventDefault();
        if (!draft || !topic) return;
        if (!draft.topic.title.trim() || !draft.topic.category.trim()) { setError("กรุณาระบุชื่อหัวข้อและหมวดหมู่"); setTab("topic"); return; }
        if (draft.topic.capacity !== null && (!Number.isSafeInteger(draft.topic.capacity) || draft.topic.capacity < 0 || draft.topic.capacity > 1000)) { setError("จำนวนกลุ่มต้องเป็นจำนวนเต็ม 0–1,000 หรือเว้นว่างเมื่อยังไม่ทราบ"); setTab("topic"); return; }
        if (draft.topic.notes.some(n => !n.text.trim())) { setError("กรุณาใส่ข้อความในบันทึกใหม่"); setTab("notes"); return; }
        if (needsReason && !draft.reason.trim()) { setError("กรุณาระบุเหตุผลที่เปลี่ยนขอบเขตหรือผู้ดูแล"); return; }
        setError("");
        try { await editor.saveEditing(event); }
        catch { setError("บันทึกไม่ได้ เพราะข้อมูลบางรายการไม่ถูกต้อง กรุณาตรวจการแก้ไขอีกครั้ง"); }
      }}>
        <div className="dialog-content">
          {isEditing && <p className="edit-mode-note">แก้ไขข้อมูลตัวอย่าง · บันทึกในเบราว์เซอร์เครื่องนี้</p>}
          {storageWarning && <p className="cap-warning" role="status">{storageWarning}</p>}
          {tab === "topic" && <div className="cap-fields">
            <Field label="ชื่อหัวข้อ" value={current.title} editing={isEditing} onChange={v => setTopic("title", v)} />
            <Field label="หมวดหมู่" value={current.category} editing={isEditing} onChange={v => setTopic("category", v)} />
            <label className="cap-field"><span>สถานะหัวข้อ</span>{isEditing ? <select value={current.status} onChange={e => setTopic("status", e.target.value as TopicStatus)}>{Object.entries(TOPIC_STATUSES).map(([value, status]) => <option key={value} value={value}>{status.label}</option>)}</select> : <span className={`status-pill ${TOPIC_STATUSES[current.status].tone}`}>{TOPIC_STATUSES[current.status].label}</span>}</label>
            <label className="cap-field"><span>จำนวนกลุ่มที่รับได้</span>{isEditing ? <input type="number" min={0} max={1000} step={1} placeholder="ยังไม่ทราบ" value={current.capacity ?? ""} onChange={e => setTopic("capacity", e.target.value === "" ? null : Number(e.target.value))} /> : <span className="cap-field-value">{current.capacity ?? "ยังไม่ทราบ"} · ยืนยันแล้ว {confirmedCount(current)} กลุ่ม</span>}</label>
            <Field label="ผู้ประสานงาน" value={current.coordinator} editing={isEditing} onChange={v => setTopic("coordinator", v)} />
            <Field label="บทบาทผู้ติดต่อ" value={current.contactRole} editing={isEditing} onChange={v => setTopic("contactRole", v)} />
            <Field label="รายละเอียดโครงการ" value={current.description} multiline editing={isEditing} onChange={v => setTopic("description", v)} />
            <Field label="ขอบเขตงาน" value={current.scope} multiline editing={isEditing} onChange={v => setTopic("scope", v)} />
            <Field label="สิ่งส่งมอบ" value={current.deliverables} multiline editing={isEditing} onChange={v => setTopic("deliverables", v)} />
            <Field label="สิ่งสนับสนุนจากบริษัท" value={current.support} multiline editing={isEditing} onChange={v => setTopic("support", v)} />
            <Field label="ปัญหาที่ต้องติดตาม" value={current.issue} multiline editing={isEditing} onChange={v => setTopic("issue", v)} />
            <div className="cap-field"><span>เอกสารประกอบ</span>{current.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}</div>
          </div>}
          {tab === "teams" && <>
            <h3>กลุ่มผู้สมัครและอันดับจากบริษัท</h3>
            <p className="panel-caption">ปี {current.year} · สมัคร {applicationCount(current, round) ?? "ยังไม่ทราบจำนวน"} กลุ่มในรอบนี้</p>
            <CapstoneRanking topic={current} data={data} round={round} onRoundChange={setRound} onChange={isEditing ? setRanking : undefined} />
            <details className="cap-details"><summary>นิสิตที่เลือกหัวข้อ · รอบ {round} · {interestCount(current, round) ?? "ยังไม่มีข้อมูลรายบุคคล"}{current.interestKnown ? " คน" : ""}</summary>
              {current.interestKnown ? <ul>{[...studentIds(current, round)].map(id => <li key={id}>{data.students.find(s => s.id === id)?.name} ({id})</li>)}</ul> : <p>แสดงจำนวนกลุ่มจากใบสมัครได้เมื่อมีข้อมูล แต่ไม่ใช้ขนาดทีมคาดเดาจำนวนนิสิตที่สนใจ</p>}
            </details>
            <h3 className="cap-subheading">ทีมที่ยืนยันแล้ว</h3>
            <p className="panel-caption">แสดงสถานะปัจจุบันของโครงการปี {current.year} รวมทุกรอบ · การแก้อันดับไม่เปลี่ยนผลยืนยัน</p>
            {current.assignments.length === 0 && <p>ยังไม่มีทีมที่ยืนยัน</p>}
            {current.assignments.map(a => <section className="cap-team" key={a.id}>
              <h4>{data.teams.find(t => t.id === a.teamId)?.name}</h4>
              <div className="cap-fields"><label className="cap-field"><span>เฟสของ {data.teams.find(t => t.id === a.teamId)?.name}</span>{isEditing ? <select value={a.phase} onChange={e => setTopic("assignments", current.assignments.map(row => row.id === a.id ? { ...row, phase: e.target.value as TeamPhase } : row))}>{Object.entries(TEAM_PHASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className="cap-field-value">{TEAM_PHASES[a.phase]}</span>}</label>
              <Field label={`พี่เลี้ยงของ ${data.teams.find(t => t.id === a.teamId)?.name}`} value={a.mentor} editing={isEditing} onChange={v => setTopic("assignments", current.assignments.map(row => row.id === a.id ? { ...row, mentor: v } : row))} /></div>
              <fieldset className="cap-checkboxes"><legend>อาจารย์ที่ปรึกษาทีม</legend>{isEditing ? data.professors.map(p => <label key={p.id}><input type="checkbox" checked={a.professorIds.includes(p.id)} onChange={e => setTopic("assignments", current.assignments.map(row => row.id === a.id ? { ...row, professorIds: e.target.checked ? [...row.professorIds, p.id] : row.professorIds.filter(id => id !== p.id) } : row))} />{p.name}</label>) : <p>{a.professorIds.map(id => data.professors.find(p => p.id === id)?.name).join(", ") || "ยังไม่มีที่ปรึกษา"}</p>}</fieldset>
            </section>)}
            <h3 className="cap-subheading">Milestone และนัดหมาย</h3>
            {current.milestones.length ? current.milestones.map(m => <p key={m.id}>{m.title} · {data.teams.find(t => t.id === m.teamId)?.name} · {m.due} · {m.status}</p>) : <p>ยังไม่มีนัดหมาย</p>}
          </>}
          {tab === "company" && <>
            {current.companyId && <CompanyContacts module="capstone" sourceId={current.companyId} />}
            <h3>{company?.name ?? "ยังไม่มีบริษัทเจ้าของโครงการ"}</h3>
            {company && <><p>{company.englishName} · {company.domain}<br />{company.address}</p><p className="panel-caption">ความเชื่อมโยงนี้ใช้ร่วมทุกหัวข้อของบริษัท ส่วนที่ปรึกษาทีมแก้ในหมวดกลุ่มและอันดับ</p>
              {data.professors.map(p => {
                const relation = relationships.find(r => r.professorId === p.id);
                if (!isEditing && !relation) return null;
                return <section className="cap-relationship" key={p.id}>
                  {isEditing ? <label className="cap-checkbox"><input type="checkbox" checked={Boolean(relation)} onChange={e => setDraft(d => d ? { ...d, relationships: e.target.checked ? [...d.relationships, { id: `${company.id}-${p.id}`, companyId: company.id, professorId: p.id, role: "", source: "" }] : d.relationships.filter(r => r.professorId !== p.id) } : d)} />{p.name}</label> : <strong>{p.name}</strong>}
                  {relation && <div className="cap-fields">{(["role", "source"] as const).map(key => <Field key={key} label={`${key === "role" ? "บทบาท" : "ที่มาความเชื่อมโยง"} · ${p.name}`} value={relation[key]} editing={isEditing} onChange={v => setDraft(d => d ? { ...d, relationships: d.relationships.map(r => r.id === relation.id ? { ...r, [key]: v } : r) } : d)} />)}</div>}
                </section>;
              })}
              {!relationships.length && !isEditing && <p>ยังไม่มีข้อมูลอาจารย์ที่เชื่อมกับบริษัท</p>}
            </>}
          </>}
          {tab === "notes" && <>
            <div className="cap-section-heading"><h3>บันทึกและ Feedback</h3>{isEditing && <button className="secondary-button" type="button" onClick={() => setTopic("notes", [...current.notes, { id: crypto.randomUUID(), type: "บันทึก", basis: "ข้อเท็จจริง", text: "", author: "ผู้บันทึก Demo", at: new Date().toISOString() }])}>เพิ่มบันทึก</button>}</div>
            {current.notes.map((note, index) => <section className="cap-note" key={note.id}>
              {isEditing ? <><div className="cap-fields"><label className="cap-field"><span>ประเภทบันทึก {index + 1}</span><select value={note.type} onChange={e => setTopic("notes", current.notes.map(n => n.id === note.id ? { ...n, type: e.target.value as typeof note.type } : n))}>{["บันทึก", "ปัญหา", "Feedback"].map(t => <option key={t}>{t}</option>)}</select></label><label className="cap-field"><span>ลักษณะข้อมูล {index + 1}</span><select value={note.basis} onChange={e => setTopic("notes", current.notes.map(n => n.id === note.id ? { ...n, basis: e.target.value as typeof note.basis } : n))}><option>ข้อเท็จจริง</option><option>ความคิดเห็น</option></select></label></div>
              <Field label={`ข้อความบันทึก ${index + 1}`} value={note.text} editing multiline onChange={v => setTopic("notes", current.notes.map(n => n.id === note.id ? { ...n, text: v, at: new Date().toISOString() } : n))} /></> : <><span className="status-pill tone-neutral">{note.type} · {note.basis}</span><p>{note.text}</p></>}
              <small>{note.author} · {formatUpdated(note.at, "Asia/Bangkok")}</small>
            </section>)}
            <h3 className="cap-subheading">ประวัติการเปลี่ยนแปลง</h3><p className="panel-caption">ประวัติใน Demo ไม่ได้ยืนยันตัวตนผู้แก้ไข</p>
            {current.history.length ? [...current.history].reverse().map(h => <article className="cap-note" key={h.id}><strong>{h.field}</strong><p>{h.before} → {h.after}</p><small>{h.reason} · {formatUpdated(h.at, "Asia/Bangkok")}</small></article>) : <p>ยังไม่มีประวัติการเปลี่ยนแปลง</p>}
          </>}
          {isEditing && needsReason && <Field label="เหตุผลที่เปลี่ยนขอบเขตหรือผู้ดูแล" value={draft?.reason ?? ""} editing multiline onChange={v => editor.updateDraft("reason", v)} />}
          {editor.saveError && <p className="cap-warning" role="alert">{editor.saveError}</p>}
          {error && <p className="cap-warning" role="alert">{error}</p>}
        </div>
        {isEditing && <div className="cap-dialog-footer"><button className="secondary-button" type="button" onClick={() => { editor.cancelEditing(); setError(""); }}>ยกเลิกการแก้ไข</button><button className="primary-button" type="submit" disabled={editor.saving}>บันทึกการแก้ไข</button></div>}
      </form>
    </>}
  </dialog>;
}
