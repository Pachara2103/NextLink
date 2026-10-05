"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge, CountChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { companyService } from "@/lib/services/company";
import { describeError } from "@/lib/services/errors";
import { useConsole } from "@/store/console-store";
import type { ImportResult } from "@/types";

const PREFIX = "นำเข้าข้อมูลไม่สำเร็จ";

/**
 * "นำเข้าข้อมูล" บนหน้ากลุ่มไลน์และบริษัท — อัปโหลดไฟล์ MoU (.xlsx)
 *
 * ฝั่ง server เขียนทีละแถว (companies + mous + employees) แถวไหนพังก็
 * rollback ทั้งแถว แล้วส่ง No ของแถวนั้นกลับมา — ผลจึงแสดงเป็น dialog ที่
 * ไล่ดูได้ว่าแถวไหนต้องแก้ ไม่ใช่ toast ที่หายไปใน 3 วินาที
 *
 * บริษัทที่นำเข้ายังไม่ผูกกลุ่มไลน์ (group_id = null) จึงไปโผล่ที่
 * "บริษัทที่ยังไม่ผูกกลุ่มไลน์" หลังรีเฟรช
 */
export function ImportDataButton() {
  const { syncing, sync, notify } = useConsole();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // เคลียร์ทันที: เลือกไฟล์เดิมซ้ำ (หลังแก้ไฟล์แล้ว) ต้องยิง change อีกรอบได้
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      notify({ kind: "error", message: `${PREFIX}: รองรับเฉพาะไฟล์ .xlsx` });
      return;
    }

    setImporting(true);
    try {
      const res = await companyService.importXlsx(file);
      setFileName(file.name);
      setResult(res);
      // แถวที่สำเร็จ commit ไปแล้ว — อ่านรายการบริษัทใหม่ให้จอตรงกับฐานข้อมูล
      if (res.success > 0) void sync("groups");
    } catch (error) {
      notify({
        kind: "error",
        message: describeError(error, PREFIX, {
          network: `${PREFIX}: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ`,
          unknown: `${PREFIX} กรุณาลองใหม่อีกครั้ง`,
        }),
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => void onPick(event)}
      />
      <Button
        icon="upload"
        loading={importing}
        disabled={importing || syncing !== null}
        onClick={() => inputRef.current?.click()}
      >
        นำเข้าข้อมูล
      </Button>

      {result && (
        <ImportResultModal
          result={result}
          fileName={fileName}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}

function ImportResultModal({
  result,
  fileName,
  onClose,
}: {
  result: ImportResult;
  fileName: string;
  onClose: () => void;
}) {
  const failed = result.failed ?? [];
  const clean = failed.length === 0;

  return (
    <Modal
      open
      icon="upload"
      maxWidth="640px"
      title="ผลการนำเข้าข้อมูล"
      subtitle={fileName}
      onClose={onClose}
      footer={
        <div className="flex w-full justify-end">
          <Button onClick={onClose}>ปิด</Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-2">
        <span>ทั้งหมด</span>
        <CountChip>{result.total}</CountChip>
        <span className="ml-2">สำเร็จ</span>
        <CountChip tone="matched">{result.success}</CountChip>
        <span className="ml-2">ไม่สำเร็จ</span>
        <CountChip tone={clean ? "neutral" : "unmatched"}>{failed.length}</CountChip>
      </div>

      {clean ? (
        <Alert tone="success" title="นำเข้าสำเร็จครบทุกแถว" />
      ) : (
        <>
          <Alert
            tone="warn"
            title={`มี ${failed.length} แถวที่ไม่ได้นำเข้า`}
            detail="แถวเหล่านี้ไม่ถูกเพิ่มลงฐานข้อมูลเลย แก้ไขในไฟล์แล้วนำเข้าอีกครั้ง"
          />
          <ol className="space-y-2">
            {failed.map((row, index) => (
              <li
                key={`${row.no}-${index}`}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <Badge tone="unmatched">No {row.no}</Badge>
                <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-text">
                  {row.message}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}
