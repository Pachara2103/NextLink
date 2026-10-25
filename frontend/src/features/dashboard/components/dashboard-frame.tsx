"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ConsoleFrame } from "@/components/layout/ConsoleFrame";
import { useAuth } from "@/store/auth-store";
import { ConsoleProvider } from "@/store/console-store";

export function DashboardFrame({ children, source }: { children: ReactNode; source?: "demo" | "postgresql" }) {
  const router = useRouter();
  const pathname = usePathname();
  const dataSource = source ?? (pathname === "/dashboard/friday-activities" ? "postgresql" : "demo");
  const { user } = useAuth();
  return <RequireAuth>
    <ConsoleProvider>
      <ConsoleFrame active="dashboard" wide onNavigate={panel => router.push(`/?panel=${panel}`)}>
        <div className="nextlink-dashboard" key={user?.id}>
          <a className="skip-link" href="#main-content">ข้ามไปเนื้อหา Dashboard</a>
          <Suspense fallback={<p className="page-content" role="status">กำลังโหลด Dashboard…</p>}>
            {children}
          </Suspense>
        </div>
      </ConsoleFrame>
    </ConsoleProvider>
  </RequireAuth>;
}
