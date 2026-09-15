import type { Metadata } from "next";
import { CourseList } from "@/features/elective-plan/components/course-list";

export const metadata: Metadata = { title: "NextLink · รายวิชา" };

export default function CourseListPage() {
  // Terms come from the provider rather than from here: which terms exist is a
  // fact about the plan, and on the shared plan it is a fact only the server
  // knows. Switching terms is still a state change in the table, not a load.
  return <CourseList />;
}
