"use client";
import { CompanyContacts } from "./company-contacts";
import { DialogEditFooter } from "@/features/dashboard/components/dialog-edit-footer";
import { display, formatNumber } from "@/features/dashboard/lib/format";
import { CompanyEditDraft, gapLabel, mouTone, RANK_LABELS, toEditDraft } from "@/features/dashboard/lib/internship-presentation";
import { INTAKE_META, intakeKind, RANKS, type CompanyStats } from "@/features/dashboard/lib/internship-stats";
import type { InternshipCompany, InternshipPayload } from "@/features/dashboard/lib/types";
import { useRecordEditor } from "@/features/dashboard/lib/use-record-editor";

export function CompanyDetailDialog({
  stats,
  dialogRef,
  totalApplications,
  track, readOnlyIntake = false,
  onClose,
  onSave,
}: {
  stats: CompanyStats | null;
  dialogRef: React.Ref<HTMLDialogElement>;
  totalApplications: number;
  track: InternshipPayload["track"];
  readOnlyIntake?: boolean;
  onClose: () => void;
  onSave: (id: string, draft: CompanyEditDraft) => boolean | Promise<boolean>;
}) {
  const company = stats?.company ?? null;
  const {
    isEditing, saving, draft, setDraft, saveMessage, saveError, saveFailed, hasUnsavedEdits, updateDraft,
    startEditing, cancelEditing, saveEditing,
    requestClose, handleCancel, handleBackdropClick,
  } = useRecordEditor<InternshipCompany, CompanyEditDraft>({ record: company, toDraft: toEditDraft, onSave, onClose });

  const updatePosition = (index: number, field: "name" | "declaredIntake" | "accepted", value: string) => {
    setDraft((current) => current && {
      ...current,
      positions: current.positions.map((position, at) => (at === index ? { ...position, [field]: value } : position)),
    });
  };

  const maxRankPicks = stats ? Math.max(...(stats ? Object.keys(stats.picksByRank).map(Number).filter(r => r > 0) : RANKS).map((rank) => stats.picksByRank[rank]), 1) : 1;

  return (
    <dialog
      ref={dialogRef}
      className="internship-dialog"
      tabIndex={-1}
      aria-labelledby="internship-dialog-title"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      {stats && company ? (
        <div>
          <div className="dialog-header">
            <div>
              <p className="section-kicker">{track} · บริษัท · แถวข้อมูลที่ {company.rowNumber}</p>
              <h2 id="internship-dialog-title">{company.name}</h2>
              <p className="internship-dialog-subtitle">{company.shortName} · {company.industry}</p>
            </div>
            <div className="dialog-header-actions">
              {!isEditing ? <button className="secondary-button" type="button" onClick={startEditing} disabled={readOnlyIntake} title={readOnlyIntake ? "เลือกทุกชั้นปีและทุกรอบก่อนแก้จำนวนรวม" : undefined}>บันทึกจำนวนที่รับ</button> : null}
              <button className="icon-button" type="button" onClick={requestClose} disabled={saving} aria-label="ปิดรายละเอียด" title="ปิดรายละเอียด">×</button>
            </div>
          </div>

          <div className="dialog-statusbar">{readOnlyIntake && <p>กำลังดูเฉพาะกลุ่มที่เลือก หากต้องการแก้จำนวนรวมให้เลือกทุกชั้นปีและทุกรอบ</p>}
            <div><span>สถานะ MOU</span><strong className={`status-pill ${mouTone(company.mouStatus)}`}>{company.mouStatus}</strong></div>
            <div><span>ผู้ประสานงาน</span><strong>{display(company.coordinator, "ยังไม่มีผู้ประสานงาน")}</strong></div>
            <div><span>ผลการรับ</span><strong className={`status-pill ${INTAKE_META[stats.intake].tone}`}>{INTAKE_META[stats.intake].label}</strong></div>
          </div>

          <div className="dialog-content" tabIndex={0}>
            <CompanyContacts module={track === "ฝึกงาน" ? "internship" : "cooperative"} sourceId={company.id} />
            {isEditing && draft ? (
              <form id="internship-edit-form" className="course-edit-form" onSubmit={saveEditing}>
                <div className="edit-mode-note"><span className="note-icon" aria-hidden="true">i</span><span>บันทึกจำนวนรับ{track}สำหรับ demo · เก็บไว้เฉพาะหน้านี้ในเบราว์เซอร์</span></div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>จำนวนรับรายตำแหน่ง</h3><span className="panel-caption">ที่แจ้งไว้ เทียบกับที่รับตามทะเบียน</span></div>
                  <div className="intake-edit-list">
                    <div className="intake-edit-head" aria-hidden="true"><span>ตำแหน่ง</span><span>แจ้งจะรับ</span><span>รับตามทะเบียน</span></div>
                    {draft.positions.map((position, index) => (
                      <div className="intake-edit-row" key={`${company.id}-position-${index}`}>
                        <label><span className="sr-only">ชื่อตำแหน่งที่ {index + 1}</span>
                          <input value={position.name} onChange={(event) => updatePosition(index, "name", event.target.value)} required />
                        </label>
                        <label><span className="sr-only">จำนวนที่แจ้งจะรับของ {position.name}</span>
                          <input type="number" min={0} inputMode="numeric" value={position.declaredIntake} onChange={(event) => updatePosition(index, "declaredIntake", event.target.value)} />
                        </label>
                        <label><span className="sr-only">จำนวนที่รับตามทะเบียนของ {position.name}</span>
                          <input type="number" min={0} inputMode="numeric" value={position.accepted} onChange={(event) => updatePosition(index, "accepted", event.target.value)} />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>ข้อมูลบริษัท</h3><span className="panel-caption">แก้ไขข้อมูลที่แสดงในตารางได้</span></div>
                  <div className="course-edit-grid">
                    <label className="edit-field-full"><span>ชื่อบริษัท</span><input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} required /></label>
                    <label><span>ชื่อย่อ</span><input value={draft.shortName} onChange={(event) => updateDraft("shortName", event.target.value)} required /></label>
                    <label><span>ประเภทธุรกิจ</span><input value={draft.industry} onChange={(event) => updateDraft("industry", event.target.value)} /></label>
                    <label><span>ผู้ประสานงาน</span><input value={draft.coordinator} onChange={(event) => updateDraft("coordinator", event.target.value)} placeholder="ยังไม่มีผู้ประสานงาน" /></label>
                    <label className="edit-field-full"><span>หมายเหตุ</span><textarea value={draft.note} onChange={(event) => updateDraft("note", event.target.value)} rows={2} placeholder="รายละเอียดเพิ่มเติม" /></label>
                  </div>
                </div>
              </form>
            ) : (
              <>
                <div className="internship-detail-grid">
                  <div className="detail-block"><span>แจ้งจะรับ</span><strong>{formatNumber(stats.declared)} คน</strong></div>
                  <div className="detail-block"><span>รับตามทะเบียน</span><strong>{formatNumber(stats.accepted)} คน</strong></div>
                  <div className="detail-block"><span>ผลต่าง</span><strong>{gapLabel(stats)}</strong></div>
                  <div className="detail-block"><span>อัตราการรับ</span><strong>{stats.declared ? `${stats.fillRate}%` : "—"}</strong></div>
                  <div className="detail-block"><span>นิสิตเลือกทั้งหมด</span><strong>{formatNumber(stats.totalPicks)} ครั้ง</strong></div>
                  <div className="detail-block"><span>เลือกเป็นอันดับ 1</span><strong>{formatNumber(stats.firstPicks)} คน</strong></div>
                  <div className="detail-block"><span>ผู้สมัครต่อที่นั่ง</span><strong>{stats.declared ? `${stats.competition.toFixed(1)} เท่า` : "—"}</strong></div>
                  <div className="detail-block"><span>ส่วนแบ่งอันดับ 1</span><strong>{totalApplications ? Math.round((stats.firstPicks / totalApplications) * 100) : 0}%</strong></div>
                </div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>ตำแหน่งที่เปิดรับ</h3><span className="panel-caption">{company.positions.length} ตำแหน่ง</span></div>
                  <div className="intake-position-list">
                    {company.positions.map((position) => {
                      const kind = intakeKind(position.declaredIntake, position.accepted);
                      return (
                        <div className="intake-position-row" key={position.name}>
                          <strong>{position.name}</strong>
                          <span>แจ้ง {formatNumber(position.declaredIntake)}</span>
                          <span>รับตามทะเบียน {formatNumber(position.accepted)}</span>
                          <small className={INTAKE_META[kind].tone}>{INTAKE_META[kind].label}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="detail-section">
                  <div className="section-heading-row"><h3>นิสิตเลือกบริษัทนี้เป็นอันดับใด</h3><span className="panel-caption">จาก {formatNumber(totalApplications)} ใบสมัคร</span></div>
                  <div className="rank-breakdown">
                    {(stats ? Object.keys(stats.picksByRank).map(Number).filter(r => r > 0) : RANKS).map((rank) => (
                      <div className="rank-breakdown-row" key={rank}>
                        <span className={`rank-key rank-${rank}`} aria-hidden="true" />
                        <span>{RANK_LABELS[rank] ?? `อันดับ ${rank}`}</span>
                        <span className="bar-track"><span className={`bar-fill rank-${rank}`} style={{ width: `${(stats.picksByRank[rank] / maxRankPicks) * 100}%` }} /></span>
                        <strong>{formatNumber(stats.picksByRank[rank])}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="detail-section note-section"><h3>หมายเหตุ</h3><p>{display(company.note, "ไม่มีหมายเหตุ")}</p></div>
                <div className="source-footnote">Source: {company.raw["บริษัท"] ?? "ไม่ระบุ"} · {company.raw["Company Name"] ?? "ไม่ระบุ"} · row {company.rowNumber}</div>
              </>
            )}
            {saveMessage ? <p className={`edit-save-message${saveFailed ? " dataset-warning" : ""}`} role="status">{saveFailed ? "" : "✓ "}{saveMessage}</p> : null}
          </div>
          {isEditing && <DialogEditFooter saving={saving} formId="internship-edit-form" onCancel={cancelEditing} dirty={hasUnsavedEdits} error={saveError} />}
        </div>
      ) : null}
    </dialog>
  );
}