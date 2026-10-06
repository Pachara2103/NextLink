"use client";

import { usePlanState } from "@/features/elective-plan/lib/use-plan-state";

/**
 * บันทึก for the board, and the way to throw the board's moves away.
 *
 * It sits in the board's own heading rather than in the page header because
 * the board is the only thing it saves. Placing a class is not one decision
 * but twenty drags where the first nineteen are thinking out loud, so those
 * are held here until somebody means them; a course added on another page, or
 * a box ticked in the checklist, is a decision on its own and is already in
 * the database by the time this bar is looked at.
 *
 * In seed mode the plan is written to this browser the moment it changes, so
 * there is nothing to save and the bar is left out entirely — a permanently
 * greyed-out บันทึก reads as broken.
 */
export function TimetableSave() {
  const plan = usePlanState();
  if (plan.mode !== "api") return null;

  const { unsaved, unsavedLabels, blocked, status } = plan;
  const saving = status === "saving";
  const dirty = unsaved > 0;

  const discard = () => {
    if (window.confirm(`ยกเลิกการแก้ตาราง ${unsaved} รายการที่ยังไม่บันทึก?`)) void plan.discard();
  };

  return (
    <div className="timetable-save" role="group" aria-label="การบันทึกตาราง">
      {blocked ? (
        <span className="timetable-save-note" role="status">บันทึกค้าง — ลองอีกครั้ง หรือยกเลิก</span>
      ) : null}
      {dirty ? (
        <button type="button" className="timetable-save-cancel" onClick={discard} disabled={saving}>
          ยกเลิกการแก้ไข
        </button>
      ) : null}
      <button
        type="button"
        className={`timetable-save-now${dirty ? " is-dirty" : ""}`}
        onClick={() => void plan.save()}
        disabled={!dirty || saving}
        // The list of what is waiting, so "5 รายการ" is checkable without
        // pressing anything. Capped: an afternoon's work is not a tooltip.
        title={
          dirty
            ? `ยังไม่ได้บันทึก:\n${unsavedLabels.slice(-12).join("\n")}${unsavedLabels.length > 12 ? "\n…" : ""}`
            : "บันทึกตารางแล้วทั้งหมด"
        }
      >
        {saving ? "กำลังบันทึก…" : dirty ? `บันทึกตาราง ${unsaved} รายการ` : "บันทึกแล้ว"}
      </button>
    </div>
  );
}
