"use client";

import { useEffect, useRef } from "react";

export const PAGE_SIZE = 25;

/**
 * Only rendered once a list outgrows a single page, so the ten-row demo looks
 * exactly as it did while a real term's worth of rows stays navigable.
 */
export function Pager({
  page,
  pageCount,
  total,
  unit,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  const previousPage = useRef(page);

  useEffect(() => {
    const previous = previousPage.current;
    previousPage.current = page;
    if (previous === page) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const direction = page > previous ? 1 : -1;
    const results = document.querySelectorAll<HTMLElement>("#dashboard-directory .table-wrap, #dashboard-directory .mobile-course-list");
    const animations = Array.from(results)
      .filter(element => element.getClientRects().length > 0 && typeof element.animate === "function")
      .map(element => element.animate(
        [{ opacity: 0.45, transform: `translateX(${direction * 8}px)` }, { opacity: 1, transform: "none" }],
        { id: "page-results-enter", duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      ));
    const cancel = () => animations.forEach(animation => animation.cancel());
    motion.addEventListener("change", cancel);
    // A quick second click or route change cancels the previous animation.
    return () => { cancel(); motion.removeEventListener("change", cancel); };
  }, [page]);

  if (pageCount <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  function goToPage(next: number) {
    onChange(next);
    requestAnimationFrame(() => {
      const directory = document.getElementById("dashboard-directory");
      directory?.focus({ preventScroll: true });
      directory?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }

  return (
    <nav className="pager" aria-label={`แบ่งหน้ารายการ${unit}`}>
      <span className="pager-range">
        {from}–{to} จาก {total} {unit}
      </span>
      <span className="pager-controls">
        <button className="row-action" type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          ก่อนหน้า
        </button>
        <span className="pager-position" aria-current="page">
          หน้า {page} / {pageCount}
        </span>
        <button className="row-action" type="button" onClick={() => goToPage(page + 1)} disabled={page >= pageCount}>
          ถัดไป
        </button>
      </span>
    </nav>
  );
}
