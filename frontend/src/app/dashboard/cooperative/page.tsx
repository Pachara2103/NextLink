import type { Metadata } from "next";
import { InternshipDashboard } from "@/features/dashboard/components/internship-dashboard";
import { getInternshipDashboardData } from "@/features/dashboard/lib/internship-data";
import { academicPeriodKey, parseAcademicPeriod, type PeriodSearchParams } from "@/features/dashboard/lib/academic-period";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "NextLink · สหกิจศึกษา",
  description: "ติดตามบริษัทที่นิสิตเลือกสหกิจศึกษา และจำนวนที่บริษัทแจ้งรับเทียบกับที่รับจริง",
};
export default async function CooperativePage({ searchParams }: { searchParams: Promise<PeriodSearchParams> }) {
  const period = parseAcademicPeriod(await searchParams);
  const payload = await getInternshipDashboardData("สหกิจศึกษา", period);
  return <InternshipDashboard key={`${payload.track}.${academicPeriodKey(period)}`} payload={payload} />;
}
