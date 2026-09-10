import type { ReactNode } from "react";

import { cn, jobTitleLabel, tagTone } from "@/lib/utils";

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

/**
 * The six tag hues from globals.css, written out rather than built from a
 * template string: Tailwind only emits a utility it can see in the source, so
 * `bg-tag-${n}-soft` would compile to nothing at all.
 */
const TAG_TONES: Record<number, string> = {
  1: "border-tag-1-line bg-tag-1-soft text-tag-1",
  2: "border-tag-2-line bg-tag-2-soft text-tag-2",
  3: "border-tag-3-line bg-tag-3-soft text-tag-3",
  4: "border-tag-4-line bg-tag-4-soft text-tag-4",
  5: "border-tag-5-line bg-tag-5-soft text-tag-5",
  6: "border-tag-6-line bg-tag-6-soft text-tag-6",
};

/**
 * One job title, in the colour that title always gets.
 *
 * The hue comes from the *stored* value rather than the label, so a preset and
 * a hand-typed title that happen to read the same in Thai still keep their own
 * colours — and, more to the point, so every "executive" in the console is the
 * same colour whichever card it is on.
 */
export function JobTitleBadge({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const label = jobTitleLabel(value);
  if (label === null) return null;

  return (
    <span
      title={label}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        TAG_TONES[tagTone(value!)],
        className,
      )}
    >
      {label}
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
