"use client";

import type { MouseEvent } from "react";

/** Shortcuts stay available while reading a long dashboard. */
export function PageSections({ capstone = false }: { capstone?: boolean }) {
  const sections = [
    { id: "dashboard-filters", label: "ค้นหา" },
    { id: "action-queue", label: "งานติดตาม" },
    { id: "dashboard-directory", label: "ทะเบียน" },
    ...(capstone ? [
      { id: "capstone-ranking", label: "อันดับกลุ่ม" },
      { id: "capstone-relationships", label: "บริษัทและอาจารย์" },
    ] : []),
    { id: "dashboard-analysis", label: "สถิติ" },
  ];

  function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const section = document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }

  return <nav className="page-sections" aria-label="ทางลัดในหน้านี้">
    {sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={event => jump(event, section.id)}>{section.label}</a>)}
  </nav>;
}
