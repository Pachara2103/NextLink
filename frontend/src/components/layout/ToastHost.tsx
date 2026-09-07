"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { ToastItem } from "@/types";

const AUTO_DISMISS_MS = 4000;

/** Same trick as Modal: no portal until the client has hydrated. */
const neverChanges = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/** Two tones and no more — green for what worked, red for what did not. */
const TONES = {
  success: {
    icon: "check-circle",
    ring: "border-ok-line",
    iconColor: "text-ok",
    text: "text-ok",
  },
  error: {
    icon: "alert",
    ring: "border-danger-line",
    iconColor: "text-danger",
    text: "text-danger",
  },
} as const;

/**
 * The notification stack, pinned to the bottom-right corner of the viewport.
 *
 * Portalled to <body> and above the dialog layer on purpose: the note form and
 * every other modal render at z-50 with their own backdrop, and a toast that
 * lands while one is open — which is exactly when saving a note reports back —
 * has to be readable rather than buried under the overlay.
 *
 * `flex-col-reverse` is what makes the pile grow upward: the store keeps the
 * list oldest-first, so the newest toast is laid out last and lands on top.
 */
export function ToastHost() {
  const { toasts, dismissToast } = useConsole();
  const mounted = useHydrated();

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col-reverse gap-2.5 sm:right-6 sm:bottom-6"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>,
    document.body,
  );
}

/**
 * One toast. The timer lives here rather than in the host so each toast counts
 * down from when *it* arrived — a second notification must not extend, or cut
 * short, the life of the one already on screen.
 */
function ToastRow({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const { id } = toast;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [id, onDismiss]);

  const spec = TONES[toast.kind];

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={cn(
        "toast-enter pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3.5",
        "bg-surface/95 shadow-lift backdrop-blur-md",
        spec.ring,
      )}
    >
      <Icon
        name={spec.icon}
        className={cn("size-[18px] shrink-0", spec.iconColor)}
      />
      <p className={cn("min-w-0 flex-1 text-[13.5px] font-medium", spec.text)}>
        {toast.message}
      </p>
      <button
        type="button"
        aria-label="ปิดข้อความ"
        onClick={() => onDismiss(id)}
        className="grid size-7 shrink-0 place-items-center rounded-lg text-text-2 transition hover:bg-surface-2 hover:text-text"
      >
        <Icon name="x" className="size-4" />
      </button>
    </div>
  );
}
