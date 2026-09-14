import type { Metadata } from "next";
import { FridayDashboard } from "@/features/dashboard/components/friday-dashboard";
import { fridayActivities } from "@/features/dashboard/data/friday-activities";
import { selectFridayPeriod } from "@/features/dashboard/lib/friday-activity";
import { academicPeriodKey, parseAcademicPeriod, type PeriodSearchParams } from "@/features/dashboard/lib/academic-period";

export const metadata: Metadata = { title: "NextLink · Friday Activity", description: "กิจกรรมรายเทอม บริษัทที่เข้าร่วม และผลประเมินนิสิตกับบริษัท" };
export const dynamic = "force-dynamic";

export default async function FridayActivitiesPage({ searchParams }: { searchParams: Promise<PeriodSearchParams> }) {
  const period = parseAcademicPeriod(await searchParams);
  return <FridayDashboard key={academicPeriodKey(period)} activities={selectFridayPeriod(fridayActivities, period)} />;
}
