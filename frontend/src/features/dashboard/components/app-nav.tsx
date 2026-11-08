"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector('[aria-current="page"]');
    if (!nav || !link) return;

    const revealCurrent = () => {
      if (nav.scrollWidth <= nav.clientWidth) return;
      const rail = nav.getBoundingClientRect();
      const active = link.getBoundingClientRect();
      // Scroll only the menu so switching routes or resizing cannot move the page.
      if (active.left < rail.left) nav.scrollLeft += active.left - rail.left;
      else if (active.right > rail.right) nav.scrollLeft += active.right - rail.right;
    };

    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(nav);
    observer.observe(link);
    return () => observer.disconnect();
  }, [pathname]);

  return <>
    <h1 className="sr-only">{current?.label ?? "Dashboard"}</h1>
    <nav ref={navRef} className="dashboard-module-nav" aria-label="โมดูล Dashboard">
      {APP_ROUTES.map(section => <Link
        key={section.href}
        href={withAcademicPeriod(section.href, period)}
        data-route={section.href}
        aria-current={pathname === section.href ? "page" : undefined}
      >{section.href === "/dashboard" ? "ภาพรวม" : section.label}</Link>)}
    </nav>
  </>;
}
