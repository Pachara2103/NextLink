"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_ROUTES } from "@/features/dashboard/lib/navigation";
import { withAcademicPeriod } from "@/features/dashboard/lib/academic-period";
import { useAcademicPeriod } from "@/features/dashboard/lib/use-academic-period";

export function AppNav({ title }: { title: string }) {
  return <div className="brand-lockup">
    <div><div className="eyebrow">NEXTLINK DASHBOARD</div><h1>{title}</h1></div>
  </div>;
}

/** Visible links expose every module without requiring discovery of a title menu. */
export function DashboardModuleNav() {
  const pathname = usePathname();
  const period = useAcademicPeriod();
  return <nav className="dashboard-module-nav" aria-label="โมดูล Dashboard">
    {APP_ROUTES.map(section => <Link
      key={section.href}
      href={withAcademicPeriod(section.href, period)}
      data-route={section.href}
      aria-current={pathname === section.href ? "page" : undefined}
    >{section.href === "/dashboard" ? "ภาพรวม" : section.label}</Link>)}
  </nav>;
}
