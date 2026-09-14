"use client";

import { formatNumber } from "@/features/dashboard/lib/format";
import { QUEUE_META, QUEUE_ORDER, type QueueKind } from "@/features/dashboard/lib/queue";

/**
 * The one card that leads every dashboard: how much work is waiting.
 *
 * It had drifted into three different things — a toggle on one page, a plain
 * card in third position on another, and a breakdown that renamed the shared
 * queue buckets on the third. Readers move between these three pages, so the
 * card that answers "what do I do next" should be in the same place, look the
 * same, and count the same buckets by the same names.
 *
 * `pressed` is for the one page where the card also filters the table: pass it
 * and the card reports its state, leave it out and the card just leads the
 * reader to the queue.
 */
export function PriorityKpi({
  label,
  count,
  counts,
  note,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  counts: Record<QueueKind, number>;
  note: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`kpi-card kpi-card-button priority-kpi red${pressed ? " is-active" : ""}${count === 0 ? " is-clear" : ""}`}
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={`${label} ${formatNumber(count)} รายการ`}
    >
      <span className="kpi-topline">
        <span className="kpi-label">{label}</span>
        {count > 0 ? <span className="kpi-alert-icon" aria-hidden="true">!</span> : null}
      </span>
      <span className="kpi-value">{formatNumber(count)}</span>
      <span className="kpi-note">{count === 0 ? "ไม่มีงานที่ต้องติดตามในมุมมองนี้" : note}</span>
      <span className="kpi-breakdown">
        {QUEUE_ORDER.filter(kind => counts[kind] > 0).map((kind) => (
          <span key={kind}>{formatNumber(counts[kind])} {QUEUE_META[kind].label}</span>
        ))}
      </span>
    </button>
  );
}
