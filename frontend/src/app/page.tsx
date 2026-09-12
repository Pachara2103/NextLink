import { ConsoleShell } from "@/components/layout/ConsoleShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

import type { PanelKey } from "@/types";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { panel } = await searchParams;
  const allowed: readonly string[] = ["contacts", "people", "groups", "notes", "agent", "library"];
  const initialPanel: PanelKey = typeof panel === "string" && allowed.includes(panel) ? panel as PanelKey : "contacts";
  return (
    <RequireAuth>
      <ConsoleShell key={initialPanel} initialPanel={initialPanel} />
    </RequireAuth>
  );
}
