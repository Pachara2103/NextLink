import { PlanOverview } from "@/features/elective-plan/components/plan-overview";
import { getPlanPayload } from "@/features/elective-plan/lib/plan-data.ts";

export default function PlanPage() {
  return <PlanOverview payload={getPlanPayload()} />;
}
