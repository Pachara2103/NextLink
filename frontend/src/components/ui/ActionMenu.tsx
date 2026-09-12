"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * One line of the menu. `tone: "danger"` is what a destructive action gets —
 * the reason the menu exists is to keep those off the row of buttons someone
 * is clicking through in a hurry.
 */
export interface ActionMenuItem {
  icon?: IconName;
  label: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}

const ITEM_TONES = {
  default: "text-text-2 hover:bg-surface-2 hover:text-text",
  danger: "text-danger hover:bg-danger-soft",
} as const;

/**
 * The ⋮ button, and the small menu it opens.
 *
 * Closes on Escape, on a pointer press anywhere outside it, and on picking
 * something — a `pointerdown` listener rather than `click`, so pressing
 * another card's ⋮ closes this one before that button's own click lands and
 * two menus are never open at once.
 *
 * Positioned against the button rather than the viewport: the menu is two or
 * three short rows, so it opens under its own corner and the card does not
 * need to grow to hold it.
 */
export function ActionMenu({
  label,
  items,
  disabled = false,
  className,
}: {
  /** Names the button for screen readers and its tooltip. */
  label: string;
  items: ActionMenuItem[];
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Reset before committing children so a newly disabled card cannot retain
  // an actionable menu, or reopen it when its pending request finishes.
  if (disabled && open) setOpen(false);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "grid size-9 place-items-center rounded-xl border transition",
          disabled
            ? "cursor-not-allowed border-line-soft bg-surface-2 text-text-4"
            : open
              ? "border-text-4 bg-surface text-text"
              : "border-line bg-surface-2 text-text-2 hover:border-text-4 hover:bg-surface hover:text-text",
        )}
      >
        <Icon name="more-vertical" className="size-4" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute top-full right-0 z-30 mt-1.5 min-w-[176px] rounded-xl border border-line bg-surface p-1 shadow-lift"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition",
                item.disabled
                  ? "cursor-not-allowed text-text-4"
                  : ITEM_TONES[item.tone ?? "default"],
              )}
            >
              {item.icon && <Icon name={item.icon} className="size-4" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
