import type { DashboardCourse, InternshipCompany, MouCompany } from "./types";
import { isRecord } from "./local-dataset";
import { WORKFLOW_VALUES } from "./filter-values";

type Check = (value: unknown) => boolean;
type Shape = Check | { [key: string]: Shape } | readonly [Shape];
const text: Check = v => typeof v === "string" && v.length <= 20000;
const nonempty: Check = v => text(v) && (v as string).trim().length > 0;
const count: Check = v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const nullable = (check: Check): Check => v => v === null || check(v);
const oneOf = (values: readonly string[]): Check => v => typeof v === "string" && values.includes(v);
const raw: Check = v => isRecord(v) && Object.values(v).every(x => x === null || text(x) || (typeof x === "number" && Number.isFinite(x)));
const url: Check = v => nullable(text)(v) && (v === null || /^https?:\/\//i.test(v as string) || /^\/(?!\/)/.test(v as string));

const date: Check = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const timezone: Check = v => { try { return typeof v === "string" && v.length <= 100 && Boolean(new Intl.DateTimeFormat("en", { timeZone: v })); } catch { return false; } };
const optional = (check: Check): Check => v => v === undefined || check(v);

function matches(value: unknown, shape: Shape): boolean {
  if (typeof shape === "function") return shape(value);
  if (Array.isArray(shape)) return Array.isArray(value) && value.length <= 10000 && value.every(v => matches(v, shape[0]));
  return isRecord(value) && Object.entries(shape).every(([key, check]) => matches(value[key], check));
}
const course: Shape = {
  id: nonempty, academicYear: count, term: text, courseCode: text, title: nonempty,
  category: nonempty, provider: text, section: text, instructor: text,
  coordinator: v => v === null || matches(v, { name: text, email: nullable(text), lineId: nullable(text) }),
  deliveryMode: oneOf(["ON_SITE", "HYBRID", "ONLINE"]),
  sessions: [{ id: optional(nonempty), dayOfWeek: oneOf(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]), startTime: text, endTime: text, location: text, onlineUrl: optional(url), validFrom: optional(nullable(date)), validUntil: optional(nullable(date)), timezone: optional(timezone) }],
  weeks: count, capacity: nullable(count), enrolled: count,
  status: { course: nonempty, documents: nonempty, invitation: nonempty, mcv: nonempty },
  feedbackAverage: nullable(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5),
  cancellationsOrReschedules: count, notes: nullable(text),
  workflow: [{ key: nonempty, label: text, status: oneOf(WORKFLOW_VALUES), rawStatus: nullable(text), detail: nullable(text), referenceUrl: url }],
  documents: [{ type: text, filename: text, status: text, externalUrl: url }],
  mcvJoinCode: nullable(text),
  source: { system: nullable(text), spreadsheetId: nullable(text), sheetName: nullable(text), rowNumber: nullable(count), sourceKey: nullable(text) },
};
const internship: Shape = {
  id: nonempty, rowNumber: count, name: nonempty, shortName: nonempty, industry: nonempty,
  mouStatus: nonempty, coordinator: nullable(text), note: nullable(text), raw,
  positions: [{ id: optional(nonempty), name: nonempty, declaredIntake: count, accepted: count }],
};
const mou: Shape = {
  id: nonempty, rowNumber: count, companyThai: nonempty, companyEnglish: nonempty,
  shortNames: [text], documentStatus: nonempty, revised: oneOf(["Y", "N"]),
  template: nullable(text), revisionRequest: nullable(text), revisionSentDate: nullable(text),
  legalReviewResult: nullable(text), reviewStatus: oneOf(["pending", "in_progress", "approved", "needs_changes", "not_required"]),
  authorizationRequest: nullable(text), authorizationSentDate: nullable(text), authorizationStatus: nullable(text),
  note: nullable(text), coordinator: nullable(text), raw,
};

export const isDashboardCourse = (v: unknown): v is DashboardCourse => matches(v, course);
export const isInternshipCompany = (v: unknown): v is InternshipCompany => matches(v, internship);
export const isMouCompany = (v: unknown): v is MouCompany => matches(v, mou);
