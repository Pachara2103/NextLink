"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { MESSAGES } from "@/lib/constants";
import { useConsole } from "@/store/console-store";

/**
 * "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" — ค้างอยู่บนสุดจนกว่าจะติดต่อได้อีกครั้ง
 *
 * ไม่ใช่ toast: toast หายไปเองในสามวินาที แต่สถานะนี้อยู่นานเท่าที่เซิร์ฟเวอร์
 * ยังไม่กลับมา และตราบใดที่มันยังอยู่ ข้อมูลบนจอก็ยังเชื่อไม่ได้ - ของแบบนี้
 * ต้องค้างให้เห็นตลอด ไม่ใช่แวบเดียวแล้วหาย
 *
 * ปุ่ม "ลองใหม่ตอนนี้" มีไว้ให้คนที่ไม่อยากรอรอบถัดไป (store poll ให้อยู่แล้ว
 * ทุก 2 วินาที) - `sync("initial")` เป็นการอ่านล้วน ยิงซ้ำได้ไม่มีผลข้างเคียง
 */
export function ServerStatusBanner() {
  const { serverDown, syncing, sync } = useConsole();

  if (!serverDown) return null;

  return (
    <div className="sticky top-0 z-40 border-b border-danger-line bg-surface/85 px-5 py-2.5 backdrop-blur-xl sm:px-8">
      <Alert
        tone="error"
        title={MESSAGES.serverDownTitle}
        detail={MESSAGES.serverDownDetail}
        className="mx-auto max-w-[1200px]"
        trailing={
          <Button
            icon="refresh"
            size="sm"
            loading={syncing !== null}
            onClick={() => void sync("initial")}
          >
            ลองใหม่ตอนนี้
          </Button>
        }
      />
    </div>
  );
}
