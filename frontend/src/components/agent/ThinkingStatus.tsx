"use client";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { AgentStep, AgentStepState } from "@/types/agent";

/**
 * What the agent is doing right now.
 *
 * A spinner alone says "wait" and nothing else, and these runs take seconds:
 * the graph classifies the question, may go and look something up, then writes
 * the answer. The checklist comes from the server — one `event: step` per
 * change — so what is on screen is what the graph is actually doing, not a
 * timed animation pretending to be it.
 */

const STATE_STYLE: Record<
  AgentStepState,
  { row: string; icon: IconName | null; iconClass: string }
> = {
  pending: { row: "text-text-4", icon: null, iconClass: "" },
  active: {
    row: "text-text",
    icon: "loader",
    iconClass: "size-3.5 animate-spin text-accent",
  },
  done: {
    row: "text-text-3",
    icon: "check",
    iconClass: "size-3.5 text-ok",
  },
  skipped: {
    row: "text-text-4",
    icon: "arrow-right",
    iconClass: "size-3.5 text-text-4",
  },
};

export function ThinkingStatus({
  steps,
  label,
}: {
  steps: AgentStep[];
  label: string;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <div className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent">
          <Icon name="loader" className="size-3.5 animate-spin text-accent-ink" />
        </div>
        <span className="font-display text-[13px] font-semibold tracking-tight text-text">
          คุณขวัญใจ
        </span>
        <span className="agent-shimmer text-[12.5px] font-medium">{label}</span>
        <span className="flex items-center gap-1 pt-0.5">
          <span className="agent-dot size-1 rounded-full bg-accent" />
          <span
            className="agent-dot size-1 rounded-full bg-accent"
            style={{ animationDelay: "140ms" }}
          />
          <span
            className="agent-dot size-1 rounded-full bg-accent"
            style={{ animationDelay: "280ms" }}
          />
        </span>
      </div>

      {steps.length > 0 && (
        <ul className="space-y-2 rounded-xl border border-line-soft bg-sunken px-4 py-3">
          {steps.map((step) => {
            const style = STATE_STYLE[step.state];
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-center gap-2.5 text-[12.5px] transition-colors",
                  style.row,
                )}
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  {style.icon ? (
                    <Icon name={style.icon} className={style.iconClass} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-surface-2" />
                  )}
                </span>
                <span>{step.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
