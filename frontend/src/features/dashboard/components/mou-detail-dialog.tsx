"use client";
import { CompanyContacts } from "./company-contacts";
import { DialogEditFooter } from "@/features/dashboard/components/dialog-edit-footer";
import { display } from "@/features/dashboard/lib/format";
import { authorizationStatusOptions, MouEditDraft, statusClass, toMouEditDraft } from "@/features/dashboard/lib/mou-presentation";
import { processStatus, REVIEW_STATUSES } from "@/features/dashboard/lib/mou-stats";
import type { MouCompany } from "@/features/dashboard/lib/types";
import { useRecordEditor } from "@/features/dashboard/lib/use-record-editor";

export function MouDetailDialog({
  company,
  dialogRef,
  onClose,
  onSave,
  statusOptions,
}: {
  company: MouCompany | null;
  dialogRef: React.Ref<HTMLDialogElement>;
  onClose: () => void;
  onSave: (id: string, draft: MouEditDraft) => boolean | Promise<boolean>;
  statusOptions: string[];
}) {
  const {
    isEditing, saving, draft, saveMessage, saveError, saveFailed, hasUnsavedEdits, updateDraft,
    startEditing, cancelEditing, saveEditing,
    requestClose, handleCancel, handleBackdropClick,
  } = useRecordEditor<MouCompany, MouEditDraft>({ record: company, toDraft: toMouEditDraft, onSave, onClose });

  return (
    <dialog
      ref={dialogRef}
      className="mou-dialog"
      tabIndex={-1}
      aria-labelledby="mou-dialog-title"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      {company ? (
        <div>
          <div className="dialog-header">
            <div>
              <p className="section-kicker">MOU · แถวข้อมูลที่ {company.rowNumber}</p>
              <h2 id="mou-dialog-title">{company.companyThai}</h2>
              <p className="mou-dialog-subtitle">{company.companyEnglish} · {company.shortNames.join(", ") || "ไม่มีชื่อสั้น"}</p>
            </div>
            <div className="dialog-header-actions">
              {!isEditing ? <button className="secondary-button" type="button" onClick={startEditing}>แก้ไขข้อมูล</button> : null}
              <button className="icon-button" type="button" onClick={requestClose} disabled={saving} aria-label="ปิดรายละเอียด" title="ปิดรายละเอียด">×</button>
            </div>
          </div>

          <div className="dialog-statusbar">
            <div><span>สถานะปัจจุบัน</span><strong className={`status-pill ${statusClass(company.documentStatus)}`}>{company.documentStatus}</strong></div>
            <div><span>ผู้ประสานงาน</span><strong>{display(company.coordinator)}</strong></div>
          </div>

          <div className="dialog-content" tabIndex={0}>
            <CompanyContacts module="mou" sourceId={company.id} />
            {isEditing && draft ? (
              <form id="mou-edit-form" className="course-edit-form" onSubmit={saveEditing}>
                <div className="edit-mode-note"><span className="note-icon" aria-hidden="true">i</span><span>แก้ไขข้อมูล MOU สำหรับ demo · บันทึกไว้ในเบราว์เซอร์เครื่องนี้</span></div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>ข้อมูลบริษัทและเอกสาร</h3><span className="panel-caption">แก้ไขข้อมูลที่แสดงในตารางได้</span></div>
                  <div className="course-edit-grid">
                    <label className="edit-field-full"><span>ชื่อบริษัท (ภาษาไทย)</span><input value={draft.companyThai} onChange={(event) => updateDraft("companyThai", event.target.value)} required /></label>
                    <label><span>ชื่อบริษัท (ภาษาอังกฤษ)</span><input value={draft.companyEnglish} onChange={(event) => updateDraft("companyEnglish", event.target.value)} required /></label>
                    <label><span>ชื่อย่อ</span><input value={draft.shortNames} onChange={(event) => updateDraft("shortNames", event.target.value)} placeholder="คั่นด้วยจุลภาค" /></label>
                    <label><span>สถานะเอกสาร MOU</span><select value={draft.documentStatus} onChange={(event) => updateDraft("documentStatus", event.target.value)}>{statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label><span>มีการแก้ไข</span><select value={draft.revised} onChange={(event) => updateDraft("revised", event.target.value as MouCompany["revised"])}><option value="N">ไม่มีการแก้ไข (N)</option><option value="Y">มีการแก้ไข (Y)</option></select></label>
                    <label><span>Template MoU</span><input value={draft.template} onChange={(event) => updateDraft("template", event.target.value)} placeholder="เช่น อว 64/00314" /></label>
                    <label><span>บันทึกขอตรวจแก้</span><input value={draft.revisionRequest} onChange={(event) => updateDraft("revisionRequest", event.target.value)} /></label>
                    <label><span>วันที่ส่งตรวจแก้</span><input value={draft.revisionSentDate} onChange={(event) => updateDraft("revisionSentDate", event.target.value)} placeholder="เช่น 28 ม.ค. 69" /></label>
                    <label><span>สถานะตรวจแก้</span><select value={draft.reviewStatus} onChange={event => updateDraft("reviewStatus", event.target.value as MouCompany["reviewStatus"])}>{Object.entries(REVIEW_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="edit-field-full"><span>ผลจากศูนย์กฎหมาย</span><input value={draft.legalReviewResult} onChange={(event) => updateDraft("legalReviewResult", event.target.value)} /></label>
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>ข้อมูลมอบอำนาจและผู้ติดต่อ</h3><span className="panel-caption">อัปเดตเพื่อให้รายการติดตามเป็นปัจจุบัน</span></div>
                  <div className="course-edit-grid">
                    <label><span>เอกสารขอมอบอำนาจ</span><input value={draft.authorizationRequest} onChange={(event) => updateDraft("authorizationRequest", event.target.value)} /></label>
                    <label><span>วันที่ส่งมอบอำนาจ</span><input value={draft.authorizationSentDate} onChange={(event) => updateDraft("authorizationSentDate", event.target.value)} placeholder="เช่น 10 ม.ค. 69" /></label>
                    <label><span>สถานะมอบอำนาจ</span><select value={draft.authorizationStatus} onChange={(event) => updateDraft("authorizationStatus", event.target.value)}><option value="">ยังไม่ระบุสถานะ</option>{[...new Set([...authorizationStatusOptions, ...(draft.authorizationStatus ? [draft.authorizationStatus] : [])])].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                    <label><span>ผู้ประสานงาน</span><input value={draft.coordinator} onChange={(event) => updateDraft("coordinator", event.target.value)} placeholder="ยังไม่ระบุ" /></label>
                    <label className="edit-field-full"><span>หมายเหตุ</span><textarea value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} rows={3} placeholder="รายละเอียดเพิ่มเติม" /></label>
                  </div>
                </div>
              </form>
            ) : (
              <>
                <div className="mou-detail-grid">
                  <div className="detail-block"><span>Template MoU</span><strong>{display(company.template)}</strong></div>
                  <div className="detail-block"><span>มีการแก้ไข</span><strong>{company.revised === "Y" ? "มีการแก้ไข" : "ไม่มีการแก้ไข"}</strong></div>
                  <div className="detail-block"><span>บันทึกขอตรวจแก้</span><strong>{display(company.revisionRequest)}</strong></div>
                  <div className="detail-block"><span>วันที่ส่งตรวจแก้</span><strong>{display(company.revisionSentDate)}</strong></div>
                  <div className="detail-block"><span>ผลจากศูนย์กฎหมาย</span><strong>{display(company.legalReviewResult)}</strong></div>
                  <div className="detail-block"><span>เอกสารขอมอบอำนาจ</span><strong>{display(company.authorizationRequest)}</strong></div>
                  <div className="detail-block"><span>วันที่ส่งมอบอำนาจ</span><strong>{display(company.authorizationSentDate)}</strong></div>
                  <div className="detail-block"><span>สถานะมอบอำนาจ</span><strong>{display(company.authorizationStatus)}</strong></div>
                </div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>ความคืบหน้ากระบวนการ</h3><span className="panel-caption">{processStatus(company).filter((item) => item.done).length}/{processStatus(company).length} ขั้นตอน</span></div>
                  <p className="panel-caption">สถานะตรวจแก้: {REVIEW_STATUSES[company.reviewStatus]}</p>
                  <div className="mou-process-list">
                    {processStatus(company).map((item) => <div className="mou-process-row" key={item.label}><span className={`mou-process-dot ${item.done ? "done" : "pending"}`}>{item.done ? "✓" : "–"}</span><strong>{item.label}</strong><small>{item.done ? "ดำเนินการแล้ว" : "ยังต้องติดตาม"}</small></div>)}
                  </div>
                </div>

                <div className="detail-section note-section"><h3>หมายเหตุ</h3><p>{display(company.note)}</p></div>
                <div className="source-footnote">Source: {company.raw["บริษัท"] ?? "ไม่ระบุ"} · {company.raw["Company Name"] ?? "ไม่ระบุ"} · {company.raw["No"] ? `row ${company.rowNumber}` : "ไม่มี source row"}</div>
              </>
            )}
            {saveMessage ? <p className={`edit-save-message${saveFailed ? " dataset-warning" : ""}`} role="status">{saveFailed ? "" : "✓ "}{saveMessage}</p> : null}
          </div>
          {isEditing && <DialogEditFooter saving={saving} formId="mou-edit-form" onCancel={cancelEditing} dirty={hasUnsavedEdits} error={saveError} />}
        </div>
      ) : null}
    </dialog>
  );
}