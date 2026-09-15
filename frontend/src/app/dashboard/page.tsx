import { HomeDashboard } from "@/features/dashboard/components/home-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <HomeDashboard />;
}
