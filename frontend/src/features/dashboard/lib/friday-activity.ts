import type { AcademicPeriod, AcademicTerm } from "./academic-period";

export const FRIDAY_STATUS = { scheduled: "รอจัดกิจกรรม", completed: "จัดแล้ว", cancelled: "ยกเลิก" } as const;
export const FRIDAY_FORMAT = { talk: "บรรยาย", workshop: "Workshop", visit: "ดูงานนอกสถานที่", hackathon: "Hackathon", other: "อื่น ๆ", unknown: "ยังไม่ระบุ" } as const;
export const STUDENT_DIMENSIONS = [
  { key: "content", label: "เนื้อหาและประโยชน์ที่ได้รับ" },
  { key: "speaker", label: "การถ่ายทอดของวิทยากร" },
  { key: "application", label: "ความรู้และทักษะที่นำไปใช้ได้" },
  { key: "overall", label: "ความพึงพอใจโดยรวม" },
] as const;
export type RatingKey = typeof STUDENT_DIMENSIONS[number]["key"];
export type StudentEvaluation = {
  id: string;
  ratings: Record<RatingKey, number | null>;
  suggestedTopic: string;
  suggestion: string;
};
export type CompanyEvaluation = { submittedAt?: string | null; id: string; experience: string; suggestedTopic: string; improvement: string };
export type FridayActivity = {
  id: string;
  academicYear: number;
  term: AcademicTerm;
  companyId: string;
  companyName: string;
  sequence: number;
  title: string;
  description: string;
  domain: string;
  format: keyof typeof FRIDAY_FORMAT;
  rawFormat?: string;
  contactIds?: string[];
  date: string | null;
  startTime: string;
  endTime: string;
  location: string;
  status: keyof typeof FRIDAY_STATUS;
  capacity: number | null;
  booked: number | null;
  attended: number | null;
  // The source sheet's reported average is not a response-derived average.
  reportedScore: number | null;
  publicationUrl: string;
  notes: string;
  studentEvaluations: StudentEvaluation[];
  companyEvaluations: CompanyEvaluation[];
};
export const fridayStorageKey = "nextlink.friday.activities.v1";
export const fridayYears = [2569, 2568, 2567, 2566];

export function selectFridayPeriod(items: FridayActivity[], period: AcademicPeriod) {
  return items.filter(item => item.academicYear === period.year && item.term === period.term);
}

export function fridayFollowUps(item: FridayActivity): string[] {
  if (item.status === "cancelled") return [];
  if (item.status === "scheduled") return !item.date || !item.startTime || !item.endTime || !item.location.trim() ? ["ยืนยันวัน เวลา และสถานที่"] : [];
  return [
    ...(item.attended === null ? ["บันทึกจำนวนมาจริง"] : []),
    ...(item.studentEvaluations.length === 0 ? ["ติดตามผลประเมินนิสิต"] : []),
    ...(item.companyEvaluations.length === 0 ? ["ติดตามผลประเมินบริษัท"] : []),
  ];
}

export function studentRatingSummary(items: FridayActivity[]) {
  const responses = items.filter(item => item.status === "completed").flatMap(item => item.studentEvaluations);
  return STUDENT_DIMENSIONS.map(dimension => {
    const ratings = responses.flatMap(response => response.ratings[dimension.key] === null ? [] : [response.ratings[dimension.key] as number]);
    return { ...dimension, count: ratings.length, mean: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null };
  });
}

export function fridaySummary(items: FridayActivity[]) {
  const completed = items.filter(item => item.status === "completed");
  const attendance = completed.flatMap(item => item.attended === null ? [] : [item.attended]);
  return {
    total: items.length,
    completed: completed.length,
    companies: new Set(completed.map(item => item.companyId)).size,
    attended: attendance.length ? attendance.reduce((a, b) => a + b, 0) : null,
    unknownAttendance: completed.length - attendance.length,
    studentResponses: completed.reduce((sum, item) => sum + item.studentEvaluations.length, 0),
    companyResponses: completed.reduce((sum, item) => sum + item.companyEvaluations.length, 0),
    ratings: studentRatingSummary(completed),
  };
}

