"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { FieldLabel, SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import {
  NOTE_TYPES,
  SENTIMENTS,
  SOURCES,
  getCurrentYearSemester,
  isPersonNote,
  notePersonLabel,
  yearOptions,
} from "@/lib/notes";
import { cn, companyLabel, groupLabel } from "@/lib/utils";
import { useConsole } from "@/store/console-store";
import type { Employee, GroupLine, Note, NoteInput, NoteType } from "@/types";

/**
 * Everything the form holds while it is open. Not NoteInput: semester/year are
 * always set here, and the company/employee start out unchosen.
 *
 * `companyId`, not a group id — that is what `notes.company_id` stores. The
 * picker below still lists LINE groups, because that is how anyone recognises
 * a company here, but what it writes down is the company the group points at.
 */
interface Draft {
  type: NoteType;
  source: NoteInput["source"];
  sentiment: NoteInput["sentiment"];
  year: number;
  semester: 1 | 2 | 3;
  companyId: number | null;
  employeeId: number | null;
  content: string;
}

export function emptyNoteDraft(): Draft {
  const current = getCurrentYearSemester();
  return {
    type: "mou",
    source: "external",
    sentiment: "neutral",
    year: current.year,
    semester: current.semester,
    companyId: null,
    employeeId: null,
    content: "",
  };
}

function draftFrom(note: Note): Draft {
  const current = getCurrentYearSemester();
  return {
    type: note.type ?? "mou",
    source: note.source ?? "external",
    sentiment: note.sentiment ?? "neutral",
    year: note.year ?? current.year,
    semester: (note.semester ?? current.semester) as 1 | 2 | 3,
    companyId: note.companyId,
    employeeId: note.employeeId ?? null,
    content: note.content ?? "",
  };
}

/**
 * A chip that behaves like a radio: pressed carries the tone, the rest are
 * quiet. Disabled keeps the pressed one legible and greys the rest right out,
 * so a locked row still reads as an answer rather than an empty control.
 */
