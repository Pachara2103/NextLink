"use client";
import { mockDashboardData } from "../lib/mock-data";
import { CompanyContacts } from "./company-contacts";
import type { Ref } from "react";
import { DialogEditFooter } from "@/features/dashboard/components/dialog-edit-footer";
import { CourseEditDraft, sessionValidity, courseOccupancy, courseStatusOptions, dayNames, deliveryModeLabels, deliveryModeOptions, documentsStatusOptions, documentTypeLabels, invitationStatusOptions, mcvStatusOptions, statusClass, toCourseEditDraft, workflowProgress, workflowRawStatus, workflowStatusClass, workflowStatusOptions, workflowStatusText } from "@/features/dashboard/lib/elective-presentation";
import { firstIssue, isWorkflowComplete, operationalReadiness } from "@/features/dashboard/lib/elective-stats";
import { formatNumber } from "@/features/dashboard/lib/format";
import type { DashboardCourse, DeliveryMode, WorkflowTaskStatus } from "@/features/dashboard/lib/types";
import { useRecordEditor } from "@/features/dashboard/lib/use-record-editor";

export function CourseDialog({
  course,
  dialogRef,
  onClose,
  onSave,
  isLive = false,
}: {
  course: DashboardCourse | null;
  dialogRef: Ref<HTMLDialogElement>;
  onClose: () => void;
  onSave: (id: string, draft: CourseEditDraft) => boolean | Promise<boolean>;
  isLive?: boolean;
}) {
  const readiness = course ? operationalReadiness(course) : null;
  const {
    isEditing, saving, draft, setDraft, saveMessage, saveError, saveFailed, hasUnsavedEdits, updateDraft,
    startEditing, cancelEditing, saveEditing,
    requestClose, handleCancel, handleBackdropClick,
  } = useRecordEditor<DashboardCourse, CourseEditDraft>({ record: course, toDraft: toCourseEditDraft, onSave, onClose });

  const updateWorkflowStatus = (key: string, status: WorkflowTaskStatus) => {
    setDraft((current) => current ? {
      ...current,
      workflow: current.workflow.map((task) => task.key === key ? { ...task, status } : task),
    } : current);
  };

  return (
    <dialog
      ref={dialogRef}
      className="course-dialog"
      tabIndex={-1}
      aria-labelledby="course-dialog-title"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      {course ? (
        <div>
          <div className="dialog-header">
            <div>
              <p className="section-kicker">{course.courseCode} · ตอน {course.section} · {course.category}</p>
              <h2 id="course-dialog-title">{course.title}</h2>
            </div>
            <div className="dialog-header-actions">
              {!isEditing ? <button className="secondary-button" type="button" onClick={startEditing}>แก้ไขข้อมูล</button> : null}
              <button className="icon-button" type="button" onClick={requestClose} disabled={saving} aria-label="ปิดรายละเอียด" title="ปิดรายละเอียด">×</button>
            </div>
          </div>
          <div className="dialog-statusbar">
            <div><span>สิ่งที่ต้องทำต่อ</span><strong>{firstIssue(course)}</strong></div>
            <div className="dialog-next-meta">
              <span className={`status-pill ${statusClass(course.status.course)}`}>รายวิชา: {course.status.course}</span>
              <span className={`status-pill ${readiness?.className ?? "tone-neutral"}`}>งาน: {readiness?.label ?? "ยังไม่ระบุ"}</span>
            </div>
          </div>
          <div className="dialog-content" tabIndex={0}>
            {course && <CompanyContacts module="elective" sourceId={mockDashboardData.courses.find(c => c.id === course.id)?.provider ?? course.provider} />}
            {isEditing && draft ? (
              <form id="elective-edit-form" className="course-edit-form" onSubmit={saveEditing}>
                <div className="edit-mode-note"><span className="note-icon" aria-hidden="true">i</span><span>{isLive ? "บันทึกในฐานข้อมูลส่วนกลาง พร้อมประวัติผู้แก้ไข" : "แก้ไขข้อมูลสำหรับ demo · บันทึกไว้ในเบราว์เซอร์เครื่องนี้"}</span></div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>ข้อมูลรายวิชา</h3><span className="panel-caption">แก้ไขข้อมูลที่แสดงในตารางได้</span></div>
                  <div className="course-edit-grid">
                    <label className="edit-field-full"><span>ชื่อรายวิชา</span><input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} required /></label>
                    <label><span>หมวดหมู่</span><input value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} required /></label>
                    <label><span>บริษัท / หน่วยงาน</span><input value={draft.provider} onChange={(event) => updateDraft("provider", event.target.value)} required /></label>
                    <label><span>อาจารย์ผู้สอน</span><input value={draft.instructor} onChange={(event) => updateDraft("instructor", event.target.value)} required /></label>
                    <label><span>ผู้ประสานงาน</span><input value={draft.coordinatorName} onChange={(event) => updateDraft("coordinatorName", event.target.value)} placeholder="ยังไม่ระบุ" /></label>
                    <label><span>อีเมลผู้ประสานงาน</span><input type="email" value={draft.coordinatorEmail} onChange={(event) => updateDraft("coordinatorEmail", event.target.value)} placeholder="ยังไม่ระบุ" /></label>
                    <label><span>เบอร์โทรผู้ประสานงาน</span><input type="tel" value={draft.coordinatorPhone} onChange={event => updateDraft("coordinatorPhone", event.target.value)} /></label>
                    <label><span>LINE ผู้ประสานงาน</span><input value={draft.coordinatorLineId} onChange={event => updateDraft("coordinatorLineId", event.target.value)} /></label>
                    <label><span>นิสิตลงทะเบียน</span><input type="number" min={0} value={draft.enrolled} readOnly={isLive} title={isLive ? "คำนวณจากทะเบียนนิสิตที่ลงทะเบียน" : undefined} onChange={(event) => updateDraft("enrolled", Number(event.target.value))} /></label>
                    <label><span>ที่นั่งทั้งหมด</span><input type="number" min={0} value={draft.capacity ?? ""} placeholder="ยังไม่ทราบ" onChange={(event) => updateDraft("capacity", event.target.value === "" ? null : Number(event.target.value))} /></label>
                    <label><span>รหัส Join MCV</span><input value={draft.mcvJoinCode} onChange={(event) => updateDraft("mcvJoinCode", event.target.value)} placeholder="ยังไม่มีรหัส" /></label>
                    <label><span>จำนวนสัปดาห์</span><input type="number" min={0} value={draft.weeks} onChange={(event) => updateDraft("weeks", Number(event.target.value))} /></label>
                    <label><span>รูปแบบการเรียน</span><select value={draft.deliveryMode} onChange={(event) => updateDraft("deliveryMode", event.target.value as DeliveryMode)}>{deliveryModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label className="edit-field-full"><span>หมายเหตุ</span><textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} rows={3} placeholder="รายละเอียดเพิ่มเติม" /></label>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>อัปเดตสถานะหลัก</h3><span className="panel-caption">เลือกจากสถานะที่ระบบรองรับ</span></div>
                  <div className="course-edit-grid">
                    <label><span>สถานะรายวิชา</span><select value={draft.courseStatus} onChange={(event) => updateDraft("courseStatus", event.target.value)}>{courseStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label><span>สถานะเอกสาร</span><select value={draft.documentsStatus} onChange={(event) => updateDraft("documentsStatus", event.target.value)}>{documentsStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label><span>สถานะหนังสือเชิญ</span><select value={draft.invitationStatus} onChange={(event) => updateDraft("invitationStatus", event.target.value)}>{invitationStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label><span>สถานะ MCV</span><select value={draft.mcvStatus} onChange={(event) => updateDraft("mcvStatus", event.target.value)}>{mcvStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>อัปเดตสถานะงานย่อย</h3><span className="panel-caption">{draft.workflow.length} ขั้นตอน</span></div>
                  <div className="course-edit-workflow">
                    {draft.workflow.map((item) => {
                      const task = course.workflow.find((candidate) => candidate.key === item.key);
                      return <label key={item.key}><span>{task?.label ?? item.key}</span><select value={item.status} onChange={(event) => updateWorkflowStatus(item.key, event.target.value as WorkflowTaskStatus)}>{workflowStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
                    })}
                  </div>
                </div>
              </form>
            ) : (
              <>
            <div className="dialog-grid">
              <div className="detail-block"><span>บริษัท / หน่วยงาน</span><strong>{course.provider}</strong></div>
              <div className="detail-block"><span>อาจารย์ผู้สอน</span><strong>{course.instructor}</strong></div>
              <div className="detail-block"><span>ผู้ประสานงาน</span><strong>{course.coordinator?.name ?? "ยังไม่ระบุ"}</strong><small>{course.coordinator?.email ?? "ยังไม่ระบุ"}</small><small>โทร: {course.coordinator?.phone || "ยังไม่ระบุ"} · LINE: {course.coordinator?.lineId || "ยังไม่ระบุ"}</small></div>
              <div className="detail-block"><span>การลงทะเบียน</span><strong>{formatNumber(course.enrolled)} / {formatNumber(course.capacity)} คน</strong><small>{courseOccupancy(course) === null ? "ยังคำนวณอัตราไม่ได้" : `${courseOccupancy(course)}% ของที่นั่ง`}</small></div>
              <div className="detail-block"><span>รหัส Join MCV</span><strong>{course.mcvJoinCode ?? "ยังไม่มีรหัส"}</strong><small>แหล่งข้อมูลแถวที่ {course.source.rowNumber ?? "ยังไม่ระบุ"}</small></div>
              <div className="detail-block"><span>ภาคการศึกษา</span><strong>ปีการศึกษา {course.academicYear} / {course.term}</strong><small>{course.weeks} สัปดาห์ · {deliveryModeLabels[course.deliveryMode]}</small></div>
            </div>

            <div className="detail-section">
              <h3>ตารางสอน</h3>
              {course.sessions.map((session) => (
                <div className="session-row" key={session.id ?? `${session.dayOfWeek}-${session.startTime}-${session.validFrom}-${session.validUntil}`}>
                  <span>{dayNames[session.dayOfWeek]}</span><strong>{session.startTime}–{session.endTime}</strong><small>{session.location}{sessionValidity(session)}{session.timezone && session.timezone !== "Asia/Bangkok" ? ` · ${session.timezone}` : ""}</small>
                </div>
              ))}
            </div>

            <div className="detail-section">
              <h3>สถานะการดำเนินงาน</h3>
              <div className="status-grid">
                {Object.entries({
                  "รายวิชา": course.status.course,
                  "เอกสาร": course.status.documents,
                  "หนังสือเชิญ": course.status.invitation,
                  MCV: course.status.mcv,
                }).map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong className={`status-pill ${statusClass(value)}`}>{value}</strong></div>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <div className="section-heading-row"><h3>สถานะย่อยจากชีต</h3><span className="panel-caption">{workflowProgress(course).complete}/{workflowProgress(course).total} ขั้นตอนเสร็จแล้ว</span></div>
              <div className="workflow-list">
                {[...course.workflow].sort((left, right) => Number(isWorkflowComplete(left)) - Number(isWorkflowComplete(right))).map((task) => (
                  <div className={`workflow-row ${isWorkflowComplete(task) ? "" : "workflow-row-attention"}`} key={task.key}>
                    <div className="workflow-copy"><strong>{task.label}</strong>{task.detail ? <small>{task.detail}</small> : null}</div>
                    <div className="workflow-status-copy">
                      <span className={`status-pill ${workflowStatusClass(task.status)}`}>{workflowStatusText(task)}</span>
                      {workflowRawStatus(task) ? <small className="raw-status">ชีต: {workflowRawStatus(task)}</small> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <div className="section-heading-row"><h3>ไฟล์และเอกสาร</h3><span className="panel-caption">เก็บลิงก์จากแหล่งข้อมูล</span></div>
              <div className="document-list">
                {course.documents.map((document) => (
                  <div className="document-row" key={`${document.type}-${document.filename}`}>
                    <div><strong>{documentTypeLabels[document.type] ?? document.type}</strong><small>{document.filename} · {document.status}</small></div>
                    {document.externalUrl ? <a href={document.externalUrl} target="_blank" rel="noreferrer">เปิดไฟล์</a> : <span className="missing-file">ยังไม่มีลิงก์</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-section note-section"><h3>หมายเหตุ</h3><p>{course.notes ?? "ไม่มีหมายเหตุ"}</p></div>
            <div className="source-footnote">Source: {course.source.system ?? "ไม่ระบุ"} · {course.source.sheetName ?? "ไม่ระบุชีต"} · row {course.source.rowNumber ?? "-"} · {course.source.sourceKey ?? "ไม่มี source key"}</div>
              </>
            )}
            {saveMessage ? <p className={`edit-save-message${saveFailed ? " dataset-warning" : ""}`} role="status">{saveFailed ? "" : "✓ "}{saveMessage}</p> : null}
          </div>
          {isEditing && <DialogEditFooter saving={saving} formId="elective-edit-form" onCancel={cancelEditing} dirty={hasUnsavedEdits} error={saveError} savedLabel={isLive ? "ข้อมูลจากฐานข้อมูลส่วนกลาง" : undefined} />}
        </div>
      ) : null}
    </dialog>
  );
}
