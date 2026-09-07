/**
 * Labels, tones and filtering for the note panel.
 *
 * The enum values are the ones `schemas/enums.py` accepts — nothing here
 * invents a value — and each carries the label and colour pair the design
 * (design/note.html) gives it, so a component never writes a tone string.
 */

import type { IconName } from "@/components/icons";
import type { Note, NoteSource, NoteType, Sentiment } from "@/types";

/** The types the console offers. The schema also has hr / instructor in reserve. */
export const NOTE_TYPES: { value: NoteType; label: string; icon: IconName }[] = [
  { value: "mou", label: "MOU", icon: "briefcase" },
  { value: "elective", label: "วิชาเลือก", icon: "book" },
  { value: "internship", label: "ฝึกงาน", icon: "tag" },
  { value: "coop", label: "สหกิจ", icon: "building" },
  { value: "friday", label: "บรรยาย", icon: "message" },
  { value: "coordinator", label: "ผู้ประสานงาน", icon: "user" },
];

/** Types that describe one person — services/note.py demands a personId for these. */
export const PERSON_NOTE_TYPES: NoteType[] = ["coordinator", "hr", "instructor"];

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

export const TERM_LABEL: Record<number, string> = {
  1: "ภาคเรียนที่ 1",
  2: "ภาคเรียนที่ 2",
  3: "ภาคฤดูร้อน (3)",
};

/**
 * Ported from utils/academic_year.py -> get_current_academic_term().
 * ส.ค.–ธ.ค. = term 1 of this year / ม.ค.–พ.ค. = term 2 of last year /
 * มิ.ย.–ก.ค. = term 3 of last year.
 */
export function getCurrentAcademicTerm(now = new Date()): {
  academicYear: number;
  term: 1 | 2 | 3;
} {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return { academicYear: year, term: 1 };
  if (month <= 5) return { academicYear: year - 1, term: 2 };
  return { academicYear: year - 1, term: 3 };
}

/** Six academic years back through the current one, newest first. */
export function academicYearOptions(current: number): number[] {
  return Array.from({ length: 6 }, (_, i) => current - i);
}

// --- filtering -----------------------------------------------------------

export interface NoteFilters {
  academicYear: string;
  term: string;
  sentiment: string;
  source: string;
}

/** Only the two the per-company bar offers; year and term are set page-wide. */
export const COMPANY_FILTER_FIELDS = ["sentiment", "source"] as const;

export function defaultFilters(): NoteFilters {
  const current = getCurrentAcademicTerm();
  return {
    academicYear: String(current.academicYear),
    term: String(current.term),
    sentiment: "all",
    source: "all",
  };
}

export function emptyFilters(): NoteFilters {
  return { academicYear: "all", term: "all", sentiment: "all", source: "all" };
}

/** Covers companyTh · companyEn · aliases · personName · personNickname. */
/**
 * Case-insensitive substring match over everything a note can be looked up by:
 * the company's Thai and English names, its short names, the coordinator, and
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
    note.personName,
    note.personNickname,
    ...(note.aliases ?? []),
  ].some((value) => (value ?? "").toLowerCase().includes(needle));
}

export function matchesFilters(note: Note, filters: NoteFilters): boolean {
  if (
    filters.academicYear !== "all" &&
    String(note.academicYear) !== filters.academicYear
  ) {
    return false;
  }
  if (filters.term !== "all" && String(note.term) !== filters.term) return false;
  if (filters.sentiment !== "all" && note.sentiment !== filters.sentiment) {
    return false;
  }
  if (filters.source !== "all" && note.source !== filters.source) return false;
  return true;
}

/** Newest first: academicYear, then term, then updatedAt. */
export function sortNotes(notes: Note[]): Note[] {
  const at = (iso: string | null | undefined) =>
    iso ? new Date(iso).getTime() : 0;
  return [...notes].sort(
    (a, b) =>
      (b.academicYear ?? 0) - (a.academicYear ?? 0) ||
      (b.term ?? 0) - (a.term ?? 0) ||
      at(b.updatedAt) - at(a.updatedAt),
  );
}

/** "คุณสมชาย ใจดี (พี่ชาย)" from the names the API already joined in. */
export function notePersonLabel(note: Note): string | null {
  const name = note.personName?.trim();
  if (!name) return null;
  const nickname = note.personNickname?.trim();
  return nickname ? `${name} (${nickname})` : name;
}
