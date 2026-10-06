"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { usePlanState } from "@/features/elective-plan/lib/use-plan-state";

/** The overview — the one page that is about the plan as a whole. */
const OVERVIEW = "/elective-plan";

function download(raw: string, term: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `nextlink-plan-${term}-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS: Record<string, string> = {
  loading: "กำลังโหลดแผน…",
  saving: "กำลังบันทึก…",
  error: "แผนยังบันทึกไม่สำเร็จ",
};

/** Persistent controls live with the layout's store, including undo after navigation. */
export function PlanStorage() {
  const plan = usePlanState();
  const pathname = usePathname();
  const file = useRef<HTMLInputElement>(null);
  const shared = plan.mode === "api";
  const backup = () => download(plan.recoveryRaw ?? JSON.stringify(plan.document, null, 2), plan.document.termId);

  /**
   * Backing up and importing are things you do to the whole plan, at the start
   * or the end of a sitting — not while ticking a checklist box or booking a
   * room. On four pages they were four copies of a control nobody was reaching
   * for, standing next to the one everybody reaches for.
   *
   * On the shared plan they are gone entirely. A file on one person's disk is
   * not a backup of a table everyone is writing to, and importing one would
   * mean one person's afternoon replacing everybody's — see `resetAll` and
   * `importPlan` in use-plan-state.ts.
   *
   * The recovery panel below keeps its own backup button on every page: it only
   * appears when the plan cannot be saved, and it is the way out of that.
   */
  const wholePlan = !shared && (pathname === OVERVIEW || pathname === `${OVERVIEW}/`);

  /**
   * No "บันทึกแล้ว — เลิกทำ" toast on the shared plan any more.
   *
   * It existed because every press was a request: the change was already
   * everyone's before the person could look at it, so the only honest offer
   * was a five-second window to take it back. A press now only draws, so the
   * offer is permanent and lives in the header beside บันทึก — which is also
   * where the person is looking when they wonder whether it went in.
   */

  return (
    <section className="plan-storage" aria-label="การบันทึกแผน">
      <div className="plan-storage-actions">
        <span role="status">
          แผน {plan.term.shortLabel} · {" "}
          {plan.planning
            ? "กำลังจัดตาราง…"
            : plan.status === "draft"
              ? `แก้ไว้ ${plan.unsaved} รายการ ยังไม่ได้บันทึก`
              : STATUS[plan.status] ??
                (shared ? "บันทึกแล้ว" : plan.editedAt ? "บันทึกแล้วในเบราว์เซอร์นี้" : "ยังไม่มีการแก้ไขแผน")}
        </span>
        {plan.planning ? <button type="button" className="secondary-button" onClick={plan.cancelPlanning}>ยกเลิกการจัดตาราง</button> : null}
        {wholePlan ? (
          <>
            <button type="button" className="secondary-button" disabled={!plan.ready} onClick={backup}>สำรองแผน JSON</button>
            <button type="button" className="secondary-button" disabled={!plan.ready || plan.recoveryRaw !== null} onClick={() => file.current?.click()}>นำเข้าแผน</button>
          </>
        ) : null}
        {shared ? (
          // A re-read replaces the screen with what the server has, which is
          // exactly what a draft is not — so ask first when there is one.
          <button type="button" className="secondary-button" disabled={plan.status === "saving"} onClick={() => {
            if (plan.unsaved && !window.confirm(`โหลดแผนล่าสุด? การแก้ไข ${plan.unsaved} รายการที่ยังไม่บันทึกจะหายไป`)) return;
            void plan.discard();
          }}>โหลดแผนล่าสุด</button>
        ) : (
          <button type="button" className="secondary-button" disabled={!plan.canUndo || plan.status === "saving"} onClick={() => void plan.undo()}>เลิกทำรายการล่าสุด</button>
        )}
        {wholePlan ? (
          <input ref={file} className="sr-only" type="file" accept=".json,application/json" aria-label="ไฟล์แผน JSON" onChange={async (event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (!selected || !window.confirm("แทนที่แผนปัจจุบันด้วยไฟล์นี้? สามารถเลิกทำรายการล่าสุดได้")) return;
            try {
              await plan.importPlan(await selected.text());
            } catch {
              plan.reportError("อ่านไฟล์แผนไม่ได้ กรุณาเลือกไฟล์ใหม่ แผนปัจจุบันยังอยู่");
            }
          }} />
        ) : null}
      </div>
      {plan.error ? (
        <div className="plan-storage-error" role="alert">
          <p>{plan.error}</p>
          {shared && plan.unsaved > 0 ? (
            // The draft is still on screen and still the person's work; the
            // way out is to send it again, and only then to throw it away.
            <>
              <button type="button" className="secondary-button" disabled={plan.status === "saving"} onClick={() => void plan.save()}>ลองบันทึกอีกครั้ง</button>
              <button type="button" className="secondary-button" onClick={() => {
                if (!window.confirm(`ยกเลิกการแก้ไข ${plan.unsaved} รายการที่ยังไม่บันทึก และโหลดแผนล่าสุด?`)) return;
                void plan.discard();
              }}>ยกเลิกการแก้ไขและโหลดใหม่</button>
            </>
          ) : shared ? (
            // Nothing was queued, so this was a read that failed: ask again.
            <button type="button" className="secondary-button" onClick={() => void plan.retry()}>ลองอีกครั้ง</button>
          ) : plan.recoveryRaw !== null ? (
            <>
              <p>ข้อมูลเดิมยังอยู่ กดสำรองเพื่อเก็บไฟล์ต้นฉบับก่อนเริ่มแผนใหม่</p>
              <button type="button" className="secondary-button" onClick={async () => {
                if (!window.confirm("ดาวน์โหลดสำรองข้อมูลเดิมแล้วเริ่มแผนใหม่?")) return;
                backup();
                await plan.recoverEmpty();
              }}>สำรองและเริ่มแผนใหม่</button>
            </>
          ) : plan.status === "error" ? (
            <>
              <p>กรุณาสำรองแผนก่อนปิดหน้านี้ หากพื้นที่เต็มหรือมีแผนใหม่จากแท็บอื่น งานที่ยังไม่บันทึกอาจหายเมื่อโหลดใหม่</p>
              <button type="button" className="secondary-button" onClick={() => void plan.retry()}>ลองบันทึกอีกครั้ง</button>
            </>
          ) : null}
          {shared ? null : (
            <button type="button" className="secondary-button" onClick={() => {
              if (!window.confirm("โหลดแผนที่บันทึกไว้ล่าสุด? งานที่ยังไม่บันทึกจะถูกแทนที่")) return;
              backup();
              plan.reload();
            }}>สำรองและโหลดแผนล่าสุด</button>
          )}
        </div>
      ) : null}
    </section>
  );
}
