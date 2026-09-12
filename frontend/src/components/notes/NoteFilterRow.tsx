"use client";

import { SortSelect } from "@/components/ui/Field";
import {
  SENTIMENTS,
  SOURCES,
  getCurrentYearSemester,
  yearOptions,
  type NoteFilters,
} from "@/lib/notes";

type Field = keyof NoteFilters;

/**
 * One select per filter field, driven off a single options table so the
 * page-wide bar and the per-company bar cannot drift apart — they differ only
 * in which fields they pass.
 */
function optionsFor(field: Field): { value: string; label: string }[] {
  switch (field) {
    case "year": {
      const current = getCurrentYearSemester().year;
      return [
        { value: "all", label: "ทุกปีการศึกษา" },
        ...yearOptions(current).map((y) => ({
          value: String(y),
          label: `ปีการศึกษา ${y}`,
        })),
      ];
    }
    case "semester":
      return [
        { value: "all", label: "ทุกภาคเรียน" },
        { value: "1", label: "ภาคเรียนที่ 1" },
        { value: "2", label: "ภาคเรียนที่ 2" },
        { value: "3", label: "ภาคฤดูร้อน (3)" },
      ];
    case "sentiment":
      return [
        { value: "all", label: "ทุกระดับ" },
        ...SENTIMENTS.map((s) => ({ value: s.value, label: s.label })),
      ];
    case "source":
      return [
        { value: "all", label: "ทุกที่มา" },
        ...SOURCES.map((s) => ({ value: s.value, label: s.short })),
      ];
  }
}

const ARIA: Record<Field, string> = {
  year: "กรองตามปีการศึกษา",
  semester: "กรองตามภาคเรียน",
  sentiment: "กรองตามระดับของโน้ต",
  source: "กรองตามที่มาของเรื่อง",
};

export function NoteFilterRow({
  filters,
  fields,
  onChange,
}: {
  filters: NoteFilters;
  fields: readonly Field[];
  onChange: (next: NoteFilters) => void;
}) {
  return (
    <>
      {fields.map((field) => (
        <SortSelect
          key={field}
          label={ARIA[field]}
          value={filters[field]}
          options={optionsFor(field)}
          onChange={(event) =>
            onChange({ ...filters, [field]: event.target.value })
          }
        />
      ))}
    </>
  );
}
