import type { Metadata } from "next";
import { MouDashboard } from "@/features/dashboard/components/mou-dashboard";
import { getMouDashboardData } from "@/features/dashboard/lib/mou-data";
import { academicPeriodKey, parseAcademicPeriod, type PeriodSearchParams } from "@/features/dashboard/lib/academic-period";
import { selectMouPeriod } from "@/features/dashboard/lib/academic-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NextLink · MOU",
  description: "Dashboard สำหรับติดตามสถานะ MOU และกระบวนการขอมอบอำนาจ",
};

export default async function MouPage({ searchParams }: { searchParams: Promise<PeriodSearchParams> }) {
  const period = parseAcademicPeriod(await searchParams);
  const payload = await getMouDashboardData();
  return <MouDashboard key={academicPeriodKey(period)} payload={selectMouPeriod(payload, period)} />;
}
