import history from "../data/academic-history.json";
import { DEFAULT_ACADEMIC_PERIOD, academicPeriodKey, matchesAcademicPeriod, type AcademicPeriod } from "./academic-period";
import type { DashboardPayload, InternshipPayload, MouCompany, MouPayload } from "./types";
import type { CapstoneDataset } from "./capstone-types";
import type { TrackIntakes } from "./internship-tracks";

export const isDefaultPeriod = (period: AcademicPeriod) => academicPeriodKey(period) === academicPeriodKey(DEFAULT_ACADEMIC_PERIOD);
export const isHistoryPeriod = (period: AcademicPeriod) => period.year === history.period.year && period.term === history.period.term;

export function selectElectivePeriod(payload: DashboardPayload, period: AcademicPeriod): DashboardPayload {
  return { ...payload, availableAcademicYears: payload.availableAcademicYears ?? [...new Set(payload.courses.map(c => c.academicYear))], courses: payload.courses.filter(c => matchesAcademicPeriod(c.academicYear, c.term, period)) };
}

export function selectMouPeriod(payload: MouPayload, period: AcademicPeriod): MouPayload {
  if (isDefaultPeriod(period)) return payload;
  return { ...payload, dataset: `${payload.dataset}-${academicPeriodKey(period)}`,
    lastUpdated: isHistoryPeriod(period) ? history.lastUpdated : payload.lastUpdated,
    sourceFile: "ข้อมูลภาพสถานะงานติดตามเอกสารย้อนหลังจำลอง",
    companies: isHistoryPeriod(period) ? structuredClone(history.mouCompanies as MouCompany[]) : [] };
}

export function internshipPeriodSource(source: Omit<InternshipPayload, "track">, intakes: TrackIntakes, period: AcademicPeriod) {
  if (isDefaultPeriod(period)) return { source, intakes };
  if (isHistoryPeriod(period) || ([2566, 2567].includes(period.year) && period.term === "summer")) return {
    source: { ...source, dataset: `${source.dataset}-${academicPeriodKey(period)}`, sourceFile: "ข้อมูลใบสมัครและจำนวนรับย้อนหลังจำลอง", lastUpdated: history.lastUpdated, applications: structuredClone(history.internshipApplications) },
    intakes: structuredClone(history.internshipIntakes),
  };
  return { source: { ...source, companies: [], applications: [] }, intakes };
}

export function selectCapstonePeriod(data: CapstoneDataset, period: AcademicPeriod): CapstoneDataset {
  return { ...data, topics: data.topics.filter(t => matchesAcademicPeriod(t.year, t.term, period)) };
}
