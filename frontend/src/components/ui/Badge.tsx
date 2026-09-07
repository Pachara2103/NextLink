import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeTone =
  | "matched"
  | "unmatched"
  | "pending"
  | "completed"
  | "neutral"
  | "muted"
  /** Company short names. One tone for every alias, on purpose. */
  | "alias"
  /** Company contacts. One tone for every contact, whatever their role. */
  | "contact";

const TONES: Record<BadgeTone, string> = {
  matched: "border-ok-line bg-ok-soft text-ok",
  unmatched: "border-warn-line bg-warn-soft text-warn",
  pending: "border-accent-line bg-accent-soft text-accent",
  completed: "border-ok-line bg-ok-soft text-ok",
  neutral: "border-line bg-surface-2 text-text-3",
  muted: "border-line-soft bg-surface-2 text-text-3 italic",
  alias: "border-accent-line bg-accent-soft text-accent",
  contact: "border-accent-line bg-accent-soft text-accent",
};

const DOTS: Partial<Record<BadgeTone, string>> = {
  matched: "bg-ok",
  unmatched: "bg-warn",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** Adds the small status dot used on the matched / unmatched pills. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot && DOTS[tone] && (
        <span className={cn("size-1.5 rounded-full", DOTS[tone])} />
      )}
      {children}
    </span>
  );
}

/** Monospace count chip that sits next to a section heading. */
export function CountChip({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
