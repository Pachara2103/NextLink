"use client";

import { usePlanState } from "../lib/use-plan-state.ts";
import { formatNumber } from "../lib/format.ts";

/**
 * บันทึก / ยกเลิก for the week board, beside the board's own heading.
 *
 * It sits here and not in the page header on purpose. A save button in the
 * header looks like it saves the page, and it does not: a course edited in the
 * course tab, a room added, a checklist box ticked are each one decision and
 * are written when they are pressed. The only thing that waits is the
 * timetable, because laying out a week is twenty drags that are one decision —
 * so the button that sends it belongs to the thing it sends, where the count
 * of what is waiting can be read in the same glance as the grid it refers to.
 *
 * Nothing is rendered for a plan kept in this browser: that one is written at
 * the press, so `unsaved` never leaves zero and a disabled pair of buttons
 * would only raise a question it then refuses to answer.
 */
export function TimetableSave() {
  const plan = usePlanState();
  if (plan.mode !== "api") return null;

  const waiting = plan.unsaved > 0;
  const busy = plan.status === "saving";

  return (
    <div className="timetable-save" role="group" aria-label="การบันทึกตารางห้องเรียน">
      <span className={waiting ? "timetable-save-state is-draft" : "timetable-save-state"} role="status">
        {busy
          ? "กำลังบันทึก…"
          : waiting
            ? `ยังไม่ได้บันทึก ${formatNumber(plan.unsaved)} รายการ`
            : "บันทึกแล้ว"}
      </span>
      {waiting ? (
        <>
          <button
            className="timetable-save-now"
            type="button"
            disabled={busy}
            /* The list is what makes the count checkable: a planner who has
               been dragging for ten minutes can see that the thing waiting is
               the four moves they meant and not a stray drop. */
            title={plan.unsavedLabels.join(" · ")}
            onClick={() => void plan.saveBoard()}
          >
            บันทึกตาราง
          </button>
          <button
            className="timetable-save-cancel"
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("ยกเลิกการแก้ตารางที่ยังไม่ได้บันทึก? ตารางจะกลับไปเป็นแบบที่บันทึกไว้ล่าสุด")) return;
              void plan.discardBoard();
            }}
          >
            ยกเลิก
          </button>
        </>
      ) : null}
    </div>
  );
}
