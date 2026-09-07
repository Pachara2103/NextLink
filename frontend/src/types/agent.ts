
export type ChatRole = "user" | "ai";

/** One row of `chat_histories` as `GET /chat_histories` returns it. */
export interface ChatMessage {
  id: number;
  userId: string;
  role: ChatRole;
  message: string;
  /** Only an answer straight out of a run has one; history rows read null. */
  totalTokens: number | null;
  createdAt: string;
}

/**
 * The graph has four nodes but a reader only cares about three ideas, so both
 * search nodes report as "search". Backend: `ai/services/ai.py::NODE_STEP`.
 */
export type AgentStepKey = "classify" | "search" | "agent";

/** "skipped" is a real outcome: a question that needs no lookup routes past it. */
export type AgentStepState = "pending" | "active" | "done" | "skipped";

export interface AgentStep {
  key: AgentStepKey;
  label: string;
  state: AgentStepState;
}

/** What one frame of `POST /agent/call/stream` means, after parsing. */
export type AgentEvent =
  | { type: "plan"; steps: AgentStep[] }
  | { type: "step"; step: AgentStep }
  | { type: "answer"; message: ChatMessage }
  | { type: "error"; message: string };

/** Callbacks `askAgent` fires as the run reports in. */
export interface AgentHandlers {
  onPlan?: (steps: AgentStep[]) => void;
  onStep?: (step: AgentStep) => void;
}
