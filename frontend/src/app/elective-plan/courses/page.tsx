import type { Metadata } from "next";
import { AvailabilityEditor } from "@/features/elective-plan/components/availability-editor";

export const metadata: Metadata = { title: "NextLink · วิชาและช่วงที่สะดวก" };

export default function CoursesPage() {
  return <AvailabilityEditor />;
}
