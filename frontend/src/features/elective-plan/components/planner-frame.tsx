"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ConsoleFrame } from "@/components/layout/ConsoleFrame";
import { ConsoleProvider } from "@/store/console-store";

export function PlannerFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <RequireAuth><ConsoleProvider>
    <ConsoleFrame active="planner" wide onNavigate={(panel) => router.push(`/?panel=${panel}`)}>
      <div className="elective-planner">{children}</div>
    </ConsoleFrame>
  </ConsoleProvider></RequireAuth>;
}
