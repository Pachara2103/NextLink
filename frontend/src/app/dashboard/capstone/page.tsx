import type { Metadata } from "next";
import { CapstoneDashboard } from "@/features/dashboard/components/capstone-dashboard";
import { getCapstoneData } from "@/features/dashboard/lib/capstone-data";
import { academicPeriodKey, parseAcademicPeriod, type PeriodSearchParams } from "@/features/dashboard/lib/academic-period";
import { selectCapstonePeriod } from "@/features/dashboard/lib/academic-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "NextLink · Capstone",
  description: "ติดตามหัวข้อ Capstone ความสนใจของนิสิต อันดับกลุ่มผู้สมัครจากบริษัท และความร่วมมือกับอาจารย์",
};
export default async function CapstonePage({ searchParams }: { searchParams: Promise<PeriodSearchParams> }) {
  const period = parseAcademicPeriod(await searchParams);
  return <CapstoneDashboard key={academicPeriodKey(period)} payload={selectCapstonePeriod(getCapstoneData(), period)} />;
}
