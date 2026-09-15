"use client";

import { useSearchParams } from "next/navigation";
import { academicPeriodFromQuery } from "./academic-period";

export function useAcademicPeriod() {
  const params = useSearchParams();
  return academicPeriodFromQuery(params);
}
