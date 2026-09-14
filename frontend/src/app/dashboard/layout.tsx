import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardFrame } from "@/features/dashboard/components/dashboard-frame";
import "@/features/dashboard/dashboard.css";

export const metadata: Metadata = {
  title: "Dashboard | NextLink",
  description: "ติดตามวิชาเลือก MOU ฝึกงาน สหกิจ และ Capstone ใน NextLink",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardFrame>{children}</DashboardFrame>;
}
