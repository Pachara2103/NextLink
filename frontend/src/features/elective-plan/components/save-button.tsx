"use client";

import { usePlanState } from "@/features/elective-plan/lib/use-plan-state";

/**
 * บันทึก, and the two controls that only make sense beside it.
 *
 * The planner used to send a request per press, which meant the answer to
 * "have I saved?" was always yes and the control was unnecessary. Now a press
 * only draws, so the header has to carry three facts at once: whether there is
 * anything unsaved, how much, and the way back. They sit together at the top
 * right of every planner page because the draft is the *page's* state, not one
 * table's — a course added on the list and a period dragged on the grid are
 * one unsaved batch, and a button that lived on either page would be lying
 * about the other.
 *
 * In seed mode the plan is written to this browser the moment it changes, so
 * there is never anything to save and the whole row is left out rather than
 * rendered disabled — a permanently greyed-out บันทึก reads as broken.
 */
export function SaveButton() {
  const plan = usePlanState();
  if (plan.mode !== "api") return null;

  const { unsaved, unsavedLabels, blocked, canUndo, canRedo, status } = plan;
  const saving = status === "saving";
  const dirty = unsaved > 0;

  const discard = () => {
    if (window.confirm(`ยกเลิกการแก้ไข ${unsaved} รายการที่ยังไม่บันทึก และโหลดแผนล่าสุดจากเซิร์ฟเวอร์?`)) {
      void plan.discard();
    }
  };

  // The pair stays while there is anything to step through in *either*
  // direction: stepping all the way back leaves nothing unsaved, and a ↪ that
  // vanished at that exact moment would make the last ↩ the one press that
  // cannot be taken back.
  const stepping = dirty || canRedo;

  return (
    <div className="save-bar" role="group" aria-label="การบันทึกแผน">
      {stepping ? (
        <>
          <button
            type="button"
            className="save-step"
            onClick={() => void plan.undo()}
            disabled={!canUndo || saving}
            title="ย้อนการแก้ไขล่าสุด (ยังไม่ได้บันทึก)"
            aria-label="ย้อนการแก้ไขล่าสุด"
          >
            ↩
          </button>
          <button
            type="button"
            className="save-step"
            onClick={() => void plan.redo()}
            disabled={!canRedo || saving}
            title="ทำซ้ำการแก้ไขที่ย้อนไป"
            aria-label="ทำซ้ำการแก้ไขที่ย้อนไป"
          >
            ↪
          </button>
          {dirty ? (
            <button type="button" className="save-discard" onClick={discard} disabled={saving}>
              ยกเลิกการแก้ไข
            </button>
          ) : null}
        </>
      ) : null}
      <button
        type="button"
        className={`save-now${dirty ? " is-dirty" : ""}`}
        onClick={() => void plan.save()}
        disabled={!dirty || saving}
        // The list of what is waiting, so "5 รายการ" is checkable without
        // pressing anything. Capped: a long afternoon's work is not a tooltip.
        title={
          dirty
            ? `ยังไม่ได้บันทึก:\n${unsavedLabels.slice(-12).join("\n")}${unsavedLabels.length > 12 ? "\n…" : ""}`
            : "บันทึกแล้วทั้งหมด"
        }
      >
        {saving ? "กำลังบันทึก…" : dirty ? `บันทึก ${unsaved} รายการ` : "บันทึกแล้ว"}
      </button>
      {blocked ? (
        <span className="save-blocked" role="status">
          บันทึกค้าง — ลองอีกครั้ง หรือยกเลิกการแก้ไข
        </span>
      ) : null}
    </div>
  );
}
