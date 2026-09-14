"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ACADEMIC_TERMS, DEMO_ACADEMIC_YEARS, academicPeriodLabel, type AcademicPeriod, type AcademicTerm } from "@/features/dashboard/lib/academic-period";
import { useAcademicPeriod } from "@/features/dashboard/lib/use-academic-period";

export function AcademicPeriodSelector({ availableYears = [] }: { availableYears?: number[] }) {
  const period = useAcademicPeriod();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const years = [...new Set([...DEMO_ACADEMIC_YEARS, ...availableYears, period.year])].sort((a, b) => b - a);
  function change(next: AcademicPeriod) {
    // A new cohort starts with clean record filters and pagination.
    const query = new URLSearchParams({ year: String(next.year), term: next.term });
    startTransition(() => router.push(`${pathname}?${query}`, { scroll: false }));
  }
  return <section className="academic-period-panel" aria-label="ช่วงการศึกษาที่แสดง" aria-busy={pending}>
    <div className="academic-period-fields">
      <label><span>ปีการศึกษา</span><select aria-label="เลือกปีการศึกษา" value={period.year} disabled={pending} onChange={e => change({ ...period, year: Number(e.target.value) })}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
      <label><span>ภาคการศึกษา</span><select aria-label="เลือกภาคการศึกษา" value={period.term} disabled={pending} onChange={e => change({ ...period, term: e.target.value as AcademicTerm })}>{ACADEMIC_TERMS.map(term => <option key={term.value} value={term.value}>{term.label}</option>)}</select></label>
    </div>
    <span className="sr-only" role="status">{pending ? "กำลังเปลี่ยนช่วงการศึกษา" : academicPeriodLabel(period)}</span>
  </section>;
}

export function AcademicPeriodEmptyState({ hasData }: { hasData: boolean }) {
  const period = useAcademicPeriod();
  return hasData ? null : <p className="academic-period-empty" role="status">ยังไม่มีข้อมูลสำหรับ {academicPeriodLabel(period)} กรุณาเลือกช่วงการศึกษาอื่น</p>;
}
