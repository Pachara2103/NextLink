const TEAM_API_ORIGIN = "https://next-link-backend.vercel.app";
const LOCAL_API_ORIGIN = "http://127.0.0.1:8000";

/** Resolve a build-time server proxy target, never a browser-supplied URL. */
export function resolveApiOrigin(raw: string | undefined, environment: string | undefined): string {
  const value = raw?.trim() || (environment === "production" ? TEAM_API_ORIGIN : LOCAL_API_ORIGIN);
  const message = "API_ORIGIN must be an absolute http(s) origin without credentials, a path, query or fragment.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Do not echo environment values: a mistaken URL can contain credentials.
    throw new Error(message);
  }
  if (!/^https?:\/\//i.test(value) || !["http:", "https:"].includes(url.protocol)
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(message);
  }
  return url.origin;
}
