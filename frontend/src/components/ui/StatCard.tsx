import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "matched" | "unmatched" | "pending";

const TONES: Record<
  StatTone,
  { box: string; label: string; icon: string; value: string; bar: string }
> = {
  neutral: {
    box: "border-line-soft bg-surface",
    label: "text-text-3",
    icon: "text-text-4",
    value: "text-text",
    bar: "bg-text-4",
  },
  matched: {
    box: "border-ok-line bg-ok-soft",
    label: "text-ok",
    icon: "text-ok",
    value: "text-ok",
    bar: "bg-ok",
  },
  unmatched: {
    box: "border-warn-line bg-warn-soft",
    label: "text-warn",
    icon: "text-warn",
    value: "text-warn",
    bar: "bg-warn",
  },
  pending: {
    box: "border-accent-line bg-accent-soft",
    label: "text-accent",
    icon: "text-accent",
    value: "text-accent",
    bar: "bg-accent",
  },
};

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  footnote,
  progress,
}: {
  label: string;
  value: number | string;
  icon: IconName;
  tone?: StatTone;
  footnote?: ReactNode;
  /** 0-100. Renders a bar in place of the footnote row. */
  progress?: number;
}) {
  const spec = TONES[tone];
  return (
    <div className={cn("rounded-2xl border p-4", spec.box)}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.14em]",
            spec.label,
          )}
        >
          {label}
        </span>
        <Icon name={icon} className={cn("size-4 shrink-0", spec.icon)} />
      </div>
      <div
        className={cn(
          "mt-2 font-display text-[28px] leading-none font-semibold tabular-nums",
          spec.value,
        )}
      >
        {value}
      </div>
      {progress !== undefined ? (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-sunken">
          <div
            className={cn("h-full rounded-full", spec.bar)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : (
        footnote && (
          <p className={cn("mt-2 text-[11px]", spec.label)}>{footnote}</p>
        )
      )}
    </div>
  );
}
