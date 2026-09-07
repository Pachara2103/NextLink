import {
  COORDINATOR_FIELDS,
  MESSAGES,
  NO_DATA,
  type CoordinatorDraft,
} from "@/lib/constants";
import type { Coordinator, CoordinatorUpdate, GroupLine } from "@/types";

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

export function coordinatorName(person: Coordinator): {
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
export function initials(person: Coordinator): string {
  const { primary } = coordinatorName(person);
  const words = primary.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words[0].charAt(0) + words[1].charAt(0);
  return primary.slice(0, 2);
}

/** How many of the five optional fields are still empty. */
export function missingFieldCount(person: Coordinator): number {
  return COORDINATOR_FIELDS.filter(
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
export function toDraft(person: Coordinator): CoordinatorDraft {
  const draft = {} as CoordinatorDraft;
  for (const field of COORDINATOR_FIELDS) {
    const value = person[field];
    draft[field] = isBlank(value) ? "" : (value as string);
  }
  return draft;
}

/**
 * Trims every field and collapses empty strings back to null, which is what the
 * PUT body wants. A relevant left at the sentinel becomes null.
 *
 * Driven by COORDINATOR_FIELDS rather than a written-out object, so the field
 * names live in exactly one place; constants.ts checks those names against
 * CoordinatorUpdate at compile time, which is what makes the cast safe.
 */
export function fromDraft(draft: CoordinatorDraft): CoordinatorUpdate {
  const out: Record<string, string | null> = {};
  for (const field of COORDINATOR_FIELDS) {
    const value = (draft[field] ?? "").trim();
    out[field] = value === "" || value === NO_DATA ? null : value;
  }
  return out as CoordinatorUpdate;
}

/** The one hard validation rule: at least one of the two name fields. */
export function hasCoordinatorName(
  draft: Pick<CoordinatorDraft, "nameTh" | "nameEn">,
): boolean {
  return draft.nameTh.trim() !== "" || draft.nameEn.trim() !== "";
}

export function hasCompanyName(input: {
  companyTh: string;
  companyEn: string;
}): boolean {
  return input.companyTh.trim() !== "" || input.companyEn.trim() !== "";
}
