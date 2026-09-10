import {
  notifyUnauthorized,
  readSession,
} from "@/lib/services/session";

/**
 * Shared fetch plumbing for the API layer. Everything under services/ goes
 * through here, so the bearer token is attached in exactly one place, a
 * rejected token is handled in exactly one place — and so is a server that
 * stopped answering.
 */

/**
 * Thrown when the API answers with a non-2xx status. `status` lets callers
 * tell, say, a 404 apart from a 500 without parsing the message.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${status}: ${detail}`);
    this.name = "ApiError";
  }
}

/**
 * Thrown when the request never got an answer at all.
 *
 * Before this existed, `fetch` was left to reject on its own and a backend
 * that was restarting left the promise hanging for as long as the browser felt
 * like waiting — a minute or more of a spinner that says nothing. Every call
 * now carries a deadline, and giving up is a typed failure the store can act
 * on rather than an unknown one it can only log.
 */
export class NetworkError extends Error {
  constructor(
    /** `timeout`: the deadline passed. `offline`: the connection failed outright. */
    readonly reason: "timeout" | "offline",
    readonly cause?: unknown,
  ) {
    super(
      reason === "timeout"
        ? "หมดเวลารอเซิร์ฟเวอร์"
        : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
    );
    this.name = "NetworkError";
  }
}

/**
 * How long any one request may take before it is given up on.
 *
 * Everything here is a small read or a single-row write — a second is already
 * slow. The one exception is the extraction pass, which runs an LLM call per
 * group inside one request and passes its own budget (see services/line.ts).
 */
const DEFAULT_TIMEOUT_MS = 15_000;

export interface RequestOptions {
  /** Overrides the 15s default. Only the extraction pass needs this. */
  timeoutMs?: number;
}

/**
 * Told whenever the API cannot be reached, or answers 503 because it is still
 * starting up. The console store registers the handler that raises the banner
 * and starts polling /health; nothing else needs to know.
 */
let onUnreachable: ((reason: "timeout" | "offline" | "starting") => void) | null =
  null;

export function setUnreachableHandler(
  handler: ((reason: "timeout" | "offline" | "starting") => void) | null,
): void {
  onUnreachable = handler;
}

/** Pulls FastAPI's `{ "detail": ... }` out of an error response body. */
async function readDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
  } catch {
    return response.statusText;
  }
}

function authHeaders(): Record<string, string> {
  const session = readSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

/**
 * The half of `parse` that does not read the body: status check, 401 handling.
 * Split out because a streaming response must not be consumed to be checked.
 */
async function assertOk(path: string, response: Response): Promise<void> {
  if (response.ok) return;
  // A 401 on /auth/login means the credentials were wrong, which the form
  // reports itself — tearing the session down there would be nonsense.
  // Anywhere else it means our token is gone, expired or forged.
  if (response.status === 401 && !path.startsWith("/api/v1/auth/login")) {
    notifyUnauthorized();
  }
  // 503 is the readiness gate in app.py: the process is up but still loading.
  // Same handling as being unreachable — wait, then re-read everything — so
  // the caller does not have to tell the two apart.
  if (response.status === 503) {
    onUnreachable?.("starting");
  }
  throw new ApiError(response.status, await readDetail(response));
}

/**
 * `fetch` with a deadline, and one place that notices the server is gone.
 *
 * `AbortSignal.timeout` rather than a hand-rolled timer: the abort reason it
 * gives is a TimeoutError, which is how a deadline is told apart from a caller
 * that aborted on purpose (the agent's หยุด button).
 */
async function send(
  path: string,
  init: RequestInit,
  options?: RequestOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    return await fetch(path, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    // A caller-supplied signal that fired is not our failure to report: the
    // user pressed stop.
    if (init.signal?.aborted) throw cause;

    const timedOut =
      cause instanceof DOMException && cause.name === "TimeoutError";
    const reason = timedOut ? "timeout" : "offline";
    onUnreachable?.(reason);
    throw new NetworkError(reason, cause);
  }
}

async function parse<T>(path: string, response: Response): Promise<T> {
  await assertOk(path, response);
  return (await response.json()) as T;
}

export async function getJson<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  return parse<T>(path, await send(path, { headers: authHeaders() }, options));
}

export async function postJson<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return parse<T>(
    path,
    await send(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      },
      options,
    ),
  );
}

export async function putJson<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return parse<T>(
    path,
    await send(
      path,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      },
      options,
    ),
  );
}

export async function deleteJson<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  return parse<T>(
    path,
    await send(path, { method: "DELETE", headers: authHeaders() }, options),
  );
}

/**
 * A POST whose response body is read as it arrives instead of all at once —
 * the agent's Server-Sent Events stream.
 *
 * fetch rather than EventSource: EventSource is GET-only and cannot carry an
 * Authorization header, which would mean putting the token in the query string
 * of every question. `signal` is what the หยุด button aborts.
 *
 * No deadline: an answer legitimately takes as long as the model takes, and
 * the stream itself is the sign of life. It still reports an unreachable
 * server, so the banner comes up if the backend dies mid-question.
 */
export async function postStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    onUnreachable?.("offline");
    throw new NetworkError("offline", cause);
  }

  await assertOk(path, response);

  if (!response.body) {
    throw new ApiError(500, "เบราว์เซอร์นี้อ่านข้อมูลแบบสตรีมไม่ได้");
  }
  return response.body;
}
