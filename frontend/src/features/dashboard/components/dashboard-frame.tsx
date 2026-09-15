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
          <details className="dashboard-demo-notice">
            <summary>ข้อมูลทดลอง · บันทึกเฉพาะเบราว์เซอร์นี้</summary>
            <p>การแก้ไขแยกตามบัญชีของคุณในเบราว์เซอร์นี้ ยังไม่เชื่อมฐานข้อมูลส่วนกลาง และไม่ส่งต่อไปยังเครื่องของเจ้าหน้าที่คนอื่น</p>
          </details>
          <Suspense fallback={<p className="page-content" role="status">กำลังโหลด Dashboard…</p>}>
            {children}
          </Suspense>
        </div>
      </ConsoleFrame>
    </ConsoleProvider>
  </RequireAuth>;
}
