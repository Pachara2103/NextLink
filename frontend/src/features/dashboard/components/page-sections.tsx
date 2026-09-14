"use client";

import type { MouseEvent } from "react";
import { focusDashboardSection } from "@/features/dashboard/lib/section-navigation";

/** Shortcuts stay available while reading a long dashboard. */
export function PageSections({ capstone = false, friday = false }: { capstone?: boolean; friday?: boolean }) {
  const sections = [
    { id: "dashboard-filters", label: "ค้นหา" },
    { id: "action-queue", label: "งานติดตาม" },
    { id: "dashboard-directory", label: "ทะเบียน" },
    ...(capstone ? [
      { id: "capstone-ranking", label: "อันดับกลุ่ม" },
      { id: "capstone-relationships", label: "บริษัทและอาจารย์" },
    ] : []),
    ...(friday ? [{ id: "friday-companies", label: "บริษัทในเทอมนี้" }] : []),
    { id: "dashboard-analysis", label: friday ? "ผลประเมิน" : "สถิติ" },
  ];

  function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    focusDashboardSection(id);
  }

  return <nav className="page-sections" aria-label="ทางลัดในหน้านี้">
    {sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={event => jump(event, section.id)}>{section.label}</a>)}
  </nav>;
}
