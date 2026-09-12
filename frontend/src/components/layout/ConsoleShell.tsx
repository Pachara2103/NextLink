"use client";

import { useState } from "react";

import { ConsoleFrame } from "@/components/layout/ConsoleFrame";
import { AgentPanel } from "@/components/panels/AgentPanel";
import { ContactsPanel } from "@/components/panels/ContactsPanel";
import { GroupsPanel } from "@/components/panels/GroupsPanel";
import { LibraryPanel } from "@/components/panels/LibraryPanel";
import { NotesPanel } from "@/components/panels/NotesPanel";
import { PeoplePanel } from "@/components/panels/PeoplePanel";
import { ConsoleProvider } from "@/store/console-store";
import type { PanelKey } from "@/types";

const PANELS: Record<PanelKey, () => React.ReactElement> = {
  contacts: ContactsPanel,
  people: PeoplePanel,
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

export function ConsoleShell({ initialPanel = "contacts" }: { initialPanel?: PanelKey }) {
  const [panel, setPanel] = useState<PanelKey>(initialPanel);
  const Panel = PANELS[panel];
  const fullHeight = FULL_HEIGHT.has(panel);

  function navigate(next: PanelKey) {
    setPanel(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <ConsoleProvider>
      <ConsoleFrame active={panel} onNavigate={navigate} fullHeight={fullHeight}>
        <Panel />
      </ConsoleFrame>
    </ConsoleProvider>
  );
}
