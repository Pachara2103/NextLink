import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

export type AlertTone = "success" | "error" | "warn" | "info" | "loading";

const TONES: Record<
  AlertTone,
  { box: string; icon: IconName; iconColor: string; text: string }
> = {
  success: {
    box: "border-ok-line bg-ok-soft",
    icon: "check-circle",
    iconColor: "text-ok",
    text: "text-ok",
  },
  error: {
    box: "border-danger-line bg-danger-soft",
    icon: "alert",
    iconColor: "text-danger",
    text: "text-danger",
  },
  warn: {
    box: "border-warn-line bg-warn-soft",
    icon: "alert",
    iconColor: "text-warn",
    text: "text-warn",
  },
  info: {
    box: "border-line bg-surface-2",
    icon: "info",
    iconColor: "text-text-2",
    text: "text-text-2",
  },
  loading: {
    box: "border-line bg-surface-2",
    icon: "loader",
    iconColor: "text-accent",
    text: "text-text",
  },
};

export function Alert({
  tone,
  title,
  detail,
  onDismiss,
  trailing,
  className,
}: {
  tone: AlertTone;
  title: ReactNode;
  detail?: ReactNode;
  onDismiss?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const spec = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        spec.box,
        className,
      )}
    >
      <Icon
        name={spec.icon}
        className={cn(
          "size-[18px] shrink-0",
          spec.iconColor,
          tone === "loading" && "animate-spin",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-medium", spec.text)}>{title}</p>
        {detail && (
          <p className="truncate text-[12px] text-text-2">{detail}</p>
        )}
      </div>
      {trailing}
      {onDismiss && (
        <button
          type="button"
          aria-label="ปิดข้อความ"
          onClick={onDismiss}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg transition hover:bg-surface-2",
            spec.text,
          )}
        >
          <Icon name="x" className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Quieter inline note used underneath form fields. */
export function InlineNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-sunken px-3.5 py-2.5">
      <Icon name="info" className="mt-0.5 size-4 shrink-0 text-text-3" />
      <p className="text-[12px] leading-relaxed text-text-2">{children}</p>
    </div>
  );
}
