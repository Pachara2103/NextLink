"use client";

import { useEffect } from "react";
import { AppNav, DashboardModuleNav } from "@/features/dashboard/components/app-nav";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <AppNav title="โหลดข้อมูลไม่สำเร็จ" />
      </header>
      <DashboardModuleNav />
      <main id="main-content" tabIndex={-1} className="page-content">
        <section className="panel">
          <div className="load-error" role="alert">
            <p>แสดงหน้านี้ไม่สำเร็จ กรุณาลองโหลดใหม่หรือเปิดหน้าอื่นจากเมนู</p>
            {error.digest ? <p className="panel-caption">รหัสอ้างอิงสำหรับแจ้งผู้ดูแลระบบ: {error.digest}</p> : null}
            <button className="primary-button" type="button" onClick={reset}>ลองโหลดใหม่</button>
          </div>
        </section>
      </main>
    </div>
  );
}
