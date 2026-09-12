"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/store/auth-store";

/**
 * Client-side gate. The session lives in localStorage, so there is no server
 * render that can know whether anyone is signed in — the console has to stay
 * unmounted until the first client tick has resolved the session, otherwise it
 * would start fetching on behalf of a signed-out visitor.
 *
 * Three answers, three screens: "anon" goes to the login page, "offline" means
 * the API never answered and gets the panel below, and only "authed" renders
 * the console. An unconfirmed session is never treated as a confirmed one.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, retry, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anon") {
      const destination = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(destination)}`);
    }
  }, [status, router]);

  if (status === "offline") return <BackendUnreachable onRetry={retry} onSignOut={signOut} />;

  if (status !== "authed") {
    return (
      <div className="grid min-h-screen place-items-center">
        <Icon name="loader" className="size-6 animate-spin text-accent" />
        <span className="sr-only">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน</span>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * What a visitor sees when the backend is not up. It says so plainly rather
 * than showing an empty console, which is what an unreachable API used to look
 * like and is indistinguishable from a console with no data yet.
 */
function BackendUnreachable({
  onRetry,
  onSignOut,
}: {
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      // If it worked the whole panel unmounts; if it did not, the button
      // has to come back for a second try.
      setRetrying(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface/80 p-6 text-center backdrop-blur-xl">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-warn-line bg-warn-soft">
          <Icon name="alert" className="size-6 text-warn" />
        </div>

        <h1 className="mt-4 font-display text-lg font-semibold tracking-tight text-text">
          เชื่อมต่อเซิร์ฟเวอร์ไม่ได้
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-text-2">
          ระบบยังตรวจสอบสิทธิ์การเข้าใช้งานของคุณไม่ได้
          เพราะติดต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบว่าเซิร์ฟเวอร์เปิดใช้งานอยู่
          แล้วลองใหม่อีกครั้ง
        </p>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button
            variant="primary"
            icon="refresh"
            loading={retrying}
            onClick={handleRetry}
          >
            {retrying ? "กำลังลองใหม่..." : "ลองใหม่อีกครั้ง"}
          </Button>
          <Button icon="log-out" disabled={retrying} onClick={() => void onSignOut()}>
            ออกจากระบบ
          </Button>
        </div>
      </div>
    </main>
  );
}
