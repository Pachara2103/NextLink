"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Toast = { message: string };

/**
 * Long enough to be read without hurrying, and held while the toast is hovered
 * or focused so keyboard and screen-reader users are not raced by it.
 */
const TOAST_MS = 5000;

/**
 * Confirms an inline status change.
 *
 * It confirms and nothing more. There was a "เลิกทำ" here once, and on a plan
 * several people share it was the wrong promise to make: by the time anyone
 * reached for it the state it would have put back could already have been
 * built on by somebody else. The week board's ยกเลิก is the honest version
 * of the same idea — it discards edits that were never sent.
 */
export function useStatusToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const show = useCallback((message: string) => {
    setToast({ message });
    startTimer();
  }, [startTimer]);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, []);

  useEffect(() => clearTimer, []);

  return { toast, show, dismiss, holdTimer: clearTimer, resumeTimer: startTimer };
}

export function StatusToast({
  toast,
  onDismiss,
  onHold,
  onResume,
}: {
  toast: Toast | null;
  onDismiss: () => void;
  onHold?: () => void;
  onResume?: () => void;
}) {
  // The live region stays mounted so assistive tech announces each new message
  // instead of only noticing the first one.
  return (
    <div
      className={toast ? "toast" : "sr-only"}
      role="status"
      aria-live="polite"
      onMouseEnter={onHold}
      onMouseLeave={onResume}
      onFocusCapture={onHold}
      onBlurCapture={onResume}
    >
      {toast ? (
        <>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-dismiss" type="button" onClick={onDismiss} aria-label="ปิดข้อความแจ้งเตือน">
            ×
          </button>
        </>
      ) : null}
    </div>
  );
}
