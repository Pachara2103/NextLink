import type { Metadata } from "next";
import { ElectiveDashboard } from "@/features/dashboard/components/elective-dashboard";
import { getElectiveDashboardData } from "@/features/dashboard/lib/elective-data";
import { academicPeriodKey, parseAcademicPeriod, type PeriodSearchParams } from "@/features/dashboard/lib/academic-period";
import { selectElectivePeriod } from "@/features/dashboard/lib/academic-data";

export const metadata: Metadata = {
  title: "NextLink · วิชาเลือก",
  description: "ติดตามความพร้อมรายวิชาเลือก จำนวนที่นั่ง เอกสาร และงานก่อนเปิดสอน",
};

export const dynamic = "force-dynamic";

export default async function ElectivesPage({ searchParams }: { searchParams: Promise<PeriodSearchParams> }) {
  const period = parseAcademicPeriod(await searchParams);
  const payload = await getElectiveDashboardData(period);
  return <ElectiveDashboard key={academicPeriodKey(period)} payload={selectElectivePeriod(payload, period)} />;
}
