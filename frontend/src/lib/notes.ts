/**
 * Labels, tones and filtering for the note panel.
 *
 * The enum values are the ones `schemas/enums.py` accepts — nothing here
 * invents a value — and each carries the label and colour pair the design
 * (design/note.html) gives it, so a component never writes a tone string.
 */

import type { IconName } from "@/components/icons";
import type { Note, NoteSource, NoteType, Sentiment } from "@/types";

/** Every value `NoteType` accepts, in the order the form offers them. */
export const NOTE_TYPES: { value: NoteType; label: string; icon: IconName }[] = [
  { value: "mou", label: "MOU", icon: "briefcase" },
  { value: "elective", label: "วิชาเลือก", icon: "book" },
  { value: "internship", label: "ฝึกงาน", icon: "tag" },
  { value: "coop", label: "สหกิจ", icon: "building" },
  { value: "friday", label: "บรรยาย", icon: "message" },
  { value: "person", label: "บุคคล", icon: "user" },
];

/**
 * The types that describe one person, and so carry an `employeeId`.
 *
 * There is exactly one now — `person`. It used to be three (employee / hr /
 * instructor), which is why this stayed a list: `ck_notes_employee_binding`
 * is what actually decides, and keeping the question behind one helper means
 * a second such type only has to be added here.
 */
export const PERSON_NOTE_TYPES: NoteType[] = ["person"];

export function isPersonNote(type: NoteType): boolean {
  return PERSON_NOTE_TYPES.includes(type);
}

const FALLBACK_TYPE = { label: "อื่น ๆ", icon: "note" as IconName };

export function noteTypeMeta(type: NoteType) {
  return NOTE_TYPES.find((t) => t.value === type) ?? FALLBACK_TYPE;
}

export interface SentimentMeta {
  value: Sentiment;
  label: string;
  dot: string;
  badge: string;
  on: string;
  bar: string;
}

export const SENTIMENTS: SentimentMeta[] = [
  {
    value: "positive",
    label: "ประทับใจ",
    dot: "bg-ok",
    badge: "border-ok-line bg-ok-soft text-ok",
    on: "border-ok-line bg-ok-strong text-ok",
    bar: "bg-ok",
  },
  {
    value: "neutral",
    label: "ทั่วไป",
    dot: "bg-text-4",
    badge: "border-line bg-surface-2 text-text-3",
    on: "border-line bg-surface-2 text-text",
    bar: "bg-text-4",
  },
  {
    value: "warning",
    label: "ข้อควรระวัง",
    dot: "bg-warn",
    badge: "border-warn-line bg-warn-soft text-warn",
    on: "border-warn-line bg-warn-strong text-warn",
    bar: "bg-warn",
  },
  {
    value: "negative",
    label: "มีปัญหา",
    dot: "bg-danger",
    badge: "border-danger-line bg-danger-soft text-danger",
    on: "border-danger-line bg-danger-strong text-danger",
    bar: "bg-danger",
  },
];

export const SENTIMENT: Record<Sentiment, SentimentMeta> = Object.fromEntries(
  SENTIMENTS.map((s) => [s.value, s]),
) as Record<Sentiment, SentimentMeta>;

export interface SourceMeta {
  value: NoteSource;
  label: string;
  short: string;
  icon: IconName;
  badge: string;
  on: string;
}

export const SOURCES: SourceMeta[] = [
  {
    value: "internal",
    label: "ฝั่งเรา (มหาลัย)",
    short: "ฝั่งเรา",
    icon: "home",
    badge: "border-accent-line bg-accent-soft text-accent",
    on: "border-accent-line bg-accent-strong text-accent",
  },
  {
    value: "external",
    label: "ฝั่งเขา (บริษัท/บุคคล)",
    short: "ฝั่งบริษัท",
    icon: "building",
    badge: "border-accent-line bg-accent-soft text-accent",
    on: "border-accent-line bg-accent-strong text-accent",
  },
];