function Chip({
  active,
  tone,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  tone: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition",
        disabled
          ? active
            ? cn(tone, "cursor-not-allowed opacity-70")
            : "cursor-not-allowed border-line-soft bg-sunken text-text-4"
          : active
            ? tone
            : "border-line bg-sunken text-text-2 hover:border-text-4 hover:bg-surface-2 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

export function NoteFormModal({
  open,
  /** null opens a blank form; a note opens it on that note. */
  editing,
  onClose,
}: {
  open: boolean;
  editing: Note | null;
  onClose: () => void;
}) {
  const { groupLines, employeesOf, saveNote } = useConsole();

  // Keyed remount from the panel resets this, so the draft can start from the
  // note being edited without an effect that syncs props into state.
  const [draft, setDraft] = useState<Draft>(() =>
    editing ? draftFrom(editing) : emptyNoteDraft(),
  );
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));

  /**
   * กลุ่มไลน์ของบริษัทที่เลือกไว้ - null เมื่อยังไม่ได้เลือก
   *
   * เช็ค null ก่อนเสมอ ห้ามปล่อยให้ find ทำงานตอน companyId ยังเป็น null:
   * กลุ่มที่ยังไม่ได้ผูกบริษัทก็มี companyId เป็น null เหมือนกัน `find` จึงไป
   * เจอกลุ่มนั้นแล้วคืนมาเป็น "บริษัทที่เลือกไว้" ทั้งที่ยังไม่ได้เลือกอะไร
   * อาการคือฟอร์มเปิดมาก็ติดบริษัทมั่ว ๆ ไว้แล้ว ปุ่มบันทึกยังขึ้นว่า
   * "ยังต้อง: เลือกบริษัท" และกากบาทกดแล้วไม่หาย เพราะการล้างค่าคือ set null
   * ซึ่งไปเข้าเงื่อนไขเดิมอีกรอบ
   */
  const selectedGroup = useMemo(
    () =>
      draft.companyId === null || draft.companyId === undefined
        ? null
        : (groupLines.find((g) => g.companyId === draft.companyId) ?? null),
    [groupLines, draft.companyId],
  );

  // Only groups with a company are offerable: a note is filed under a company,
  // and an unlinked group has no name to file it under.
  const options = useMemo(() => {
    const needle = companyQuery.trim().toLowerCase();
    return groupLines
      // companyId as well as isLinked: what the pick writes down is the
      // company id, so a group without one is not offerable even if the flag
      // says otherwise.
      .filter((g) => g.isLinked && g.companyId !== null)
      .filter((g) =>
        needle === ""
          ? true
          : [g.companyTh, g.companyEn, ...(g.aliases ?? [])].some((value) =>
              (value ?? "").toLowerCase().includes(needle),
            ),
      );
  }, [groupLines, companyQuery]);

  // Only people who have been through review can be pointed at: a note is a
  // graph edge to an Employee node, and a `pending` row has no node yet. Any
  // other status is fine — someone who has since resigned still said what the
  // note is recording.
  const people: Employee[] = employeesOf(selectedGroup?.companyId).filter(
    (person) => person.status !== "pending",
  );

  const needsPerson = isPersonNote(draft.type);

  /**
   * What a note is *about* is fixed once it exists: its type, the company it
   * is filed under and the person it points at. PUT /notes/{id} refuses a type
   * change outright, and moving a note to another company or person would
   * rewrite the graph edge underneath it — so on an edit those three are shown
   * as they are and only the content, level, source, year and semester stay open.
   */
  const locked = editing !== null;

  const blockers: string[] = [];
  if (draft.companyId === null) blockers.push("เลือกบริษัท");
  if (needsPerson && draft.employeeId === null)
    blockers.push("เลือกผู้ประสานงาน");
  if (draft.content.trim() === "") blockers.push("กรอกเนื้อหาโน้ต");
  const canSave = blockers.length === 0;

  const current = getCurrentYearSemester();
  const years = yearOptions(current.year);

  async function handleSave() {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      const saved = await saveNote(editing?.id ?? null, {
        content: draft.content.trim(),
        type: draft.type,
        sentiment: draft.sentiment,
        source: draft.source,
        year: draft.year,
        semester: draft.semester,
        // Non-null by canSave, which blocks the button until a company is
        // picked — notes.company_id is NOT NULL.
        companyId: draft.companyId!,
        // The API rejects an employeeId on a company-level note (and so does
        // ck_notes_employee_binding), so it goes only when the type calls for
        // one.
        employeeId: needsPerson ? draft.employeeId : null,
      });
      if (saved) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      icon="note"
      maxWidth="860px"
      title={editing ? "แก้ไขโน้ต" : "เพิ่มโน้ตใหม่"}
      subtitle="กรอกรายละเอียดของเรื่องที่ต้องการบันทึก"
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <p className="mr-auto flex items-center gap-1.5 text-[12.5px] text-warn">
            {!canSave && (
              <>
                <Icon name="alert" className="size-3.5" />
                ยังต้อง: {blockers.join(" · ")}
              </>
            )}
          </p>
          <Button onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            icon="check-circle"
            loading={saving}
            disabled={!canSave}
            onClick={handleSave}
          >
            {editing ? "บันทึกการแก้ไข" : "บันทึกโน้ต"}
          </Button>
        </>
      }
    >
      <div>
        <FieldLabel required>ประเภทโน้ต</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {NOTE_TYPES.map((t) => (
            <Chip
              key={t.value}
              active={draft.type === t.value}
              disabled={locked}
              tone="border-accent-line bg-accent-soft text-accent"
              onClick={() =>
                // Leaving a person type drops the person: the API refuses a
                // employeeId on a company-level note.
                patch({
                  type: t.value,
                  employeeId: isPersonNote(t.value) ? draft.employeeId : null,
                })
              }
            >
              <Icon name={t.icon} className="size-3.5" />
              {t.label}
            </Chip>
          ))}
        </div>
        {locked && (
          <span className="mt-1.5 block text-[12px] text-text-3">
            แก้ไขประเภทโน้ตไม่ได้ — หากต้องการแก้ไข ให้ลบโน้ตนี้แล้วสร้างใหม่
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <FieldLabel required>ที่มาของเรื่อง</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {SOURCES.map((s) => (
              <Chip
                key={s.value}
                active={draft.source === s.value}
                tone={s.on}
                onClick={() => patch({ source: s.value })}
              >
                <Icon name={s.icon} className="size-3.5" />
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel required>ระดับของโน้ต</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SENTIMENTS.map((s) => (
              <Chip
                key={s.value}
                active={draft.sentiment === s.value}
                tone={s.on}
                onClick={() => patch({ sentiment: s.value })}
              >
                <span className={`size-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* SelectField, not the header-sized SortSelect: these two are form
            fields in a grid cell, so they fill their column like บริษัท and
            the rest of the form — and their chevron sits inside the control
            instead of floating out at the edge of the cell. */}
        <div>
          <SelectField
            label="ปีการศึกษา"
            value={String(draft.year)}
            onChange={(event) => patch({ year: Number(event.target.value) })}
            options={years.map((y) => ({
              value: String(y),
              label: y === current.year ? `${y} (ปัจจุบัน)` : String(y),
            }))}
          />
        </div>
        <div>
          <SelectField
            label="ภาคเรียน"
            value={String(draft.semester)}
            onChange={(event) =>
              patch({ semester: Number(event.target.value) as 1 | 2 | 3 })
            }
            options={[
              { value: "1", label: "ภาคเรียนที่ 1" },
              { value: "2", label: "ภาคเรียนที่ 2" },
              { value: "3", label: "ภาคฤดูร้อน (3)" },
            ]}
          />
        </div>

        <div className="sm:col-span-2">
          <FieldLabel required>บริษัท</FieldLabel>
          {/* Locked: the company a note is filed under is what the graph edge
              was built from, so an edit shows it and offers no way to change
              it. `editing.companyTh` covers the case where the group is not in
              groupLines any more — the note still knows the name. */}
          {locked ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-line-soft bg-surface px-3.5 py-2.5">
              <Icon name="building" className="size-4 shrink-0 text-text-3" />
              <span className="min-w-0 flex-1 truncate text-sm text-text-2">
                {(selectedGroup
                  ? companyLabel(selectedGroup).primary ?? groupLabel(selectedGroup)
                  : editing?.companyTh ?? editing?.companyEn) ?? "ไม่ทราบบริษัท"}
              </span>
              <Icon name="lock" className="size-3.5 shrink-0 text-text-4" />
            </div>
          ) : selectedGroup ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-accent-line bg-accent-soft px-3.5 py-2.5">
              <Icon name="building" className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-sm text-text">
                {companyLabel(selectedGroup).primary ?? groupLabel(selectedGroup)}
              </span>
              <button
                type="button"
                aria-label="ล้างบริษัทที่เลือก"
                onClick={() => {
                  patch({ companyId: null, employeeId: null });
                  setCompanyOpen(true);
                }}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-text-2 transition hover:bg-surface-2 hover:text-text"
              >
                <Icon name="x" className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-3"
              />
              <input
                type="text"
                autoComplete="off"
                role="combobox"
                aria-expanded={companyOpen}
                aria-controls="note-company-options"
                value={companyQuery}
                placeholder="พิมพ์ชื่อบริษัท (ไทย / อังกฤษ / ชื่อย่อ)..."
                onFocus={() => setCompanyOpen(true)}
                onChange={(event) => {
                  setCompanyQuery(event.target.value);
                  setCompanyOpen(true);
                }}
                className="w-full rounded-xl border border-line bg-sunken py-2.5 pr-10 pl-10 text-sm text-text transition hover:border-text-4 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
              />
              {companyOpen && (
                <div
                  id="note-company-options"
                  role="listbox"
                  className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lift-lg"
                >
                  {options.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[12.5px] text-text-3">
                      ไม่พบบริษัทที่ตรงกับคำค้น
                    </p>
                  ) : (
                    options.map((group) => (
                      <CompanyOption
                        key={group.groupId}
                        group={group}
                        onPick={() => {
                          patch({
                            companyId: group.companyId,
                            employeeId: null,
                          });
                          setCompanyQuery("");
                          setCompanyOpen(false);
                        }}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <span className="mt-1.5 block text-[12px] text-text-3">
            {locked
              ? "แก้ไขบริษัทของโน้ตไม่ได้ — หากต้องการแก้ไข ให้ลบโน้ตแล้วสร้างใหม่"
              : ""}
          </span>
        </div>
      </div>

      {needsPerson && (
        <div>
          <FieldLabel required>ผู้ประสานงาน</FieldLabel>
          <EmployeePicker
            hasCompany={draft.companyId !== null}
            people={people}
            selected={draft.employeeId}
            disabled={locked}
            fallbackName={editing ? notePersonLabel(editing) : null}
            onSelect={(employeeId) => patch({ employeeId })}
          />
          {locked && (
            <span className="mt-1.5 block text-[12px] text-text-3">
              แก้ไขผู้ประสานงานของโน้ตไม่ได้ — หากต้องเปลี่ยน ให้ลบโน้ตนี้แล้วสร้างใหม่
            </span>
          )}
        </div>
      )}

      <label className="block">
        <FieldLabel required>เนื้อหาโน้ต</FieldLabel>
        <textarea
          rows={4}
          value={draft.content}
          placeholder="เขียนเนื้อหาโน้ต..."
          onChange={(event) => patch({ content: event.target.value })}
          className="w-full resize-y rounded-xl border border-line bg-sunken px-3.5 py-2.5 text-sm leading-relaxed text-text transition hover:border-text-4 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
      
      </label>
    </Modal>
  );
}

function CompanyOption({
  group,
  onPick,
}: {
  group: GroupLine;
  onPick: () => void;
}) {
  const { primary, secondary } = companyLabel(group);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13.5px] text-text transition hover:bg-accent-soft hover:text-text"
    >
      <Icon name="building" className="size-4 shrink-0 text-text-3" />
      <span className="min-w-0 flex-1 truncate">
        {primary ?? groupLabel(group)}
        {secondary && <span className="text-text-3"> ({secondary})</span>}
      </span>
    </button>
  );
}

function EmployeePicker({
  hasCompany,
  people,
  selected,
  disabled = false,
  fallbackName,
  onSelect,
}: {
  hasCompany: boolean;
  people: Employee[];
  selected: number | null;
  /** An edit: the person is shown, not chosen. */
  disabled?: boolean;
  /**
   * The name the note itself carries. A locked picker falls back to it when
   * the person is no longer in the approved list for that company — the note
   * still points at them, so showing "ยังไม่มีผู้ประสานงาน" would be a lie.
   */
  fallbackName?: string | null;
  onSelect: (id: number) => void;
}) {
  if (disabled && !people.some((person) => person.id === selected)) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line-soft bg-surface px-3.5 py-2.5">
        <Icon name="user" className="size-4 shrink-0 text-text-3" />
        <span className="min-w-0 flex-1 truncate text-sm text-text-2">
          {fallbackName ?? "ไม่ทราบผู้ประสานงาน"}
        </span>
        <Icon name="lock" className="size-3.5 shrink-0 text-text-4" />
      </div>
    );
  }

  if (!hasCompany) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px] text-warn">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        <span>
          กรุณาเลือกบริษัท
        </span>
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-line bg-sunken px-3.5 py-3 text-[13px] text-text-2">
        <Icon name="user" className="mt-0.5 size-4 shrink-0" />
        <span>บริษัทนี้ยังไม่มีผู้ประสานงานที่อนุมัติแล้วในระบบ</span>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(disabled ? people.filter((person) => person.id === selected) : people).map((person) => {
        const on = selected === person.id;
        const name = person.nameTh?.trim() || person.nameEn?.trim() || "ไม่ระบุชื่อ";
        const nickname = person.nickname?.trim();
        return (
          <button
            key={person.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onSelect(person.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition",
              disabled
                ? "cursor-not-allowed border-line-soft bg-surface"
                : on
                  ? "border-accent-line bg-accent-soft"
                  : "border-line bg-sunken hover:border-text-4 hover:bg-surface-2",
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px]",
                on
                  ? "bg-accent-strong text-accent"
                  : "bg-surface-2 text-text-2",
              )}
            >
              {(person.nameEn || person.nameTh || "?")
                .replace("คุณ", "")
                .trim()
                .slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[13.5px]",
                  on ? "text-accent" : "text-text",
                )}
              >
                {nickname ? `${name} (${nickname})` : name}
              </span>
              <span className="block truncate text-[11.5px] text-text-3">
                {person.jobTitle ?? "ไม่ระบุตำแหน่ง"}
              </span>
            </span>
            {on && (
              <Icon name="check-circle" className="size-4 shrink-0 text-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}
