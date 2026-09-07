"use client";

import { useState } from "react";

import { AnswerBody } from "@/components/agent/AnswerBody";
import { Icon } from "@/components/icons";
import type { ChatMessage } from "@/types/agent";

function timeLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/**
 * One clipboard button, shared by both sides of the transcript.
 *
 * The question is as worth copying as the answer — it is often the thing that
 * gets pasted into a ticket or forwarded on — so the affordance is identical
 * rather than merely similar.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — nothing useful to say about it.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] text-text-3 transition hover:bg-surface-2 hover:text-text"
    >
      <Icon name={copied ? "check" : "copy"} className="size-3.5" />
      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
}

/** A question, in a bubble, on the right. */
function UserTurn({ message }: { message: ChatMessage }) {
  return (
    <div className="group flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-1 sm:max-w-[75%]">
        <div className="rounded-2xl rounded-br-md border border-accent-line bg-accent-soft px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-text shadow-lift">
          {message.message}
        </div>
        {/* The row keeps its height whether or not the button is showing, so a
            hover never nudges the transcript. */}
        <div className="flex items-center gap-1">
          <span className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <CopyButton text={message.message} />
          </span>
          <span className="px-1 font-mono text-[10.5px] tabular-nums text-text-4">
            {timeLabel(message.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * An answer, with no bubble.
 *
 * That asymmetry is the point: the question is a thing the user said, so it is
 * boxed and pushed to one side; the answer is the content of the page, so it
 * runs the full width like any other text and stays readable at length.
 */
function AgentTurn({ message }: { message: ChatMessage }) {
  return (
    <div className="group">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent">
          <Icon name="bot" className="size-3.5 text-accent-ink" />
        </div>
        <span className="font-display text-[13px] font-semibold tracking-tight text-text">
          คุณขวัญใจ
        </span>
        <span className="font-mono text-[10.5px] tabular-nums text-text-4">
          {timeLabel(message.createdAt)}
        </span>
      </div>

      <AnswerBody markdown={message.message} />

      <div className="mt-2.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <CopyButton text={message.message} />
        {message.totalTokens ? (
          <span className="ml-1 font-mono text-[10.5px] tabular-nums text-text-4">
            {message.totalTokens.toLocaleString()} tokens
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ChatTurn({ message }: { message: ChatMessage }) {
  return message.role === "user" ? (
    <UserTurn message={message} />
  ) : (
    <AgentTurn message={message} />
  );
}
