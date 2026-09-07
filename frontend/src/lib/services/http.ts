import {
  notifyUnauthorized,
  readSession,
} from "@/lib/services/session";

/**
 * Shared fetch plumbing for the API layer. Everything under services/ goes
 * through here, so the bearer token is attached in exactly one place and a
 * rejected token is handled in exactly one place.
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
  throw new ApiError(response.status, await readDetail(response));
}

async function parse<T>(path: string, response: Response): Promise<T> {
  await assertOk(path, response);
  return (await response.json()) as T;
}

export async function getJson<T>(path: string): Promise<T> {
  return parse<T>(path, await fetch(path, { headers: authHeaders() }));
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return parse<T>(
    path,
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
  );
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  return parse<T>(
    path,
    await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteJson<T>(path: string): Promise<T> {
  return parse<T>(
    path,
    await fetch(path, { method: "DELETE", headers: authHeaders() }),
  );
}

/**
 * A POST whose response body is read as it arrives instead of all at once —
 * the agent's Server-Sent Events stream.
 *
 * fetch rather than EventSource: EventSource is GET-only and cannot carry an
 * Authorization header, which would mean putting the token in the query string
 * of every question. `signal` is what the หยุด button aborts.
 */
export async function postStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    signal,
  });

  await assertOk(path, response);

  if (!response.body) {
    throw new ApiError(500, "เบราว์เซอร์นี้อ่านข้อมูลแบบสตรีมไม่ได้");
  }
  return response.body;
}
