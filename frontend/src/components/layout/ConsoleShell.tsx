"use client";

import { useState } from "react";

import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastHost } from "@/components/layout/ToastHost";
import { AgentPanel } from "@/components/panels/AgentPanel";
import { ContactsPanel } from "@/components/panels/ContactsPanel";
import { GroupsPanel } from "@/components/panels/GroupsPanel";
import { LibraryPanel } from "@/components/panels/LibraryPanel";
import { NotesPanel } from "@/components/panels/NotesPanel";
import { ConsoleProvider } from "@/store/console-store";
import type { PanelKey } from "@/types";

const PANELS: Record<PanelKey, () => React.ReactElement> = {
  contacts: ContactsPanel,
  groups: GroupsPanel,
  notes: NotesPanel,
  agent: AgentPanel,
  library: LibraryPanel,
};

/**
 * Panels that own the viewport instead of flowing down the page.
 *
 * The agent is a chat: the composer has to stay reachable while the transcript
 * grows, so the panel scrolls inside itself and the page does not scroll at
 * all. That also means no footer — there is nothing below to scroll to.
 */
const FULL_HEIGHT: ReadonlySet<PanelKey> = new Set<PanelKey>(["agent"]);

export function ConsoleShell() {
  const [panel, setPanel] = useState<PanelKey>("contacts");
  const Panel = PANELS[panel];
  const fullHeight = FULL_HEIGHT.has(panel);

  function navigate(next: PanelKey) {
    setPanel(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <ConsoleProvider>
      {/* ambient glow behind the header, purely decorative */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[380px] bg-[radial-gradient(70%_100%_at_50%_0%,var(--color-glow),transparent_70%)]"
      />

      <div
        className={
          fullHeight
            ? "relative flex h-screen overflow-hidden"
            : "relative flex min-h-screen"
        }
      >
        <Sidebar active={panel} onNavigate={navigate} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Notifications no longer live in the layout at all: ToastHost
              portals itself to <body> and pins the stack to the bottom-right
              corner of the viewport, above the dialog layer, so a toast is
              readable while a modal is open and never shifts the panel. */}
          <ToastHost />

          {fullHeight ? (
            <main className="flex min-h-0 flex-1 flex-col">
              {/* Below lg the sidebar is hidden, so this is the only way out of
                  the panel. It sits above the chat's own scroll region rather
                  than inside it, so it cannot scroll away mid-conversation. */}
              <div className="px-5 pt-4 sm:px-8 lg:hidden">
                <MobileNav active={panel} onNavigate={navigate} />
              </div>
              <Panel />
            </main>
          ) : (
            <>
              <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-7 sm:px-8">
                <MobileNav active={panel} onNavigate={navigate} />
                <Panel />
              </main>

              <footer className="border-t border-line-soft px-5 py-6 sm:px-8">
                <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-text-4">
                  <span>NextLink AI · Coordinator Console</span>
                  <span>Next.js · TypeScript · Tailwind CSS</span>
                </div>
              </footer>
            </>
          )}
        </div>
      </div>
    </ConsoleProvider>
  );
}
