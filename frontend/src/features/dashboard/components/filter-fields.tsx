"use client";

import { useId, useState, type ReactNode } from "react";

/** Search remains visible; secondary filters can be folded on a phone. */
export function FilterFields({ search, children, activeCount, className = "" }: {
  search: ReactNode; children: ReactNode; activeCount: number; className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className={`filters ${className}`}>
    {search}
    <button className="filter-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <span>ตัวกรองเพิ่มเติม{activeCount > 0 ? ` · ใช้อยู่ ${activeCount}` : ""}</span>
      <span>{expanded ? "ซ่อน" : "แสดง"}</span>
    </button>
    <div id={id} className="filter-fields-extra" data-expanded={expanded}>{children}</div>
  </div>;
}
