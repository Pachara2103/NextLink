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
          {dataSource === "demo" ? <details className="dashboard-demo-notice">
            <summary>ข้อมูลทดลอง · บันทึกเฉพาะเบราว์เซอร์นี้</summary>
            <p>การแก้ไขแยกตามบัญชีของคุณในเบราว์เซอร์นี้ ยังไม่เชื่อมฐานข้อมูลส่วนกลาง และไม่ส่งต่อไปยังเครื่องของเจ้าหน้าที่คนอื่น</p>
          </details> : <details className="dashboard-demo-notice"><summary>Friday Activity · ฐานข้อมูลกลาง</summary><p>กิจกรรมในหน้านี้อ่านและบันทึกผ่านระบบกลาง เจ้าหน้าที่คนอื่นดูข้อมูลเดียวกันได้หลังโหลดใหม่ สถานะการเชื่อมต่อแสดงในหน้า Friday Activity</p></details>}
          <Suspense fallback={<p className="page-content" role="status">กำลังโหลด Dashboard…</p>}>
            {children}
          </Suspense>
        </div>
      </ConsoleFrame>
    </ConsoleProvider>
  </RequireAuth>;
}
