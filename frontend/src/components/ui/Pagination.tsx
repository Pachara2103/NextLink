"use client";

import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Only rendered when there is more than one page, matching the original.
 * Each list keeps its own page number, so this component stays stateless.
 */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const windowed = pages.filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1,
  );

  return (
    <nav
      aria-label="เปลี่ยนหน้า"
      className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface px-3 py-2.5"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition",
          page <= 1
            ? "cursor-not-allowed border-line-soft text-text-4"
            : "border-line bg-surface text-text hover:bg-surface-2",
        )}
      >
        <Icon name="arrow-left" className="size-4" />
        <span className="hidden sm:inline">ก่อนหน้า</span>
      </button>

      <div className="flex items-center gap-1">
        {windowed.map((n, index) => {
          const gap = index > 0 && n - windowed[index - 1] > 1;
          return (
            <span key={n} className="flex items-center gap-1">
              {gap && (
                <span className="px-1 font-mono text-[12px] text-text-4">
                  …
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange(n)}
                aria-current={n === page ? "page" : undefined}
                className={cn(
                  "grid size-8 place-items-center rounded-lg font-mono text-[13px] tabular-nums transition",
                  n === page
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-text-2 hover:bg-surface-2",
                )}
              >
                {n}
              </button>
            </span>
          );
        })}
        <span className="px-1.5 font-mono text-[12px] text-text-4">
          / {totalPages}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] transition",
          page >= totalPages
            ? "cursor-not-allowed border-line-soft text-text-4"
            : "border-line bg-surface text-text hover:bg-surface-2",
        )}
      >
        <span className="hidden sm:inline">ถัดไป</span>
        <Icon name="arrow-right" className="size-4" />
      </button>
    </nav>
  );
}