export const SOURCE: Record<NoteSource, SourceMeta> = Object.fromEntries(
  SOURCES.map((s) => [s.value, s]),
) as Record<NoteSource, SourceMeta>;

export const SEMESTER_LABEL: Record<number, string> = {
  1: "ภาคเรียนที่ 1",
  2: "ภาคเรียนที่ 2",
  3: "ภาคฤดูร้อน (3)",
};

/**
 * Ported from utils/year_semester.py -> get_current_year_semester().
 * ส.ค.–ธ.ค. = semester 1 of this year / ม.ค.–พ.ค. = semester 2 of last year /
 * มิ.ย.–ก.ค. = semester 3 of last year.
 */
export function getCurrentYearSemester(now = new Date()): {
  year: number;
  semester: 1 | 2 | 3;
} {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return { year, semester: 1 };
  if (month <= 5) return { year: year - 1, semester: 2 };
  return { year: year - 1, semester: 3 };
}

/** Six academic years back through the current one, newest first. */
export function yearOptions(current: number): number[] {
  return Array.from({ length: 6 }, (_, i) => current - i);
}

// --- filtering -----------------------------------------------------------

export interface NoteFilters {
  year: string;
  semester: string;
  sentiment: string;
  source: string;
}

/** Only the two the per-company bar offers; year and semester are set page-wide. */
export const COMPANY_FILTER_FIELDS = ["sentiment", "source"] as const;

export function defaultFilters(): NoteFilters {
  const current = getCurrentYearSemester();
  return {
    year: String(current.year),
    semester: String(current.semester),
    sentiment: "all",
    source: "all",
  };
}

export function emptyFilters(): NoteFilters {
  return { year: "all", semester: "all", sentiment: "all", source: "all" };
}

/** Covers companyTh · companyEn · aliases · personName · personNickname. */
/**
 * Case-insensitive substring match over everything a note can be looked up by:
 * the company's Thai and English names, its short names, the employee, and
 * the name of the LINE group the note came from.
 *
 * The group name is not on the note — it is joined in from `line_groups` — so
 * the caller passes it; the search covers the same fields as the groups page
 * either way.
 */
export function matchesSearch(
  note: Note,
  term: string,
  groupName?: string | null,
): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === "") return true;
  return [
    groupName,
    note.companyTh,
    note.companyEn,
    // The employee's own columns, joined in from `employees` by the API —
    // BasePersonName, so the same three names every other person shape has.
    note.nameTh,
    note.nameEn,
    note.nickname,
    ...(note.aliases ?? []),
  ].some((value) => (value ?? "").toLowerCase().includes(needle));
}

export function matchesFilters(note: Note, filters: NoteFilters): boolean {
  if (filters.year !== "all" && String(note.year) !== filters.year) {
    return false;
  }
  if (
    filters.semester !== "all" &&
    String(note.semester) !== filters.semester
  ) {
    return false;
  }
  if (filters.sentiment !== "all" && note.sentiment !== filters.sentiment) {
    return false;
  }
  if (filters.source !== "all" && note.source !== filters.source) return false;
  return true;
}

/** Newest first: year, then semester, then updatedAt. */
export function sortNotes(notes: Note[]): Note[] {
  const at = (iso: string | null | undefined) =>
    iso ? new Date(iso).getTime() : 0;
  return [...notes].sort(
    (a, b) =>
      (b.year ?? 0) - (a.year ?? 0) ||
      (b.semester ?? 0) - (a.semester ?? 0) ||
      at(b.updatedAt) - at(a.updatedAt),
  );
}

/**
 * "สมชาย ใจดี (ชาย)" from the names the API already joined in.
 *
 * Thai first, English as the fallback — the same precedence `employeeName`
 * uses on a card, so one person reads the same way wherever they appear.
 */
export function notePersonLabel(note: Note): string | null {
  const name = note.nameTh?.trim() || note.nameEn?.trim();
  if (!name) return null;
  const nickname = note.nickname?.trim();
  return nickname ? `${name} (${nickname})` : name;
}
