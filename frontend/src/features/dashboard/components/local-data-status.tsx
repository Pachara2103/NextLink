import { formatUpdated } from "@/features/dashboard/lib/format";

export function LocalDataStatus({ editedAt, warning, hasOverrides, timezone, onReset, source }: {
  editedAt: string | null; warning: string; hasOverrides: boolean; timezone: string; onReset: () => void; source?: "mock" | "postgresql";
}) {
  if (source === "postgresql") return <span className="local-edit-note">{editedAt ? `บันทึกในฐานข้อมูลแล้ว ${formatUpdated(editedAt, timezone)}` : "ข้อมูลจากฐานข้อมูลส่วนกลาง"}<button type="button" className="local-edit-reset" onClick={onReset}>โหลดข้อมูลล่าสุด</button></span>;
  if (!editedAt && !warning && !hasOverrides) return null;
  return <span className="local-edit-note">
    {warning ? "ข้อมูลในเบราว์เซอร์มีปัญหา" : editedAt ? `แก้ในเบราว์เซอร์นี้ ${formatUpdated(editedAt, timezone)}` : "มีข้อมูลที่แก้ในเบราว์เซอร์นี้"}
    <button type="button" className="local-edit-reset" onClick={onReset}>คืนค่าตั้งต้น</button>
  </span>;
}

export function StorageWarning({ message }: { message: string }) {
  return message ? <p className="dataset-warning" role="status">{message}</p> : null;
}
