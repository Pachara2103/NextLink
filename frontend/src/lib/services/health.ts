import { getJson } from "@/lib/services/http";

/**
 * `GET /api/v1/health` — the one endpoint that answers while the backend is
 * still starting up, and the only one polled while it is unreachable.
 */
export interface HealthInfo {
  status: string;
  /** The LLM/embedding warmup finished. */
  models: boolean;
  /** Startup finished — anything else answers 503 until this is true. */
  ready: boolean;
  /**
   * New every time the process starts.
   *
   * This is what tells "the connection blipped" apart from "the server was
   * replaced" — which in dev happens on every file save. A new boot id means
   * whatever the console is holding may have come from a request that was cut
   * in half, so it is thrown away and read again rather than trusted.
   */
  bootId: string;
  startedAt: string;
}

/** Short deadline: this is polled every couple of seconds while things are bad. */
const HEALTH_TIMEOUT_MS = 4_000;

export const healthService = {
  read: (): Promise<HealthInfo> =>
    getJson<HealthInfo>("/api/v1/health", { timeoutMs: HEALTH_TIMEOUT_MS }),
};
