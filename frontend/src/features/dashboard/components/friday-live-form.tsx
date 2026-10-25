"use client";

import type { FridayEditable, FridayOptions, FridayPerson, FridaySession } from "@/lib/services/friday-activity";
import { LIVE_FRIDAY_FORMATS, fridayNewSession, fridayPersonKey } from "../lib/friday-api";

export function FridayLiveForm({ draft, options, disabled, onChange }: { draft: FridayEditable; options: FridayOptions; disabled: boolean; onChange: (next: FridayEditable) => void }) {
  function update<K extends keyof FridayEditable>(key: K, value: FridayEditable[K]) { onChange({ ...draft, [key]: value }); }
  function changeSession(index: number, patch: Partial<FridaySession>) { update("sessions", draft.sessions.map((session, row) => row === index ? { ...session, ...patch } : session)); }
  function changePerson(index: number, patch: Partial<FridayPerson>) { update("people", draft.people.map((person, row) => row === index ? { ...person, ...patch } : person)); }
  return <fieldset className="friday-live-fields" disabled={disabled}>
    <legend className="sr-only">ข้อมูลกิจกรรม</legend>
    <div className="course-edit-grid">
      <label className="edit-field-full"><span>ชื่อกิจกรรม *</span><input required maxLength={300} value={draft.title} onChange={event => update("title", event.target.value)} /></label>
      <label><span>ปีการศึกษา (พ.ศ.) *</span><input required type="number" min={2543} max={2643} step={1} value={draft.academicYear + 543} onChange={event => update("academicYear", Number(event.target.value) - 543)} /></label>
      <label><span>ภาคการศึกษา *</span><select value={draft.term} onChange={event => update("term", event.target.value as FridayEditable["term"])}><option value="FIRST">เทอม 1</option><option value="SECOND">เทอม 2</option><option value="SUMMER">ภาคฤดูร้อน</option></select></label>
      <label><span>ศาสตร์</span><input maxLength={200} value={draft.domain ?? ""} onChange={event => update("domain", event.target.value || null)} /></label>
      <label><span>รูปแบบ</span><select value={draft.format} onChange={event => update("format", event.target.value as FridayEditable["format"])}>{Object.entries(LIVE_FRIDAY_FORMATS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="edit-field-full"><span>เจ้าหน้าที่ผู้รับผิดชอบ *</span><select required value={draft.ownerUserId} onChange={event => update("ownerUserId", event.target.value)}><option value="">เลือกเจ้าหน้าที่ผู้รับผิดชอบ</option>{options.owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
      <label className="edit-field-full"><span>รายละเอียดกิจกรรม</span><textarea rows={3} maxLength={20000} value={draft.description ?? ""} onChange={event => update("description", event.target.value || null)} /></label>
    </div>
    <fieldset className="cap-checkboxes detail-section"><legend>บริษัทที่ร่วมกิจกรรม</legend><p className="panel-caption">เลือกจากทะเบียนบริษัทกลาง รองรับหลายบริษัท</p><div className="friday-live-picker">{options.companies.map(company => <label key={company.id}><input type="checkbox" checked={draft.companyIds.includes(company.id)} onChange={event => update("companyIds", event.target.checked ? [...draft.companyIds, company.id] : draft.companyIds.filter(id => id !== company.id))} />{company.name}</label>)}</div>{options.companies.length === 0 && <p className="panel-caption">ยังไม่มีบริษัทในทะเบียนกลาง</p>}</fieldset>
    <fieldset className="cap-checkboxes detail-section"><legend>ผู้ประสานงานและวิทยากร</legend><p className="panel-caption">เลือกบริษัทก่อนเพื่อแสดงผู้ติดต่อในทะเบียน หรือเพิ่มผู้ร่วมกิจกรรมภายนอกด้วยชื่อที่ระบุเอง</p><div className="friday-live-picker">{options.people.filter(person => draft.companyIds.includes(person.companyId ?? "")).map(person => {
      const key = fridayPersonKey(person);
      const selected = draft.people.some(item => fridayPersonKey(item) === key);
      return <label key={key}><input type="checkbox" checked={selected} onChange={event => update("people", event.target.checked ? [...draft.people, { namespace: person.namespace, sourceId: person.sourceId, name: person.name, role: "coordinator" }] : draft.people.filter(item => fridayPersonKey(item) !== key))} />{person.name}{person.companyId ? ` · ${options.companies.find(company => company.id === person.companyId)?.name ?? "บริษัทในทะเบียน"}` : ""}</label>;
    })}</div>
      {draft.people.map((person, index) => <div className="friday-live-person course-edit-grid" key={person.id ?? `${person.namespace}-${person.sourceId ?? index}`}><label><span>ชื่อ{person.namespace === "guest" ? "ผู้ร่วมกิจกรรมภายนอก" : "จากทะเบียน"}</span><input required maxLength={300} readOnly={person.namespace !== "guest"} value={person.name} onChange={event => changePerson(index, { name: event.target.value })} /></label><label><span>หน้าที่</span><select value={person.role} onChange={event => changePerson(index, { role: event.target.value as FridayPerson["role"] })}><option value="coordinator">ผู้ประสานงาน</option><option value="speaker">วิทยากร</option></select></label><button className="text-button" type="button" onClick={() => update("people", draft.people.filter((_, row) => row !== index))}>นำ {person.name || "รายชื่อ"} ออก</button></div>)}
      <button className="secondary-button" type="button" onClick={() => update("people", [...draft.people, { namespace: "guest", sourceId: null, name: "", role: "speaker" }])}>เพิ่มผู้ร่วมกิจกรรมภายนอก</button>
    </fieldset>
    <section className="detail-section"><div className="section-heading-row"><h3>รอบจัดกิจกรรม ({draft.sessions.length})</h3><button className="secondary-button" type="button" onClick={() => update("sessions", [...draft.sessions, fridayNewSession()])}>เพิ่มรอบจัด</button></div><p className="panel-caption">วันที่ใช้ ค.ศ. · เว้นจำนวนว่างเมื่อยังไม่ทราบ · 0 หมายถึงไม่มีคน</p>
      {draft.sessions.map((session, index) => <fieldset className="friday-live-session" key={session.id ?? index}><legend>รอบที่ {index + 1}</legend><div className="course-edit-grid">
        <label><span>วันที่จัด (ค.ศ.)</span><input type="date" value={session.sessionDate ?? ""} onChange={event => changeSession(index, { sessionDate: event.target.value || null })} /></label>
        <label><span>สถานะรอบ</span><select value={session.status} onChange={event => changeSession(index, { status: event.target.value as FridaySession["status"] })}><option value="planned">วางแผน</option><option value="held">จัดแล้ว</option><option value="cancelled">ยกเลิก</option></select></label>
        <label><span>เวลาเริ่ม</span><input type="time" value={session.startTime ?? ""} onChange={event => changeSession(index, { startTime: event.target.value || null })} /></label>
        <label><span>เวลาสิ้นสุด</span><input type="time" value={session.endTime ?? ""} onChange={event => changeSession(index, { endTime: event.target.value || null })} /></label>
        <label className="edit-field-full"><span>สถานที่</span><input maxLength={500} value={session.location ?? ""} onChange={event => changeSession(index, { location: event.target.value || null })} /></label>
        {([["capacity", "จำนวนรับ"], ["booked", "จำนวนจอง"], ["attended", "จำนวนมาจริง"]] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min={0} max={1000000} step={1} value={session[key] ?? ""} placeholder="ยังไม่ทราบ" onChange={event => changeSession(index, { [key]: event.target.value === "" ? null : Number(event.target.value) })} /></label>)}
      </div><button className="text-button" type="button" onClick={() => update("sessions", draft.sessions.filter((_, row) => row !== index))}>นำรอบที่ {index + 1} ออก</button></fieldset>)}
      {draft.sessions.length === 0 && <p className="panel-caption">ยังไม่มีรอบจัดกิจกรรม สามารถเพิ่มภายหลังได้</p>}
    </section>
  </fieldset>;
}
