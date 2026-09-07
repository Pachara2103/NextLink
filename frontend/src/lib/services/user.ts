import { getJson, postJson, putJson } from "@/lib/services/http";
import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  ProfileUpdate,
  StatusResponse,
} from "@/types";

export const userService = {
  /**
   * 401 means the credentials are wrong; anything else is a server problem.
   * backend/services/user.py keeps those two apart on purpose, so the
   * login form can say which one happened.
   */
  login: (payload: LoginRequest) =>
    postJson<LoginResponse>("/api/v1/auth/login", payload),

  /** Checks a stored token against the API. 401 means it is no longer good. */
  me: () => getJson<AuthUser>("/api/v1/auth/me"),

  /**
   * Renames the signed-in user. The id comes from the token at the backend, so
   * there is nothing to pass but the new name — and the fresh profile comes
   * back, which is what the session then stores.
   */
  updateProfile: (payload: ProfileUpdate) =>
    putJson<AuthUser>("/api/v1/auth/me", payload),

  /**
   * Tokens are stateless and self-expiring, so dropping the token IS the
   * logout — this just tells the backend, and callers must clear their own
   * session whether or not it resolves.
   */
  logout: () => postJson<StatusResponse>("/api/v1/auth/logout", {}),
};
