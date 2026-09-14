export const ACADEMIC_TERMS = [
  { value: "1", label: "เทอม 1", source: "ต้น" },
  { value: "2", label: "เทอม 2", source: "ปลาย" },
  { value: "summer", label: "ภาคฤดูร้อน", source: "ฤดูร้อน" },
] as const;
export type AcademicTerm = typeof ACADEMIC_TERMS[number]["value"];
export type AcademicPeriod = { year: number; term: AcademicTerm };
export type PeriodSearchParams = Record<string, string | string[] | undefined>;
export const DEFAULT_ACADEMIC_PERIOD: AcademicPeriod = { year: 2569, term: "1" };
export const DEMO_ACADEMIC_YEARS = [2569, 2568, 2567, 2566];

export function parseAcademicPeriod(params: PeriodSearchParams): AcademicPeriod {
  const year = typeof params.year === "string" && /^\d{4}$/.test(params.year) ? Number(params.year) : NaN;
  const term = ACADEMIC_TERMS.find(t => t.value === params.term)?.value;
  return { year: year >= 2400 && year <= 3000 ? year : DEFAULT_ACADEMIC_PERIOD.year, term: term ?? DEFAULT_ACADEMIC_PERIOD.term };
}
export function academicPeriodFromQuery(params: Pick<URLSearchParams, "getAll">) {
  const read = (key: string) => { const values = params.getAll(key); return values.length === 1 ? values[0] : values; };
  return parseAcademicPeriod({ year: read("year"), term: read("term") });
}
export function academicPeriodKey(period: AcademicPeriod) { return `${period.year}.${period.term}`; }
export function academicPeriodLabel(period: AcademicPeriod) {
  return `${ACADEMIC_TERMS.find(t => t.value === period.term)!.label} · ปีการศึกษา ${period.year}`;
}
export function matchesAcademicPeriod(year: number | string, term: string, period: AcademicPeriod) {
  return Number(year) === period.year && (term === period.term || ACADEMIC_TERMS.find(t => t.value === period.term)?.source === term);
}
export function withAcademicPeriod(href: string, period: AcademicPeriod) {
  const url = new URL(href, "https://nextlink.invalid");
  if (academicPeriodKey(period) === academicPeriodKey(DEFAULT_ACADEMIC_PERIOD)) {
    url.searchParams.delete("year"); url.searchParams.delete("term");
  } else {
    url.searchParams.set("year", String(period.year)); url.searchParams.set("term", period.term);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
export function periodStorageKey(base: string, period: AcademicPeriod) {
  // Existing edits belong to the original demo cohort only.
  return academicPeriodKey(period) === academicPeriodKey(DEFAULT_ACADEMIC_PERIOD) ? base : `${base}.${academicPeriodKey(period)}`;
}
