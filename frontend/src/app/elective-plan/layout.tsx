import type { Metadata } from "next";
import { PlannerFrame } from "@/features/elective-plan/components/planner-frame";
import "@/features/elective-plan/planner.css";

export const metadata: Metadata = { title: "จัดตารางวิชาเลือก | NextLink" };

export default function ElectivePlanLayout({ children }: LayoutProps<"/elective-plan">) {
  return <PlannerFrame>{children}</PlannerFrame>;
}
