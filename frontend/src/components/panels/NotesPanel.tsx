"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { CompanyNoteSection } from "@/components/notes/CompanyNoteSection";
import { NoteFilterRow } from "@/components/notes/NoteFilterRow";
import { NoteFormModal } from "@/components/notes/NoteFormModal";
import { Button } from "@/components/ui/Button";
import { EmptyState, GroupCardSkeleton } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/Field";
import { ConfirmModal } from "@/components/ui/Modal";
import {
  SENTIMENTS,
  defaultFilters,
  emptyFilters,
  matchesFilters,
  matchesSearch,
  type NoteFilters,
} from "@/lib/notes";
import { useConsole } from "@/store/console-store";
import type { Note } from "@/types";

const ALL_FILTER_FIELDS = [
  "academicYear",
  "term",
  "sentiment",
  "source",
] as const;

export function NotesPanel() {
  const { notes, groupLines, syncing, deleteNote } = useConsole();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<NoteFilters>(defaultFilters);
  /** Per-company overrides, keyed by groupId. Absent means "ทั้งหมด". */
  const [companyFilters, setCompanyFilters] = useState<
    Record<string, NoteFilters>
  >({});
  const [openFilterPanels, setOpenFilterPanels] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  /** null = closed. { note: null } = a blank form. */
  const [form, setForm] = useState<{ note: Note | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * companyId -> the LINE group that points at that company.
   *
   * A note carries `companyId`, not a group id: it is filed under the company,
   * and the group is only how we happen to have met them. So the group is
   * looked up through the company rather than stored on the note, and a
   * company whose group has since been unlinked simply has no entry here.
   */
  const groupByCompany = useMemo(() => {
    const map = new Map<number, (typeof groupLines)[number]>();
    for (const group of groupLines) {
      if (group.companyId !== null && group.companyId !== undefined) {
        map.set(group.companyId, group);
      }
    }
    return map;
  }, [groupLines]);

  const sections = useMemo(() => {
    const visible = notes.filter(
      (n) =>
        matchesSearch(
          n,
          search,
          groupByCompany.get(n.companyId)?.displayName ?? null,
        ) && matchesFilters(n, filters),
    );

    // Group by company, then order the companies by their most recent note —
    // whatever changed last is what the reader came for.
    const buckets = new Map<number, Note[]>();
    for (const note of visible) {
      const bucket = buckets.get(note.companyId);
      if (bucket) bucket.push(note);
      else buckets.set(note.companyId, [note]);
    }

    const latest = (list: Note[]) =>
      Math.max(...list.map((n) => (n.updatedAt ? +new Date(n.updatedAt) : 0)));

    return [...buckets.entries()]
      .map(([companyId, list]) => ({
        group: groupByCompany.get(companyId),
        notes: list,
      }))
      .filter(
        (entry): entry is { group: NonNullable<typeof entry.group>; notes: Note[] } =>
          Boolean(entry.group),
      )
      .sort((a, b) => latest(b.notes) - latest(a.notes));
  }, [notes, groupByCompany, search, filters]);

  const visibleCount = sections.reduce(
    (sum, section) => sum + section.notes.length,
    0,
  );

  const tally = SENTIMENTS.map((s) => ({
    ...s,
    count: sections
      .flatMap((section) => section.notes)
      .filter((n) => n.sentiment === s.value).length,
  }));

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  async function onConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteNote(pendingDelete.id);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
              โน้ตบันทึกข้อมูล
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-text-2">
            โน้ตสำหรับบันทึกประวัติส่วนตัวของบริษัทหรือบุคคล
          </p>
        </div>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => setForm({ note: null })}
        >
          เพิ่มโน้ต
        </Button>
      </header>

      <section className="mt-6 rounded-2xl border border-line-soft bg-surface p-4 sm:p-5">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          onClear={() => setSearch("")}
          placeholder="ค้นหาด้วยชื่อกลุ่มไลน์ ชื่อบริษัท (TH / EN / ชื่อย่อ) หรือชื่อผู้ประสานงาน..."
        />

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
            <Icon name="filter" className="size-3.5" /> ตัวกรอง
          </span>
          <NoteFilterRow
            filters={filters}
            fields={ALL_FILTER_FIELDS}
            onChange={setFilters}
          />
          <button
            type="button"
            onClick={() => {
              setFilters(defaultFilters());
              setCompanyFilters({});
            }}
            className="ml-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium text-text-2 transition hover:bg-surface-2 hover:text-text"
          >
            <Icon name="x" className="size-3.5" /> คืนค่าตัวกรองเริ่มต้น
          </button>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-soft pt-3.5">
          <p className="text-[12.5px] text-text-2">
            แสดง{" "}
            <span className="font-mono font-medium tabular-nums text-accent">
              {visibleCount}
            </span>{" "}
            จาก{" "}
            <span className="font-mono tabular-nums text-text-2">
              {notes.length}
            </span>{" "}
            โน้ต
          
          </p>
          {search.trim() !== "" && (
            <p className="text-[12.5px] text-text-2">
              คำค้น <span className="text-text">“{search.trim()}”</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {tally.map((s) => (
              <span
                key={s.value}
                className={`inline-flex items-center gap-1.5 text-[12px] ${
                  s.count === 0 ? "text-text-4" : "text-text-2"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    s.count === 0 ? "bg-surface-2" : s.dot
                  }`}
                />
                {s.label}{" "}
                <span className="font-mono tabular-nums">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-7 space-y-5">
        {syncing === "initial" ? (
          <>
            <GroupCardSkeleton />
            <GroupCardSkeleton />
          </>
        ) : sections.length === 0 ? (
          search.trim() !== "" ? (
            <EmptyState
              icon="search"
              title="ไม่พบโน้ตที่ตรงกับคำค้น"
              detail="ลองใช้คำสั้นลง หรือค้นด้วยชื่อบริษัทภาษาอังกฤษ / ชื่อเล่นของผู้ประสานงาน"
            />
          ) : notes.length === 0 ? (
            <EmptyState
              icon="note"
              title="ยังไม่มีโน้ตในระบบ"
              detail="เพิ่มโน้ต เพื่อบันทึกเรื่องราวที่น่าสนใจ"
              action={
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => setForm({ note: null })}
                >
                  เพิ่มโน้ต
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="filter"
              title="ไม่มีโน้ตในตัวกรองนี้"
              detail="ลองเปลี่ยนปีการศึกษา/ภาคเรียน หรือกดคืนค่าตัวกรองเริ่มต้น"
            />
          )
        ) : (
          sections.map(({ group, notes: list }) => (
            <CompanyNoteSection
              key={group.groupId}
              group={group}
              notes={list}
              filters={companyFilters[group.groupId] ?? emptyFilters()}
              filterOpen={openFilterPanels.has(group.groupId)}
              collapsed={collapsed.has(group.groupId)}
              onFilterChange={(next) =>
                setCompanyFilters((current) => ({
                  ...current,
                  [group.groupId]: next,
                }))
              }
              onToggleFilter={() =>
                setOpenFilterPanels((current) => toggle(current, group.groupId))
              }
              onToggleCollapse={() =>
                setCollapsed((current) => toggle(current, group.groupId))
              }
              onEditNote={(note) => setForm({ note })}
              onDeleteNote={setPendingDelete}
            />
          ))
        )}
      </div>

      {/* Keyed so switching between "new" and a specific note remounts the form
          and its draft starts from the right place. */}
      {form && (
        <NoteFormModal
          key={form.note?.id ?? "new"}
          open
          editing={form.note}
          onClose={() => setForm(null)}
        />
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        icon="trash"
        tone="danger"
        title="ลบโน้ตนี้"
        confirmLabel="ลบโน้ต"
        loading={deleting}
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        ต้องการลบโน้ตนี้ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
        <span className="mt-2.5 block rounded-lg border border-line-soft bg-surface p-2.5 text-[12.5px] text-text-2">
          {pendingDelete?.content}
        </span>
      </ConfirmModal>
    </div>
  );
}
