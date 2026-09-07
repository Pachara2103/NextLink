import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  detail,
  action,
  tone = "neutral",
}: {
  icon: IconName;
  title: string;
  detail?: string;
  action?: ReactNode;
  /** `success` is used for the all-groups-linked case, which is good news. */
  tone?: "neutral" | "success";
}) {
  const success = tone === "success";
  return (
    <div
      className={cn(
        "grid place-items-center rounded-2xl border px-6 py-10 text-center",
        success
          ? "border-ok-line bg-ok-soft"
          : "border-dashed border-line bg-surface-2",
      )}
    >
      <div
        className={cn(
          "grid size-12 place-items-center rounded-2xl border",
          success
            ? "border-ok-line bg-ok-soft"
            : "border-line bg-surface",
        )}
      >
        <Icon
          name={icon}
          className={cn("size-5", success ? "text-ok" : "text-text-3")}
        />
      </div>
      <p
        className={cn(
          "mt-3.5 font-display text-[15px] font-semibold",
          success ? "text-ok" : "text-text",
        )}
      >
        {title}
      </p>
      {detail && (
        <p
          className={cn(
            "mt-1 max-w-[36ch] text-[12.5px]",
            success ? "text-ok" : "text-text-3",
          )}
        >
          {detail}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** The grid layout's placeholder: same skeleton, stacked like the card is. */
export function GroupTileSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-line-soft bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="size-11 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-5 w-24 animate-pulse rounded-full bg-surface-2" />
      </div>
      <div className="mt-4 h-4 w-3/5 animate-pulse rounded bg-surface-2" />
      <div className="mt-2.5 h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      <div className="mt-6 h-9 w-full animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}

export function GroupCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line-soft bg-surface p-4">
      <div className="size-11 shrink-0 animate-pulse rounded-xl bg-surface-2" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="h-9 w-24 shrink-0 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}
