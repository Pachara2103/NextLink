import type { Metadata } from "next";
import { FridayLiveDashboard } from "@/features/dashboard/components/friday-live-dashboard";
import { academicPeriodKey, parseAcademicPeriod, type PeriodSearchParams } from "@/features/dashboard/lib/academic-period";

export const metadata: Metadata = { title: "NextLink · Friday Activity", description: "ทะเบียนกิจกรรม Friday Activity และการติดตามงานจากฐานข้อมูลกลาง" };
export const dynamic = "force-dynamic";

export default async function FridayActivitiesPage({ searchParams }: { searchParams: Promise<PeriodSearchParams> }) {
  const period = parseAcademicPeriod(await searchParams);
  return <FridayLiveDashboard key={academicPeriodKey(period)} period={period} />;
}
