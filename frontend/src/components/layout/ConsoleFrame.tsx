"use client";

import type { ReactNode } from "react";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { ServerStatusBanner } from "./ServerStatusBanner";
import { ToastHost } from "./ToastHost";
import type { PanelKey } from "@/types";

export function ConsoleFrame({ active, onNavigate, fullHeight = false, wide = false, children }: {
  active: PanelKey | "planner";
  onNavigate: (panel: PanelKey) => void;
  fullHeight?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return <>
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[380px] bg-[radial-gradient(70%_100%_at_50%_0%,var(--color-glow),transparent_70%)]" />
    <div className={fullHeight ? "relative flex h-screen overflow-hidden" : "relative flex min-h-screen"}>
      <Sidebar active={active} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ToastHost />
        <ServerStatusBanner />
        <main className={fullHeight ? "flex min-h-0 flex-1 flex-col" : wide ? "min-w-0 flex-1" : "mx-auto w-full max-w-[1200px] flex-1 px-5 py-7 sm:px-8"}>
          <div className={fullHeight || wide ? "px-5 pt-4 sm:px-8 lg:hidden" : undefined}>
            <MobileNav active={active} onNavigate={onNavigate} />
          </div>
          {children}
        </main>
        {!fullHeight && <footer className="border-t border-line-soft px-5 py-6 sm:px-8">
          <div className="mx-auto max-w-[1200px] font-mono text-[11px] text-text-4">NextLink Console</div>
        </footer>}
      </div>
    </div>
  </>;
}
