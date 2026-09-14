"use client";

import Link from "next/link";
import { AppNav } from "@/features/dashboard/components/app-nav";
import { DASHBOARD_ROUTES } from "@/features/dashboard/lib/navigation";
import { AcademicPeriodSelector } from "@/features/dashboard/components/academic-period-selector";
import { withAcademicPeriod } from "@/features/dashboard/lib/academic-period";
import { useAcademicPeriod } from "@/features/dashboard/lib/use-academic-period";

const moduleDetails = {
  "/dashboard/electives": {
    category: "การเรียนการสอน", tone: "blue",
    description: "ดูความพร้อมก่อนเปิดสอน จำนวนที่นั่ง และเอกสารที่ต้องดำเนินการของแต่ละรายวิชา",
    features: "ความพร้อมรายวิชา · จำนวนที่นั่ง · เอกสาร",
    icon: "M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h5V4Z",
  },
  "/dashboard/internship": {
    category: "ประสบการณ์ทำงาน", tone: "green",
    description: "ติดตามบริษัทที่นิสิตเลือกฝึกงาน เปรียบเทียบจำนวนรับ และตำแหน่งที่ยังต้องติดตาม",
    features: "อันดับบริษัทที่นิสิตเลือก · จำนวนรับฝึกงาน",
    icon: "M8 7V4h8v3M3 7h18v13H3V7Zm0 5a21 21 0 0 0 18 0M10 12h4v3h-4v-3Z",
  },
  "/dashboard/cooperative": {
    category: "การเรียนรู้กับสถานประกอบการ", tone: "purple",
    description: "ดูใบสมัครสหกิจและจำนวนที่บริษัทรับ แยกติดตามจากการฝึกงานอย่างชัดเจน",
    features: "ใบสมัครสหกิจ · ตำแหน่งงาน · จำนวนรับ",
    icon: "M4 21V7h9v14M13 11h7v10M2 21h20M7 10h3m-3 4h3m-3 4h3m6-4h1m-1 4h1M7 7V3h6v4",
  },
  "/dashboard/mou": {
    category: "ความร่วมมือกับองค์กร", tone: "orange",
    description: "ตรวจสถานะคู่สัญญา การตรวจแก้เอกสาร การมอบอำนาจ และความคืบหน้าการลงนาม",
    features: "คู่สัญญา · ตรวจแก้ · มอบอำนาจ · ลงนาม",
    icon: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h4m2 1 1 1 3-3",
  },
  "/dashboard/capstone": {
    category: "โครงการและอาจารย์ที่ร่วมงาน", tone: "blue",
    description: "ดูหัวข้อที่นิสิตสนใจ อันดับกลุ่มผู้สมัครจากบริษัท และความเชื่อมโยงระหว่างบริษัทกับอาจารย์",
    features: "หัวข้อโครงการ · อันดับกลุ่ม · บริษัทและอาจารย์",
    icon: "M12 3 2 8l10 5 10-5-10-5ZM6 10v6c3 3 9 3 12 0v-6m4-2v8",
  },
} satisfies Record<typeof DASHBOARD_ROUTES[number]["href"], { category: string; tone: string; description: string; features: string; icon: string }>;

export function HomeDashboard() {
  const period = useAcademicPeriod();
  return (
    <div className="app-shell" data-ready="true">
      <header className="topbar">
        <AppNav title="Dashboard" eyebrow="NEXTLINK / WORKSPACE" />
        <div className="header-tools">
          <div className="header-meta"><span>{DASHBOARD_ROUTES.length} โมดูลการทำงาน</span></div>
          <AcademicPeriodSelector />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="page-content home-content">
        <section className="intro-row">
          <div>
            <p className="section-kicker">การเรียนรู้และความร่วมมือ</p>
            <h2>ภาพรวมการเรียนรู้และความร่วมมือ</h2>
            <p className="intro-copy">เลือกงานที่ต้องการติดตาม เพื่อดูภาพรวม ตรวจรายละเอียด และจัดการงานที่ค้างอยู่</p>
          </div>
        </section>

        <section className="home-module-grid" aria-label="เลือกโมดูลการทำงาน">
          {DASHBOARD_ROUTES.map(({ href, label }) => {
            const detail = moduleDetails[href];
            return (
              <Link key={href} href={withAcademicPeriod(href, period)} data-route={href} className="home-module-card" data-tone={detail.tone} aria-labelledby={`module-${href.slice(1)}`}>
                <div className="home-module-topline">
                  <span className="home-module-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={detail.icon} /></svg></span>
                  <span className="home-module-category">{detail.category}</span>
                </div>
                <h3 id={`module-${href.slice(1)}`}>{label}</h3>
                <p className="home-module-description">{detail.description}</p>
                <p className="home-module-features">{detail.features}</p>
                <span className="home-module-action">เปิดหน้า{label}<span aria-hidden="true">↗</span></span>
              </Link>
            );
          })}
        </section>

        <section className="panel home-follow-ups" aria-labelledby="home-follow-ups-title">
          <div><h2 id="home-follow-ups-title">เริ่มจากงานที่ต้องติดตาม</h2><p>เปิดรายการงานค้างของแต่ละส่วนได้โดยตรง</p></div>
          <div className="home-shortcuts">
            {DASHBOARD_ROUTES.map(({ href, label }) => <Link key={href} href={withAcademicPeriod(`${href}#action-queue`, period)}>งานติดตาม{label}<span aria-hidden="true">→</span></Link>)}
          </div>
        </section>
      </main>
    </div>
  );
}
