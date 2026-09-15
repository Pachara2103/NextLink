/**
 * Display formatting shared by the three dashboards.
 *
 * These reached three identical copies, and they change for one reason — how
 * this product renders numbers and dates to a Thai reader — so they belong in
 * one place. Domain-specific mapping (which status counts as which tone, say)
 * stays with each dashboard.
 */

const numberFormatter = new Intl.NumberFormat("th-TH");
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timezone: string, withTime: boolean) {
  const key = `${timezone}:${withTime}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("th-TH", {
      timeZone: timezone,
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" as const } : {}),
    });
    // Keep the cache bounded if future callers supply arbitrary time zones.
    if (dateFormatters.size >= 32) dateFormatters.clear();
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(value: number | null) {
  if (value === null) return "ยังไม่ทราบ";
  return numberFormatter.format(value);
}

export function formatUpdated(value: string | null, timezone: string) {
  if (value === null) return "ยังไม่มีข้อมูลอัปเดต";
  return dateFormatter(timezone, true).format(new Date(value));
}

export function formatDate(value: string | null, timezone: string) {
  if (!value) return "ยังไม่กำหนด";
  return dateFormatter(timezone, false).format(new Date(`${value}T00:00:00+07:00`));
}

/**
 * Falls back to a placeholder for blank or missing source values.
 *
 * Pass a specific placeholder where two independent fields sit next to each
 * other — a generic one repeated twice reads as the same value shown twice.
 */
export function display(value: string | null | undefined, placeholder = "ยังไม่ระบุ") {
  return value?.trim() || placeholder;
}

/** Trims a form value, treating an empty string as "not provided". */
export function optionalValue(value: string) {
  return value.trim() || null;
}
