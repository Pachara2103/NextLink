"use client";

export function DialogEditFooter({ formId, onCancel, dirty, error, saving = false, savedLabel = "บันทึกไว้ในเบราว์เซอร์นี้" }: {
  formId: string; onCancel: () => void; dirty: boolean; error: string; saving?: boolean; savedLabel?: string;
}) {
  return <div className="dialog-edit-footer">
    {error ? <p className="dataset-warning" role="alert">{error}</p> : null}
    <div className="dialog-edit-actions">
      <span className="edit-draft-status" role="status">{dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : savedLabel}</span>
      <button className="secondary-button" type="button" onClick={onCancel} disabled={saving}>ยกเลิก</button>
      <button className="primary-button" type="submit" form={formId} disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
    </div>
  </div>;
}
