"use client";

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
  active: PanelKey;
  onNavigate: (panel: PanelKey) => void;
}) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line-soft bg-sunken p-1 lg:hidden">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onNavigate(item.key)}
          aria-current={item.key === active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition",
            item.key === active
              ? "bg-accent-soft text-accent"
              : "text-text-2 hover:text-text",
          )}
        >
          {SHORT_LABELS[item.key]}
        </button>
      ))}
    </nav>
  );
}
