"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/icons";

/** Matches `ChatAsk.question`'s max_length in backend/schemas/ai.py. */
export const MAX_QUESTION = 1000;

const PLACEHOLDER = "ถามคุณขวัญใจ เช่น “ขอเบอร์ติดต่อของคุณสมชายหน่อย”";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grows with the text up to ~6 lines, then scrolls. Height has to be reset
  // to auto first or scrollHeight only ever reports the taller of the two.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  // Focus comes back the moment the agent is done, so the next question can be
  // typed without reaching for the mouse.
  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);

  const canSend = !busy && value.trim().length > 0 && value.length <= MAX_QUESTION;

  return (
    <div>
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-sunken py-1.5 pr-2 pl-3.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={busy}
          placeholder={busy ? "คุณขวัญใจกำลังตอบ…" : PLACEHOLDER}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          /* focus:outline-none on purpose: the ring belongs to the box around
             the whole composer, and globals.css would otherwise draw a second
             one tight around the textarea itself. */
          className="block max-h-[180px] min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 text-[14.5px] leading-relaxed text-text focus:outline-none disabled:text-text-3"
        />

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="หยุดการตอบ"
            title="หยุดการตอบ"
            className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-text transition hover:border-danger-line hover:text-danger"
          >
            <Icon name="stop" className="size-[18px]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="ส่งคำถาม"
            className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-lift transition hover:bg-accent-hover active:bg-accent disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-4 disabled:shadow-none"
          >
            <Icon name="send" className="size-[18px]" />
          </button>
        )}
      </div>

      <p className="mt-2 mb-5 px-1 text-center text-[11.5px] text-text-4">
        {value.length > MAX_QUESTION && (
          <span className="text-danger">
            คำถามยาวเกิน {MAX_QUESTION.toLocaleString()} ตัวอักษร กรุณาย่อให้สั้นลง
          </span>
        )} 
      </p>
    </div>
  );
}
