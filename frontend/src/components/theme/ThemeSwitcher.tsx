"use client";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

import { useWebsiteTheme, type WebsiteTheme } from "./ThemeProvider";

const OPTIONS: { value: WebsiteTheme; icon: IconName; label: string }[] = [
  { value: "classic", icon: "sun", label: "โหมดสว่าง (สีดั้งเดิม)" },
  { value: "dark", icon: "moon", label: "โหมดมืด" },
];

/**
 * Icon-only theme switch — sun for the classic (light) palette, moon for dark.
 *
 * The words each button used to carry now live on aria-label/title: the glyphs
 * are the same convention as GroupLayoutToggle, and the sidebar footer reads
 * better without a third line of prose above the account row.
 *
 * Full-width with both halves equal, so it lines up with the account row below
 * it rather than floating as a small pill in the corner.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useWebsiteTheme();

  return (
    <div
      role="radiogroup"
      aria-label="ธีมเว็บไซต์"
      className="flex w-full gap-1 rounded-xl border border-line bg-sunken p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "grid h-9 flex-1 place-items-center rounded-lg transition",
              active
                ? "bg-accent-soft text-accent"
                : "text-text-3 hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon name={option.icon} className="size-[18px]" />
          </button>
        );
      })}
    </div>
  );
}
