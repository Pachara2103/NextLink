"use client";

import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { GroupLayout } from "@/types";

const OPTIONS: { value: GroupLayout; icon: "list" | "grid"; label: string }[] = [
  { value: "grid", icon: "grid", label: "มุมมองการ์ด" },
  { value: "list", icon: "list", label: "มุมมองรายการ" }
];

/**
 * Icon-only switch between the two group layouts. Sits to the left of
 * "รีเฟรชกลุ่มไลน์" and carries no label of its own: the two glyphs say what
 * they do, and the panel header has no room for a third piece of prose.
 */
export function GroupLayoutToggle({
  value,
  onChange,
  className,
}: {
  value: GroupLayout;
  onChange: (value: GroupLayout) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="รูปแบบการแสดงผล"
      className={cn(
        "inline-flex shrink-0 gap-1 rounded-xl border border-line bg-sunken p-1",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "grid size-8 place-items-center rounded-lg transition",
              active
                ? "bg-accent-soft text-accent"
                : "text-text-3 hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon name={option.icon} className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
