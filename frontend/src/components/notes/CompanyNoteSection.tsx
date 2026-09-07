"use client";

import { NoteCard } from "@/components/notes/NoteCard";
import { GroupAvatar } from "@/components/groups/GroupAvatar";
import { AliasTags, ContactTags } from "@/components/groups/GroupIdentity";
import { Icon } from "@/components/icons";
import { CountChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/Button";
import {
  COMPANY_FILTER_FIELDS,
  SENTIMENTS,
  emptyFilters,
  matchesFilters,
  sortNotes,
  type NoteFilters,
} from "@/lib/notes";
import { cn, companyLabel, groupLabel } from "@/lib/utils";
import { NoteFilterRow } from "@/components/notes/NoteFilterRow";
import { useConsole } from "@/store/console-store";
import type { GroupLine, Note } from "@/types";

/**
 * All the notes of one company, with a filter bar of its own.
 *
 * The per-company bar only offers level and source: the page-wide bar already
 * owns year and term, and repeating them here would let a card be filtered out
 * by two controls that disagree.
 */
export function CompanyNoteSection({
  group,
  notes,
  filters,
  filterOpen,
  collapsed,
  onFilterChange,
  onToggleFilter,
  onToggleCollapse,
  onEditNote,
  onDeleteNote,
}: {
  group: GroupLine;
  notes: Note[];
  filters: NoteFilters;
  filterOpen: boolean;
  collapsed: boolean;
  onFilterChange: (next: NoteFilters) => void;
  onToggleFilter: () => void;
  onToggleCollapse: () => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
}) {
  const { companyContacts } = useConsole();
  // Keyed by company id, so a group with no company row simply has none.
  const contacts =
    group.companyId != null ? (companyContacts[group.companyId] ?? []) : [];

  const activeCount = COMPANY_FILTER_FIELDS.filter(
    (field) => filters[field] !== "all",
  ).length;
  const visible = sortNotes(notes.filter((n) => matchesFilters(n, filters)));

  const { primary, secondary } = companyLabel(group);
  const tally = SENTIMENTS.map((s) => ({
    ...s,
    count: visible.filter((n) => n.sentiment === s.value).length,
  })).filter((s) => s.count > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-line-soft bg-surface">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
        {/* The group's LINE profile picture, as on the groups page. The frame
            stays neutral here — nothing on this page turns on whether the
            company is linked — and the building glyph is the fallback for a
            group with no picture, or one whose URL has expired. */}
        <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-sunken text-text-2">
          <GroupAvatar
            src={group.pictureUrl}
            alt={groupLabel(group)}
            className="size-full object-cover"
            fallback={<Icon name="building" className="size-[18px]" />}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[15.5px] font-semibold text-text">
              {primary ?? groupLabel(group)}
            </h2>
            {secondary && (
              <span className="text-[13px] text-text-3">({secondary})</span>
            )}
            <CountChip tone="pending">
              {visible.length !== notes.length
                ? `${visible.length}/${notes.length}`
                : visible.length}
            </CountChip>

            {tally.length > 0 && (
              <span className="flex items-center gap-2 text-[12px]">
                {tally.map((s) => (
                  <span key={s.value} className="inline-flex items-center gap-1">
                    <span className={`size-1.5 rounded-full ${s.dot}`} />
                    <span className="font-mono tabular-nums">{s.count}</span>
                  </span>
                ))}
              </span>
            )}
          </div>

          {/* Short names first, then this company's contacts to their right. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <AliasTags aliases={group.aliases} />
            <ContactTags contacts={contacts} />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleFilter}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-medium transition",
              activeCount > 0
                ? "border-accent-line bg-accent-soft text-accent hover:bg-accent-strong"
                : "border-line bg-surface text-text-2 hover:border-text-4 hover:bg-surface-2",
            )}
          >
            <Icon name="filter" className="size-3.5" />
            ตัวกรองในบริษัท
            {activeCount > 0 && (
              <span className="rounded-md bg-accent-strong px-1.5 font-mono text-[11px] tabular-nums">
                {activeCount}
              </span>
            )}
          </button>
          <IconButton
            icon={collapsed ? "chevron-down" : "chevron-up"}
            label={`${collapsed ? "ขยาย" : "ย่อ"}รายการโน้ตของบริษัทนี้`}
            onClick={onToggleCollapse}
          />
        </div>
      </header>

      {filterOpen && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft bg-sunken px-4 py-3 sm:px-5">
          <span className="font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
            กรองเฉพาะบริษัทนี้
          </span>
          <NoteFilterRow
            filters={filters}
            fields={COMPANY_FILTER_FIELDS}
            onChange={onFilterChange}
          />
          <button
            type="button"
            onClick={() => onFilterChange(emptyFilters())}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium text-text-2 transition hover:bg-surface-2 hover:text-text"
          >
            <Icon name="x" className="size-3.5" />
            ล้าง
          </button>
        </div>
      )}

      {!collapsed && (
        <div className="space-y-2.5 border-t border-line-soft p-4 sm:p-5">
          {visible.length === 0 ? (
            <EmptyState
              icon="filter"
              title="ไม่มีโน้ตที่ตรงกับตัวกรองในบริษัทนี้"
              detail="ลองล้างตัวกรองของบริษัท เพื่อดูโน้ตทั้งหมดที่เหลืออยู่"
            />
          ) : (
            visible.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={onEditNote}
                onDelete={onDeleteNote}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
