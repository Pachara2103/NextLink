"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { MESSAGES } from "@/lib/constants";
import { isNetworkError, serverDetail } from "@/lib/services/errors";
import { ApiError } from "@/lib/services/http";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth-store";

/**
 * Turns a failed sign-in into the sentence shown under the button.
 *
 * A 401 keeps its own wording rather than echoing the API: the backend says
 * the same thing, and a login form saying "เข้าสู่ระบบไม่สำเร็จ: ชื่อผู้ใช้
 * หรือรหัสผ่านไม่ถูกต้อง" reads worse than just naming the problem.
 */
function loginErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return MESSAGES.loginNetworkFailed;

  const { status } = error as ApiError;
  if (status === 401) return MESSAGES.loginBadCredentials;
  if (status === 422) return MESSAGES.loginBadRequest;

  const detail = serverDetail(error);
  if (detail) return `${MESSAGES.loginPrefix}: ${detail}`;

  if (status >= 500) return MESSAGES.loginServerFailed;
  return MESSAGES.loginFailed;
}

export function LoginPage() {
  const router = useRouter();
  const { status, signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Someone who is already signed in has no business on this page.
  useEffect(() => {
    if (status === "authed") router.replace("/");
  }, [status, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!username.trim() || !password) {
      setError(MESSAGES.loginRequireFields);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      router.replace("/");
    } catch (err) {
      console.error("login failed", err);
      setError(loginErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-10">
      {/* same ambient glow the console uses, so the two pages read as one system */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_100%_at_50%_0%,var(--color-glow),transparent_70%)]"
      />

      <div className="relative w-full max-w-[400px]">
        <div className="flex flex-col items-center text-center">
          
           <img
          src="/nextlink-logo.png"
          alt="NextLink Icon"
          width={40}
          height={40}
          className="size-18 shrink-0 object-contain"
        />


        <img
         src="/nextlink-text.png"
         alt="NextLink Text"
         className="h-18 w-auto shrink-0" 
        />
      
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-2 rounded-2xl border border-line bg-surface/80 p-5 backdrop-blur-xl sm:p-6"
        >
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
              ชื่อผู้ใช้
            </span>
            <div className="relative mt-1.5">
              <Icon
                name="user"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-4"
              />
              <input
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                placeholder="ชื่อผู้ใช้ของคุณ"
                className={cn(
                  "w-full rounded-xl border bg-sunken py-2.5 pr-3.5 pl-10 text-[14px] text-text transition",
                  "placeholder:text-text-4 focus:outline-none",
                  error
                    ? "border-danger-line focus:border-danger-line"
                    : "border-line focus:border-accent",
                )}
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
              รหัสผ่าน
            </span>
            <div className="relative mt-1.5">
              <Icon
                name="lock"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-4"
              />
              <input
                name="password"
                /* hidden by default; the toggle below is the only way to reveal it */
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                aria-invalid={error ? true : undefined}
                placeholder="••••••••"
                className={cn(
                  "w-full rounded-xl border bg-sunken py-2.5 pr-11 pl-10 text-[14px] text-text transition",
                  "placeholder:text-text-4 focus:outline-none",
                  error
                    ? "border-danger-line focus:border-danger-line"
                    : "border-line focus:border-accent",
                )}
              />
              <button
                type="button"
                onClick={() => setReveal((on) => !on)}
                aria-label={reveal ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                aria-pressed={reveal}
                title={reveal ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-text-3 transition hover:bg-surface-2 hover:text-text"
              >
                <Icon name={reveal ? "eye" : "eye-off"} className="size-4" />
              </button>
            </div>
          </label>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={busy}
            className="mt-5"
          >
            {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>

          {/* the brief asks for the failure reason to sit right under the button */}
          {error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger"
            >
              <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" />
              {error}
            </p>
          )}
        </form>

        <p className="mt-5 text-center text-[11px] text-text-4">
          บัญชีผู้ใช้ออกให้โดยผู้ดูแลระบบเท่านั้น
        </p>
      </div>
    </main>
  );
}
