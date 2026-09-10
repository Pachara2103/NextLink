import {
  EMPLOYEE_FIELDS,
  JOB_TITLE_LABELS,
  JOB_TITLE_PRESETS,
  MESSAGES,
  NO_DATA,
  type EmployeeDraft,
  type JobTitlePreset,
} from "@/lib/constants";
import type {
  ContactStatus,
  Employee,
  EmployeeUpdate,
  GroupLine,
} from "@/types";

/** Tiny classnames joiner. Drops falsy entries. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * A value counts as missing when it is null, blank, or still carries the
 * NO_DATA sentinel from the extraction pipeline.
 */
export function isBlank(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === NO_DATA;
}

/**
 * TH (EN) when both exist, otherwise whichever one is present. Takes the two
 * name fields rather than a GroupLine, so the company directory rows can use it
 * too — both shapes get them from schemas/company.py::CompanyName.
 */
export function companyLabel(company: {
  companyTh?: string | null;
  companyEn?: string | null;
}): {
  primary: string | null;
  secondary: string | null;
} {
  const th = isBlank(company.companyTh) ? null : company.companyTh!;
  const en = isBlank(company.companyEn) ? null : company.companyEn!;
  if (th && en) return { primary: th, secondary: en };
  return { primary: th ?? en, secondary: null };
}

/** line_groups.display_name is nullable, so every render needs a fallback. */
export function groupLabel(group: GroupLine): string {
  return isBlank(group.displayName)
    ? MESSAGES.noGroupName
    : group.displayName!;
}

export function employeeName(person: Employee): {
  primary: string;
  secondary: string | null;
} {
  const th = isBlank(person.nameTh) ? null : person.nameTh!;
  const en = isBlank(person.nameEn) ? null : person.nameEn!;
  return {
    primary: th ?? en ?? "ไม่ระบุชื่อ",
    secondary: th && en ? en : null,
  };
}

/** Two-character avatar seed taken from the display name. */
export function initials(person: Employee): string {
  const { primary } = employeeName(person);
  const words = primary.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words[0].charAt(0) + words[1].charAt(0);
  return primary.slice(0, 2);
}

/** How many of the five optional fields are still empty. */
export function missingFieldCount(person: Employee): number {
  return EMPLOYEE_FIELDS.filter(
    (field) => field !== "nameTh" && field !== "nameEn",
  ).filter((field) => isBlank(person[field])).length;
}

const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** Buddhist-era short date, optionally with a HH:mm suffix. */
export function formatThaiDate(
  iso: string | null | undefined,
  withTime = false,
): string {
  if (!iso) return "ไม่มีข้อมูลเวลา";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ไม่มีข้อมูลเวลา";
  const be = String((d.getFullYear() + 543) % 100).padStart(2, "0");
  const date = d.getDate() + " " + THAI_MONTHS[d.getMonth()] + " " + be;
  if (!withTime) return date;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return date + " · " + hh + ":" + mm;
}

/** Prefills a form, turning nulls and the sentinel into empty strings. */
export function toDraft(person: Employee): EmployeeDraft {
  const draft = {} as EmployeeDraft;
  for (const field of EMPLOYEE_FIELDS) {
    const value = person[field];
    draft[field] = isBlank(value) ? "" : (value as string);
  }
  return draft;
}

/**
 * Trims every field and collapses empty strings back to null, which is what the
 * write body wants. A relevant left at the sentinel becomes null.
 *
 * The two fields that are not editable text — which company the person belongs
 * to, and what state they are in — are passed in rather than read off the
 * draft: `employees.company_id` is NOT NULL and the status CHECK rejects
 * anything outside its five values, so neither can be left to a form input
 * that might be blank.
 *
 * Driven by EMPLOYEE_FIELDS rather than a written-out object, so the field
 * names live in exactly one place; constants.ts checks those names against
 * EmployeeUpdate at compile time, which is what makes the cast safe.
 */
export function fromDraft(
  draft: EmployeeDraft,
  meta: { companyId: number; status: ContactStatus },
): EmployeeUpdate {
  const out: Record<string, string | number | null> = {};
  for (const field of EMPLOYEE_FIELDS) {
    const value = (draft[field] ?? "").trim();
    out[field] = value === "" || value === NO_DATA ? null : value;
  }
  out.companyId = meta.companyId;
  out.status = meta.status;
  return out as EmployeeUpdate;
}

/**
 * Whether a stored job title is one of the three the select offers. Drives
 * which of the field's two modes a form opens in: a title the system knows
 * opens on the dropdown, anything else opens on the text box holding it.
 */
export function isJobTitlePreset(
  value: string | null | undefined,
): value is JobTitlePreset {
  return (
    value !== null &&
    value !== undefined &&
    (JOB_TITLE_PRESETS as string[]).includes(value)
  );
}

/** The label a job title reads as: Thai for the three presets, verbatim otherwise. */
export function jobTitleLabel(value: string | null | undefined): string | null {
  if (isBlank(value)) return null;
  const title = value!.trim();
  return isJobTitlePreset(title) ? JOB_TITLE_LABELS[title] : title;
}

/** How many tag hues `globals.css` declares. See the TAG HUES block there. */
const TAG_TONES = 6;

/**
 * Picks one of those hues for a string, the same one every time.
 *
 * A plain FNV-1a over the trimmed, lower-cased text: two cards showing the
 * same job title always land on the same colour, and two different titles
 * almost always land on different ones. A collision only costs a repeated
 * colour, never a wrong one, which is why nothing here tries to avoid them.
 */
export function tagTone(value: string): number {
  let hash = 0x811c9dc5;
  const key = value.trim().toLowerCase();
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    // Math.imul keeps the multiply in 32-bit, which plain * does not.
    hash = Math.imul(hash, 0x01000193);
  }
  return (Math.abs(hash) % TAG_TONES) + 1;
}

/** The one hard validation rule: at least one of the two name fields. */
export function hasEmployeeName(
  draft: Pick<EmployeeDraft, "nameTh" | "nameEn">,
): boolean {
  return draft.nameTh.trim() !== "" || draft.nameEn.trim() !== "";
}

export function hasCompanyName(input: {
  companyTh: string;
  companyEn: string;
}): boolean {
  return input.companyTh.trim() !== "" || input.companyEn.trim() !== "";
}
