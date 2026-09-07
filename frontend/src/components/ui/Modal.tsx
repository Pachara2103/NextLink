"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "@/components/icons";
import { Button, type ButtonVariant, CloseButton } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * True only after hydration, so `createPortal(..., document.body)` is never
 * reached on the server. useSyncExternalStore rather than a state flag set in
 * an effect: it gives the server snapshot (false) during hydration and the
 * client one (true) after, in one render and with nothing to re-render for.
 */
const neverChanges = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/**
 * Centred confirm dialog. Deliberately not a <dialog>: the console renders
 * inside a stacking context with its own sticky bars, and the native top layer
 * ignores those, so a plain fixed overlay is easier to reason about.
 *
 * It is portalled to <body> because `position: fixed` is only viewport-relative
 * while no ancestor is a containing block for it — a `backdrop-blur` or
 * `transform` anywhere above the dialog is exactly such an ancestor, and the
 * dialog then gets clipped to that box instead of covering the page. From the
 * portal every caller gets the same full-screen overlay regardless.
 */
export function ConfirmModal({
  open,
  title,
  children,
  icon,
  tone = "primary",
  confirmLabel,
  cancelLabel = "ยกเลิก",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  icon?: IconName;
  /** Drives the confirm button and the icon chip: primary for routine, danger to warn. */
  tone?: "primary" | "danger" | "warn";
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const mounted = useHydrated();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);

    // The page behind must not scroll while the dialog owns the screen.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, loading, onCancel]);

  if (!open || !mounted) return null;

  const chip =
    tone === "danger"
      ? "border-danger-line bg-danger-soft text-danger"
      : tone === "warn"
        ? "border-warn-line bg-warn-soft text-warn"
        : "border-accent-line bg-accent-soft text-accent";

  const confirmVariant: ButtonVariant =
    tone === "danger" ? "danger" : tone === "warn" ? "warn" : "primary";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="ปิดหน้าต่าง"
        tabIndex={-1}
        onClick={() => !loading && onCancel()}
        className="absolute inset-0 cursor-default bg-bg/80 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-[500px] rounded-2xl border border-line bg-surface p-5 shadow-lift-lg">
        <div className="flex items-start gap-3.5">
          {icon && (
            <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl border", chip)}>
              <Icon name={icon} className="size-5" />
            </div>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="font-display text-[16px] font-semibold text-text">
              {title}
            </h2>
            <div className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">
              {children}
            </div>
          </div>
          <CloseButton onClick={onCancel} disabled={loading} className="-mt-1 -mr-1" />
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <Button onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={confirmVariant}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The general-purpose dialog, for the ones that hold a form rather than a
 * question. Same portal and same scroll lock as ConfirmModal — see the note on
 * that component for why the portal is not optional — but the body scrolls
 * inside the panel so a tall form never pushes the page around behind it.
 */
export function Modal({
  open,
  title,
  subtitle,
  icon,
  maxWidth = "560px",
  onClose,
  children,
  footer,
  closeDisabled = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** CSS length. The note form needs room for its chip rows; a rename does not. */
  maxWidth?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
}) {
  const mounted = useHydrated();

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabled) onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, closeDisabled, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="ปิดหน้าต่าง"
        tabIndex={-1}
        onClick={() => !closeDisabled && onClose()}
        className="fixed inset-0 cursor-default bg-bg/80 backdrop-blur-sm"
      />

      <section
        className="relative my-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-2xl border border-accent-line bg-surface shadow-lift-lg"
        style={{ maxWidth }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line-soft px-4 py-4 sm:px-5">
          {icon && (
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent-line bg-accent-soft text-accent">
              <Icon name={icon} className="size-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[16px] font-semibold text-text">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[13px] text-text-2">{subtitle}</p>
            )}
          </div>
          <CloseButton onClick={onClose} disabled={closeDisabled} />
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-line-soft px-4 py-4 sm:px-5">
            {footer}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
