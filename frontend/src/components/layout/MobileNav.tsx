"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { NAV_ITEMS } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";
import type { PanelKey } from "@/types";

const SHORT_LABELS: Record<PanelKey, string> = {
  contacts: "รออนุมัติ",
  people: "บุคคลในบริษัท",
  groups: "กลุ่มไลน์",
  notes: "โน้ต",
  agent: "คุณขวัญใจ",
  library: "สถานะ",
};

/**
 * What is left of the topbar.
 *
 * The bar itself is gone — its two actions now live beside the title of the
 * panel they act on — but the sidebar is `lg:` only, so below that width this
 * is the only way between panels. It scrolls with the page instead of sticking
 * to the top: it is navigation, not a toolbar, and the page no longer has a
 * fixed chrome for it to belong to.
 */
export function MobileNav({
  active,
  onNavigate,
}: {
  active: PanelKey | "planner";
  onNavigate: (panel: PanelKey) => void;
}) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const revealCurrent = () => {
      const current = element.querySelector<HTMLElement>('[aria-current="page"]');
      if (current && element.clientWidth > 0) {
        element.scrollLeft += current.getBoundingClientRect().left - element.getBoundingClientRect().left - 8;
      }
    };
    revealCurrent();
    // The mobile navigation also becomes visible when a desktop window shrinks.
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  return (
    <div className="mb-5 space-y-2 lg:hidden">
      <ThemeSwitcher />
    <nav ref={nav} aria-label="เมนูหลัก" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line-soft bg-sunken p-1 lg:hidden">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onNavigate(item.key)}
          aria-current={item.key === active ? "page" : undefined}
          className={cn(
            "flex min-h-11 shrink-0 items-center rounded-lg px-3 py-1.5 text-[13px] transition",
            item.key === active
              ? "bg-accent-soft text-accent"
              : "text-text-2 hover:text-text",
          )}
        >
          {SHORT_LABELS[item.key]}
        </button>
      ))}
      <Link href="/elective-plan" aria-current={active === "planner" ? "page" : undefined}
        className={cn("flex min-h-11 shrink-0 items-center rounded-lg px-3 py-1.5 text-[13px]", active === "planner" ? "bg-accent-soft text-accent" : "text-text-2")}>จัดตารางวิชาเลือก</Link>
    </nav>
    </div>
  );
}
