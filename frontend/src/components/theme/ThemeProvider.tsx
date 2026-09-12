"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type WebsiteTheme = "classic" | "dark";
const ThemeContext = createContext<{ theme: WebsiteTheme; setTheme: (theme: WebsiteTheme) => void } | null>(null);
const STORAGE_KEY = "nextlink.theme";

export function ThemeProvider({ initialTheme, children }: { initialTheme: WebsiteTheme; children: ReactNode }) {
  const [theme, updateTheme] = useState(initialTheme);
  const apply = useCallback((next: WebsiteTheme) => {
    document.documentElement.dataset.theme = next;
    document.cookie = `nextlink-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    updateTheme(next);
  }, []);
  const setTheme = useCallback((next: WebsiteTheme) => {
    apply(next);
    // Cookies provide the first server render; storage events sync other tabs.
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* A blocked store must not disable the switch. */ }
  }, [apply]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === "classic" || event.newValue === "dark")) apply(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [apply]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useWebsiteTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ThemeProvider is required");
  return value;
}
