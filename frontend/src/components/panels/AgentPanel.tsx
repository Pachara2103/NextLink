"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatTurn } from "@/components/agent/ChatTurn";
import { Composer } from "@/components/agent/Composer";
import { ThinkingStatus } from "@/components/agent/ThinkingStatus";
import { Icon } from "@/components/icons";
import { agentService } from "@/lib/services/agent";
import { useConsole } from "@/store/console-store";
import type { AgentStep, ChatMessage } from "@/types/agent";



const SUGGESTIONS = [
  {
    icon: "user" as const,
    title: "ข้อมูลติดต่อ",
    text: "สอบถามข้อมูลติดต่อของบุคคล",
  },
  {
    icon: "note" as const,
    title: "สถานะ MOU",
    text: "สอบถามสถานะ MOU ของบริษัท",
  },
  {
    icon: "building" as const,
    title: "ประวัติกิจกรรม",
    text: "สอบถามกิจกรรมที่บริษัทเคยเข้าร่วม",
  },
  {
    icon: "users" as const,
    title: "ผู้ติดต่อหลัก",
    text: "สอบถามผู้ติดต่อหลักของบริษัท",
  },
];

const THINKING_FALLBACK = "กำลังประมวลผล";

export function AgentPanel() {
  const { notify } = useConsole();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [statusLabel, setStatusLabel] = useState(THINKING_FALLBACK);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  /** Counts down from -1, so optimistic turns never clash with real ids. */
  const localId = useRef(-1);

  const atBottom = useCallback(() => {
    const el = scroller.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Follow the conversation down as it grows, but never yank the view away
  // from someone who has scrolled up to re-read an earlier answer.
  useEffect(() => {
    if (atBottom()) scrollToBottom();
  }, [messages, steps, atBottom, scrollToBottom]);

  // A run in flight belongs to this panel; leaving it must not leave the
  // request hanging.
  useEffect(() => () => abort.current?.abort(), []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const items = await agentService.history();
      setMessages(items);
      setHistoryLoaded(true);
      if (items.length === 0) {
        notify({
          kind: "success",
          message: "ยังไม่มีประวัติการคุยกับคุณขวัญใจ",
        });
      }
      requestAnimationFrame(() => scrollToBottom(false));
    } catch (error) {
      
      notify({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "โหลดประวัติการคุยไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setLoadingHistory(false);
    }
  }

  function newChat() {
    abort.current?.abort();
    abort.current = null;
    setMessages([]);
    setSteps([]);
    setBusy(false);
    setDraft("");
    setHistoryLoaded(false);
  }

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    const asked: ChatMessage = {
      id: localId.current--,
      userId: "",
      role: "user",
      message: text,
      totalTokens: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, asked]);
    setDraft("");
    setBusy(true);
    setSteps([]);
    setStatusLabel(THINKING_FALLBACK);

    const controller = new AbortController();
    abort.current = controller;

    try {
      const answer = await agentService.ask(
        text,
        {
          onPlan: (plan) => setSteps(plan),
          onStep: (step) => {
            // The step carries the label the server chose for it — "กำลังค้นหา
            // สถานะ MOU" rather than a generic one — so the header echoes
            // whichever step is running.
            if (step.state === "active") setStatusLabel(step.label);
            setSteps((prev) => {
              const next = prev.some((s) => s.key === step.key)
                ? prev.map((s) => (s.key === step.key ? step : s))
                : [...prev, step];
              return next;
            });
          },
        },
        controller.signal,
      );

      setMessages((prev) => [...prev, answer]);
    } catch (error) {
      // An abort is the user pressing หยุด, not a failure to report.
      if (!controller.signal.aborted) {
        notify({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง",
        });
      }
    } finally {
      abort.current = null;
      setBusy(false);
      setSteps([]);
    }
  }

  const empty = messages.length === 0 && !busy;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Actions live in the corner rather than in a bar of their own: the
          panel has no title to sit beside, and a bar would cost a strip of the
          transcript on every screen. */}
      <div className="pointer-events-none absolute top-4 right-4 z-20 flex flex-col items-end gap-2 sm:top-5 sm:right-6">
        <button
          type="button"
          onClick={newChat}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-line bg-surface/90 px-3.5 py-2.5 text-[13px] font-medium text-text shadow-lift backdrop-blur-md transition hover:border-accent-line hover:bg-surface-2 hover:text-text"
        >
          <Icon name="plus" className="size-4 text-accent" />
          สนทนาใหม่
        </button>
        <button
          type="button"
          onClick={loadHistory}
          disabled={loadingHistory}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-line bg-surface/90 px-3.5 py-2.5 text-[13px] font-medium text-text-2 shadow-lift backdrop-blur-md transition hover:border-accent-line hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:text-text-4"
        >
          <Icon
            name={loadingHistory ? "loader" : "history"}
            className={`size-4 text-text-2 ${loadingHistory ? "animate-spin" : ""}`}
          />
          โหลดประวัติการคุย
        </button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={`mx-auto flex min-h-full w-full max-w-[880px] flex-col px-5 pb-6 sm:px-8 ${
            empty ? "justify-center pt-8 pb-14" : "pt-[124px]"
          }`}
        >
          {empty ? (
            <section>
              <div className="agent-pulse mx-auto grid size-14 place-items-center rounded-2xl bg-accent shadow-lift">
                <Icon name="bot" className="size-7 text-accent-ink" />
              </div>
              <h2 className="mt-4 text-center font-display text-[22px] font-semibold tracking-tight text-text">
                สวัสดีค่ะ เริ่มสอบถามข้อมูลได้เลย
              </h2>
              {/* <p className="mx-auto mt-2 max-w-[520px] text-center text-[13.5px] leading-relaxed text-text-2">
                สอบถามข้อมูลกับคุณขวัญใจ
              </p> */}

              <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    // onClick={() => send(item.text)}
                    className="group flex items-start gap-3 rounded-xl border border-line-soft bg-surface p-3.5 text-left transition hover:border-accent-line hover:bg-accent-strong"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-sunken text-text-2 transition group-hover:border-accent-line group-hover:text-accent">
                      <Icon name={item.icon} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-text">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-text-3">
                        {item.text}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {!historyLoaded && (
                <p className="mt-6 text-center text-[12px] text-text-4">
                  หรือกด “โหลดประวัติการคุย” เพื่อดูบทสนทนาครั้งก่อน
                </p>
              )}
            </section>
          ) : (
            <div className="space-y-7">
              {messages.map((message) => (
                <ChatTurn key={message.id} message={message} />
              ))}
              {busy && <ThinkingStatus steps={steps} label={statusLabel} />}
            </div>
          )}
        </div>
      </div>

      {/* No band and no rule here on purpose: the composer sits on the same
          ground the transcript scrolls over, and the only edge in this
          corner of the screen is the dark input box itself. */}
      <div className="shrink-0 bg-bg">
        <div className="mx-auto w-full max-w-[880px] px-5 py-4 sm:px-8">
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => send(draft)}
            onStop={() => abort.current?.abort()}
            busy={busy}
          />
        </div>
      </div>
    </div>
  );
}
