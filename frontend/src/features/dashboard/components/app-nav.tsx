"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { APP_ROUTES } from "@/features/dashboard/lib/navigation";
import { withAcademicPeriod } from "@/features/dashboard/lib/academic-period";
import { useAcademicPeriod } from "@/features/dashboard/lib/use-academic-period";

type AppNavProps = { title: string; eyebrow?: string };

function BrandHeading({ title, eyebrow = "NEXTLINK", children }: AppNavProps & { children?: ReactNode }) {
  return <div className="brand-lockup">
    <div className="brand-mark" aria-hidden="true">N</div>
    <div><div className="eyebrow">{eyebrow}</div><h1>{children ?? title}</h1></div>
  </div>;
}

export function AppNav(props: AppNavProps) {
  return <Suspense fallback={<BrandHeading {...props} />}><PageSwitcher {...props} /></Suspense>;
}

function PageSwitcher({ title, eyebrow }: AppNavProps) {
  const pathname = usePathname();
  const period = useAcademicPeriod();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function closeAndFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); closeAndFocus(); return;
    }
    const links = Array.from(navRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || (current < 0 && event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    setOpen(true);
    const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : event.key === "ArrowDown" ? (current + 1) % links.length : (current < 0 ? links.length - 1 : (current - 1 + links.length) % links.length);
    requestAnimationFrame(() => links[next]?.focus());
  }

  return <div ref={containerRef} className="app-switcher" onKeyDown={onKeyDown} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <BrandHeading title={title} eyebrow={eyebrow}>
      <button ref={triggerRef} type="button" className="app-switcher-trigger" aria-label={`เลือกหน้า: ${title}`} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)}>
        {title}<svg className="app-switcher-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </BrandHeading>
    <nav ref={navRef} id={menuId} className="app-nav" aria-label="ส่วนของระบบ" hidden={!open}>
      <p className="app-nav-label">เลือกหน้าที่ต้องการ</p>
      {APP_ROUTES.map(section => <Link key={section.href} href={withAcademicPeriod(section.href, period)} data-route={section.href} className={pathname === section.href ? "is-active" : ""} aria-current={pathname === section.href ? "page" : undefined} onClick={event => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) closeAndFocus();
      }}>{section.label}</Link>)}
    </nav>
  </div>;
}
