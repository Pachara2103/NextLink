"use client";
import { useState } from "react";
import type { RowChanges } from "@/features/dashboard/lib/local-dataset";
import type { StorageRecovery } from "@/features/dashboard/lib/use-local-dataset";

export function StorageRecoveryPanel({ recovery, onRecover }: { recovery: StorageRecovery | null; onRecover: (changes: RowChanges[]) => Promise<boolean> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  if (!recovery) return null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([recovery.raw], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "nextlink-saved-data-backup.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const save = async () => {
    setPending(true);
    try {
      const patches = recovery.changes.map((row, i) => ({ ...row, changes: row.changes.filter((_, j) => selected.includes(`${i}:${j}`)) })).filter(row => row.changes.length);
      if (await onRecover(patches)) setSelected([]);
    } finally { setPending(false); }
  };
  return <section className="dataset-warning storage-recovery" aria-label="ตรวจทานข้อมูลที่บันทึกไว้">
    <details><summary>ตรวจทานและกู้คืนข้อมูลที่บันทึกไว้</summary>
      <p>เลือกเฉพาะช่องที่ต้องการนำกลับมา ช่องที่ไม่เลือกจะใช้ข้อมูลต้นทางล่าสุด ดาวน์โหลดสำเนาได้ก่อนตัดสินใจ</p>
      {recovery.changes.map((row, i) => <fieldset key={row.id}><legend>{row.id}</legend>{row.changes.map((change, j) => <label className="edit-field-full" key={j}>
        <input type="checkbox" checked={selected.includes(`${i}:${j}`)} onChange={event => setSelected(values => event.target.checked ? [...values, `${i}:${j}`] : values.filter(key => key !== `${i}:${j}`))} />
        {change.path.join(".")} · ต้นทาง: {JSON.stringify(change.before) ?? "ไม่มีค่า"} → ที่บันทึกไว้: {JSON.stringify(change.after) ?? "ไม่มีค่า"}
      </label>)}</fieldset>)}
      <button className="secondary-button" type="button" onClick={download}>ดาวน์โหลดข้อมูลเดิม</button>
      <button className="primary-button" type="button" disabled={pending || !selected.length} onClick={save}>{pending ? "กำลังบันทึก…" : "ใช้เฉพาะช่องที่เลือก"}</button>
    </details>
  </section>;
}
