"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Toast = { message: string };

/**
 * Long enough to read a sentence, held while the toast is hovered or focused
 * so a screen reader is not racing it.
 *
 * It used to carry a "เลิกทำ" button, which is why it is held at all. The
 * button is gone: everything it offered to take back is now either saved the
 * moment it is pressed — where a five-second window to change your mind is a
 * worse answer than the confirmation the control already asks for — or held on
 * the board, where ยกเลิก sits permanently beside บันทึก instead of vanishing
 * after five seconds.
 */
const TOAST_MS = 5000;

/** Confirms an inline status change. */
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
