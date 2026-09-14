import type { Metadata } from "next";
import { InternshipDashboard } from "@/features/dashboard/components/internship-dashboard";
import { getInternshipDashboardData } from "@/features/dashboard/lib/internship-data";
import { academicPeriodKey, parseAcademicPeriod, type PeriodSearchParams } from "@/features/dashboard/lib/academic-period";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NextLink · ฝึกงาน",
  description: "Dashboard จัดอันดับบริษัทที่นิสิตเลือกฝึกงาน และเทียบจำนวนที่บริษัทแจ้งว่าจะรับกับที่รับจริง",
};

export default async function InternshipPage({ searchParams }: { searchParams: Promise<PeriodSearchParams> }) {
  const period = parseAcademicPeriod(await searchParams);
  const payload = await getInternshipDashboardData("ฝึกงาน", period);
  return <InternshipDashboard key={`${payload.track}.${academicPeriodKey(period)}`} payload={payload} />;
}
