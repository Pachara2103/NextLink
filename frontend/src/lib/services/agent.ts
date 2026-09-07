import { getJson, postJson, postStream } from "@/lib/services/http";
import type {
  AgentEvent,
  AgentHandlers,
  AgentStep,
  ChatMessage,
} from "@/types/agent";
import type { ListResponse } from "@/types";

/**
 * คุณขวัญใจ — `/api/v1/agent`.
 *
 * `ask` is the one that matters: it POSTs the question and then reads the
 * response body as it arrives, so the panel can show *which* step the agent is
 * on. Every frame is one Server-Sent Event:
 *
 *     event: step
 *     data: {"key":"search","label":"กำลังค้นหาข้อมูลผู้ติดต่อ","state":"active"}
 *
 * `askOnce` is the same question without the progress — kept as the fallback
 * for anywhere streaming is not wanted (or is blocked by a proxy that buffers).
 */

/** Turns one raw SSE frame into an AgentEvent, or null if it is not one. */
function parseFrame(frame: string): AgentEvent | null {
  let name = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    // ":" opens a comment frame — the server sends one to flush the headers.
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (dataLines.length === 0) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }

  switch (name) {
    case "plan":
      return {
        type: "plan",
        steps: (payload as { steps: AgentStep[] }).steps ?? [],
      };
    case "step":
      return { type: "step", step: payload as AgentStep };
    case "answer":
      return { type: "answer", message: payload as ChatMessage };
    case "error":
      return {
        type: "error",
        message:
          (payload as { message?: string }).message ??
          "เกิดข้อผิดพลาดในการประมวลผล",
      };
    default:
      return null;
  }
}

export const agentService = {
  history: async (): Promise<ChatMessage[]> => {
    const body = await getJson<ListResponse<ChatMessage>>(
      "/api/v1/chat_histories",
    );
    return body?.items ?? [];
  },
  

  ask: async (
    question: string,
    handlers: AgentHandlers = {},
    signal?: AbortSignal,
  ): Promise<ChatMessage> => {
    const stream = await postStream(
      "/api/v1/agent/call/stream",
      { question },
      signal,
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer: ChatMessage | null = null;

    const handle = (frame: string) => {
      const event = parseFrame(frame);
      if (!event) return;
      if (event.type === "plan") handlers.onPlan?.(event.steps);
      else if (event.type === "step") handlers.onStep?.(event.step);
      else if (event.type === "answer") answer = event.message;
      else if (event.type === "error") throw new Error(event.message);
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

        let cut = buffer.indexOf("\n\n");
        while (cut !== -1) {
          handle(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 2);
          cut = buffer.indexOf("\n\n");
        }
      }
      if (buffer.trim()) handle(buffer);
    } finally {
      // Frees the connection whether we finished, threw, or were aborted.
      reader.cancel().catch(() => {});
    }

    if (!answer) {
      throw new Error("ไม่ได้รับคำตอบจากระบบ กรุณาลองใหม่อีกครั้ง");
    }
    return answer;
  },
};
