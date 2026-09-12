"use client";

import { useWebsiteTheme } from "./ThemeProvider";

export function ThemeSwitcher() {
  const { theme, setTheme } = useWebsiteTheme();
  return (
    <div role="group" aria-label="ธีมเว็บไซต์" className="flex rounded-xl border border-line bg-sunken p-1 text-xs">
      {([ ["classic", "สีดั้งเดิม"], ["dark", "โหมดมืด"] ] as const).map(([value, label]) => (
        <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}
          className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 font-medium transition ${theme === value ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