export function fridayCompanySummary(items: FridayActivity[]) {
  const companies = new Map<string, { id: string; name: string; completed: number; scheduled: number; cancelled: number }>();
  for (const item of items) {
    const company = companies.get(item.companyId) ?? { id: item.companyId, name: item.companyName, completed: 0, scheduled: 0, cancelled: 0 };
    company[item.status] += 1;
    companies.set(item.companyId, company);
  }
  return [...companies.values()].sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, "th"));
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 20000;
const nonempty = (value: unknown): value is string => text(value) && value.trim().length > 0;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const optionalCount = (value: unknown) => value === null || count(value);
const score = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5);
const time = (value: unknown) => value === "" || (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
const date = (value: unknown) => value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
export function isFridayPublicationUrl(value: unknown): value is string {
  if (value === "") return true;
  if (!text(value)) return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
const uniqueIds = (values: unknown[]): boolean => values.every(value => record(value) && nonempty(value.id)) && new Set(values.map(value => (value as { id: string }).id)).size === values.length;

export function isFridayActivity(value: unknown): value is FridayActivity {
  if (!record(value)) return false;
  return ["id", "companyId", "companyName", "title", "domain"].every(key => nonempty(value[key]))
    && ["description", "location", "notes"].every(key => text(value[key]))
    && count(value.academicYear) && value.academicYear >= 2400 && value.academicYear <= 3000
    && ["1", "2", "summer"].includes(value.term as string)
    && count(value.sequence) && value.sequence > 0
    && Object.hasOwn(FRIDAY_STATUS, value.status as string) && Object.hasOwn(FRIDAY_FORMAT, value.format as string)
    && (value.rawFormat === undefined || text(value.rawFormat))
    && (value.contactIds === undefined || (Array.isArray(value.contactIds) && value.contactIds.every(nonempty) && new Set(value.contactIds).size === value.contactIds.length))
    && date(value.date) && time(value.startTime) && time(value.endTime)
    && (!(value.startTime && value.endTime) || String(value.endTime) > String(value.startTime))
    && ["capacity", "booked", "attended"].every(key => optionalCount(value[key]))
    && score(value.reportedScore) && isFridayPublicationUrl(value.publicationUrl)
    && Array.isArray(value.studentEvaluations) && value.studentEvaluations.length <= 10000 && uniqueIds(value.studentEvaluations)
    && value.studentEvaluations.every(response => record(response) && record(response.ratings)
      && STUDENT_DIMENSIONS.every(({ key }) => score((response.ratings as Record<string, unknown>)[key]) && ((response.ratings as Record<string, unknown>)[key] === null || Number.isInteger((response.ratings as Record<string, unknown>)[key])))
      && text(response.suggestedTopic) && text(response.suggestion))
    && Array.isArray(value.companyEvaluations) && value.companyEvaluations.length <= 10000 && uniqueIds(value.companyEvaluations)
    && value.companyEvaluations.every(response => record(response) && (response.submittedAt === undefined || response.submittedAt === null || (text(response.submittedAt) && Number.isFinite(Date.parse(response.submittedAt)))) && ["experience", "suggestedTopic", "improvement"].every(key => text(response[key])));
}

export type FridayDraft = Pick<FridayActivity, "title" | "description" | "domain" | "format" | "contactIds" | "date" | "startTime" | "endTime" | "location" | "status" | "capacity" | "booked" | "attended" | "publicationUrl" | "notes">;
export function toFridayDraft(item: FridayActivity): FridayDraft {
  const { title, description, domain, format, contactIds, date, startTime, endTime, location, status, capacity, booked, attended, publicationUrl, notes } = item;
  return { title, description, domain, format, contactIds, date, startTime, endTime, location, status, capacity, booked, attended, publicationUrl, notes };
}
export function applyFridayDraft(item: FridayActivity, draft: FridayDraft): FridayActivity {
  // Whitelist editable fields; never replace company, period, source score or responses.
  const safeDraft = toFridayDraft(draft as FridayActivity);
  const next = { ...item, ...safeDraft, title: draft.title.trim(), domain: draft.domain.trim(), publicationUrl: draft.publicationUrl.trim() };
  if (!isFridayActivity(next)) throw new Error("ตรวจสอบชื่อกิจกรรม ศาสตร์ วันเวลา จำนวนคน และลิงก์ http/https ให้ถูกต้อง");
  return next;
}

export function formatFridayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T12:00:00+07:00`)) : "ยังไม่ระบุวัน";
}
export const fridayCount = (value: number | null) => value === null ? "ยังไม่มีข้อมูล" : new Intl.NumberFormat("th-TH").format(value);
export const fridayScore = (value: number | null) => value === null ? "ยังไม่มีข้อมูล" : value.toFixed(2);

/** Normalize source labels without losing their original spelling. */
export function normalizeFridayFormat(raw: string): { format: FridayActivity['format']; rawFormat: string } {
  const label = raw.trim().toLowerCase();
  const known: Record<string, FridayActivity['format']> = { workshop: 'workshop', 'talk seminar': 'talk', lecture: 'talk', 'company visit': 'visit', hackathon: 'hackathon', hackatron: 'hackathon' };
  return { format: !label ? 'unknown' : known[label] ?? 'other', rawFormat: raw };
}
