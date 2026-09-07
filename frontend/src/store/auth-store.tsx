"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { ApiError } from "@/lib/services/http";
import {
  clearSession,
  readSession,
  setUnauthorizedHandler,
  writeSession,
} from "@/lib/services/session";
import { userService } from "@/lib/services/user";
import type { AuthUser } from "@/types";

/**
 * "loading" covers both the hydration render and the round trip that checks a
 * stored token. Guards must render neither the console nor the login form
 * during it: too early and a signed-in reload flashes the login page, too
 * loose and an expired token gets a console that cannot load anything.
 *
 * "offline" is the third answer the check can give: the API never said whether
 * the token is good. That is NOT a reason to let anyone in — an unreachable
 * backend used to land the visitor on an empty console that could not load a
 * single thing, which looks exactly like a console with no data in it.
 */
export type AuthStatus = "loading" | "authed" | "anon" | "offline";

/**
 * Carries the whole AuthUser rather than a lone username, so a field added to
 * schemas/user.py::AuthUser is available here without another declaration.
 */
interface Session {
  status: AuthStatus;
  user: AuthUser | null;
}

/**
 * The session lives outside React because localStorage does: the server render
 * cannot see it, so it is read through useSyncExternalStore, which renders the
 * server snapshot during hydration and swaps in the real one right after.
 */
const LOADING: Session = { status: "loading", user: null };
const ANON: Session = { status: "anon", user: null };

let snapshot: Session = LOADING;
const listeners = new Set<() => void>();

/** Null until the first client read; then set only while a token needs checking. */
let pendingValidation: AuthUser | null = null;
let validationStarted = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Session) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function getSnapshot(): Session {
  // Lazy one-time resolve, then cached — getSnapshot has to keep returning the
  // same object or React re-renders forever.
  if (snapshot === LOADING) {
    const stored = readSession();
    if (!stored) {
      snapshot = ANON;
    } else {
      // Hold at "loading" until the API confirms the token is still good.
      pendingValidation = stored.user;
      snapshot = { status: "loading", user: stored.user };
    }
  }
  return snapshot;
}

function getServerSnapshot(): Session {
  return LOADING;
}

/** A token the API refuses is a token we throw away, wherever that happened. */
function signOutLocally() {
  clearSession();
  publish(ANON);
}

setUnauthorizedHandler(signOutLocally);

async function validateStoredToken(stored: AuthUser) {
  try {
    publish({ status: "authed", user: await userService.me() });
  } catch (error) {
    // A 401 already went through the unauthorized handler above, which cleared
    // the session — nothing left to do here.
    if (error instanceof ApiError && error.status === 401) return;

    // Anything else means the answer never came: the backend is down, the dev
    // proxy has nothing to forward to, or the network is gone. The token is
    // kept, because it may well still be valid, but the session stays shut
    // until something confirms it.
    console.error("session check failed", error);
    publish({ status: "offline", user: stored });
  }
}

interface Auth extends Session {
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Runs the session check again, for the retry button on the offline screen. */
  retry: () => Promise<void>;
  /**
   * Renames the signed-in user. Rejects on failure rather than swallowing it,
   * because the dialog is what turns the reason into a message; on success the
   * stored session is rewritten so a reload keeps the new name.
   */
  saveDisplayName: (displayName: string | null) => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // Not a setState: validateStoredToken resolves into publish(), which reaches
  // React through the store subscription above.
  useEffect(() => {
    if (validationStarted || !pendingValidation) return;
    validationStarted = true;
    void validateStoredToken(pendingValidation);
  }, [session.status]);

  const signIn = useCallback(async (username: string, password: string) => {
    // Errors propagate on purpose: the login form is what turns a status code
    // into a message, and it must not be told the sign-in worked.
    const result = await userService.login({ username, password });
    // accessToken, not access_token: schemas/user.py uses ApiBaseModel now, so
    // /auth/login speaks the same camelCase as every other endpoint.
    writeSession({ token: result.accessToken, user: result.user });
    validationStarted = true;
    pendingValidation = null;
    publish({ status: "authed", user: result.user });
  }, []);

  const retry = useCallback(async () => {
    const stored = readSession();
    if (!stored) {
      publish(ANON);
      return;
    }
    publish({ status: "loading", user: stored.user });
    await validateStoredToken(stored.user);
  }, []);

  const saveDisplayName = useCallback(async (displayName: string | null) => {
    const profile = await userService.updateProfile({ displayName });
    const stored = readSession();
    if (stored) writeSession({ ...stored, user: profile });
    publish({ status: "authed", user: profile });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await userService.logout();
    } catch (error) {
      // The local session is dropped either way — refusing to sign out because
      // the server is unreachable would strand the user on a dead console.
      console.error("logout call failed", error);
    }
    signOutLocally();
  }, []);

  const value = useMemo<Auth>(
    () => ({ ...session, signIn, signOut, retry, saveDisplayName }),
    [session, signIn, signOut, retry, saveDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside an AuthProvider");
  return auth;
}
