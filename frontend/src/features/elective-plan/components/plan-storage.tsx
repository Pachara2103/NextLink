"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { StatusToast, useStatusToast } from "@/features/elective-plan/components/status-toast";
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
   * "เลิกทำ" moved into the message that says the change was saved.
   *
   * A permanent button was right when the plan was one person's document with
   * a revision history behind it. On a shared plan there is no history to walk
   * back — only the one step just taken, and only while nobody has built on
   * it. A toast is exactly that offer, and it says so where the change
   * happened rather than in a toolbar.
   */
  const { toast, show, dismiss, holdTimer, resumeTimer } = useStatusToast();
  const undoable = useRef(false);
  useEffect(() => {
    if (!shared) return;
    if (plan.canUndo && !undoable.current) show("บันทึกแล้ว", () => void plan.undo());
    undoable.current = plan.canUndo;
  }, [shared, plan.canUndo, plan.undo, show]);

  return (
    <section className="plan-storage" aria-label="การบันทึกแผน">
      <div className="plan-storage-actions">
        <span role="status">
          แผน {plan.term.shortLabel} · {" "}
          {plan.planning
            ? "กำลังจัดตาราง…"
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
          <button type="button" className="secondary-button" disabled={plan.status === "saving"} onClick={() => plan.reload()}>โหลดแผนล่าสุด</button>
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
          {shared ? (
            // Nothing local was lost: the command that failed was rolled back,
            // so the only thing to offer is another look at what the server has.
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
      {shared ? (
        <StatusToast toast={toast} onDismiss={dismiss} onHold={holdTimer} onResume={resumeTimer} />
      ) : null}
    </section>
  );
}
