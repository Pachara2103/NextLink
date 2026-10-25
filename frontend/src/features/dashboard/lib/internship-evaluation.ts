import survey2567 from "../data/internship-exit-survey-2567.json";

/**
 * Student exit-survey results for the ฝึกงาน › ผลการประเมิน tab.
 *
 * Academic year 2567 comes from the example workbook (ผลการประเมิน_example.xlsx,
 * sheet "ตอบ Exit Survey ของนิสิต"), with names, e-mails and student IDs removed
 * at import. Other years are derived from it deterministically so the history
 * views have something to show; they are labelled as synthetic in the UI.
 */

export type SurveyResponse = {
  /** Company index into `companies`. */
  c: number;
  /** Satisfaction 1–5: mentor technical, mentor soft skill, welfare, workload, job fit, overall. */
  s: (number | null)[];
  /** Self-rated 1–5: technical before/after, soft before/after, confidence before/after. */
  g: (number | null)[];
  /** Relative share of time per work type (same order as WORK_TYPES). */
  w: number[];
  /** Benefits: allowance, accommodation, shuttle, lunch (1 yes, 0 no, null unknown). */
  b: (number | null)[];
  /** Allowance per day in baht, when any. */
  a: number | null;
  /** Internship length in days. */
  d: number | null;
};

export const DIMENSIONS = [
  { key: "mentorTech", label: "พี่เลี้ยงดูแลด้าน Technical", short: "พี่เลี้ยง Tech" },
  { key: "mentorSoft", label: "พี่เลี้ยงดูแลด้าน Soft Skill", short: "พี่เลี้ยง Soft" },
  { key: "welfare", label: "การดูแลด้านสวัสดิการ", short: "สวัสดิการ" },
  { key: "workload", label: "ปริมาณงานที่ได้รับ", short: "ปริมาณงาน" },
  { key: "jobFit", label: "งานตรงกับที่สนใจ", short: "งานตรงความสนใจ" },
  { key: "overall", label: "ความพึงพอใจโดยรวมต่อบริษัท", short: "โดยรวม" },
] as const;
export const OVERALL = 5;
export const GROWTH = [
  { label: "Technical Skill", before: 0, after: 1 },
  { label: "Soft Skill", before: 2, after: 3 },
  { label: "ความมั่นใจในการทำงาน", before: 4, after: 5 },
] as const;
export const WORK_TYPES = ["Software Dev", "AI / Data", "Hardware / IoT", "Network / Cloud", "Design / UX", "Management / Planning", "ช่วงว่างไม่มีงาน", "อื่น ๆ"];
export const BENEFITS = ["เบี้ยเลี้ยง", "ที่พัก", "รถรับส่ง", "อาหารกลางวัน"];

export const FILE_YEAR = survey2567.academicYear;
export const EVALUATION_YEARS = [2565, 2566, 2567, 2568, 2569];
export const COMPANIES: string[] = survey2567.companies;
const BASE = survey2567.responses as SurveyResponse[];

export type EvaluationYear = { year: number; synthetic: boolean; responses: SurveyResponse[] };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clampScore = (v: number) => Math.min(5, Math.max(1, Math.round(v)));

const cache = new Map<number, EvaluationYear>();
export function evaluationYear(year: number): EvaluationYear | null {
  if (!EVALUATION_YEARS.includes(year)) return null;
  const hit = cache.get(year);
  if (hit) return hit;
  if (year === FILE_YEAR) { const real = { year, synthetic: false, responses: BASE }; cache.set(year, real); return real; }
  const random = mulberry32(year * 104729);
  const distance = year - FILE_YEAR;
  // Each company drifts a little per year; a few did not take interns that year.
  const companyBias = COMPANIES.map(() => (random() - 0.5) * 1.1 + distance * 0.04);
  const companyOpen = COMPANIES.map(() => random() > 0.12);
  const keep = Math.min(0.97, 0.86 + 0.035 * distance);
  const responses = BASE.filter(r => companyOpen[r.c] && random() < keep).map(r => ({
    ...r,
    s: r.s.map(v => v === null ? null : clampScore(v + companyBias[r.c] + (random() < 0.35 ? (random() < 0.5 ? -1 : 1) : 0))),
    g: r.g.map(v => v === null ? null : clampScore(v + (random() < 0.25 ? (random() < 0.5 ? -1 : 1) : 0))),
  }));
  const result = { year, synthetic: true, responses };
  cache.set(year, result);
  return result;
}

const mean = (values: (number | null)[]) => {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
};
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export type EvaluationSummary = {
  responses: number;
  dimensions: (number | null)[];
  overall: number | null;
  /** Count of overall answers 1..5 (index 0 = score 1). */
  distribution: number[];
  satisfiedPct: number | null;
  benefits: { yes: number; known: number }[];
  allowanceMedian: number | null;
  growth: { before: number | null; after: number | null }[];
  work: number[];
};

export function summarize(rows: SurveyResponse[]): EvaluationSummary {
  const dimensions = DIMENSIONS.map((_, i) => mean(rows.map(r => r.s[i])));
  const distribution = [1, 2, 3, 4, 5].map(score => rows.filter(r => r.s[OVERALL] === score).length);
  const answered = distribution.reduce((s, n) => s + n, 0);
  const workTotals = WORK_TYPES.map((_, i) => rows.reduce((s, r) => s + (r.w[i] ?? 0), 0));
  const workSum = workTotals.reduce((s, v) => s + v, 0) || 1;
  return {
    responses: rows.length,
    dimensions,
    overall: dimensions[OVERALL],
    distribution,
    satisfiedPct: answered ? Math.round((distribution[3] + distribution[4]) / answered * 100) : null,
    benefits: BENEFITS.map((_, i) => ({ yes: rows.filter(r => r.b[i] === 1).length, known: rows.filter(r => r.b[i] !== null).length })),
    allowanceMedian: median(rows.flatMap(r => r.a ? [r.a] : [])),
    growth: GROWTH.map(g => ({ before: mean(rows.map(r => r.g[g.before])), after: mean(rows.map(r => r.g[g.after])) })),
    work: workTotals.map(v => v / workSum),
  };
}

export type CompanyEvaluation = { index: number; name: string; summary: EvaluationSummary };
export function byCompany(rows: SurveyResponse[]): CompanyEvaluation[] {
  const groups = new Map<number, SurveyResponse[]>();
  for (const r of rows) groups.set(r.c, [...(groups.get(r.c) ?? []), r]);
  return [...groups].map(([index, list]) => ({ index, name: COMPANIES[index], summary: summarize(list) }));
}

/** Overall summary for each year up to `year`, optionally for one company. */
export function yearlyTrend(year: number, company: number | null) {
  return EVALUATION_YEARS.filter(y => y <= year).map(y => {
    const data = evaluationYear(y)!;
    const rows = company === null ? data.responses : data.responses.filter(r => r.c === company);
    return { year: y, synthetic: data.synthetic, summary: summarize(rows) };
  });
}

/** Strip the legal suffix so long Thai company names fit a chart label. */
export function shortCompany(name: string) {
  return name.replace(/^บริษัท\s*/, "").replace(/\s*(จำกัด|\(มหาชน\)|จำกัด \(มหาชน\))\s*/g, " ").replace(/\s+/g, " ").trim();
}
