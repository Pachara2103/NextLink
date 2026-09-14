"use client";

import { Suspense, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ConsoleFrame } from "@/components/layout/ConsoleFrame";
import { useAuth } from "@/store/auth-store";
import { ConsoleProvider } from "@/store/console-store";

export function DashboardFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  return <RequireAuth>
    <ConsoleProvider>
      <ConsoleFrame active="dashboard" wide onNavigate={panel => router.push(`/?panel=${panel}`)}>
        <div className="nextlink-dashboard" key={user?.id}>
          <a className="skip-link" href="#main-content">ข้ามไปเนื้อหา Dashboard</a>
          <div className="dashboard-demo-notice" role="note">
            <strong>Dashboard · ข้อมูลทดลอง</strong>
            <span>การแก้ไขเก็บในเบราว์เซอร์นี้สำหรับบัญชีของคุณ ยังไม่เชื่อมฐานข้อมูลส่วนกลาง</span>
          </div>
          <Suspense fallback={<p className="page-content" role="status">กำลังโหลด Dashboard…</p>}>
            {children}
          </Suspense>
        </div>
      </ConsoleFrame>
    </ConsoleProvider>
  </RequireAuth>;
}
