"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_ROUTES } from "@/features/dashboard/lib/navigation";
import { withAcademicPeriod } from "@/features/dashboard/lib/academic-period";
import { useAcademicPeriod } from "@/features/dashboard/lib/use-academic-period";

/**
 * Module tabs live in the topbar, level with the academic-period filter. The
 * active tab already names the page, so the visible title was dropped; a
 * screen-reader heading keeps the page outline intact.
 */
export function DashboardModuleNav() {
  const pathname = usePathname();
  const period = useAcademicPeriod();
  const current = APP_ROUTES.find(section => section.href === pathname);
  return <>
    <h1 className="sr-only">{current?.label ?? "Dashboard"}</h1>
    <nav className="dashboard-module-nav" aria-label="โมดูล Dashboard">
      {APP_ROUTES.map(section => <Link
        key={section.href}
        href={withAcademicPeriod(section.href, period)}
        data-route={section.href}
        aria-current={pathname === section.href ? "page" : undefined}
      >{section.href === "/dashboard" ? "ภาพรวม" : section.label}</Link>)}
    </nav>
  </>;
}
