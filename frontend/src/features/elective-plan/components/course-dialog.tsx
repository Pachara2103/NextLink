"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "@/features/elective-plan/lib/format";
import {
  COURSE_CATEGORIES,
  DELIVERY_LABELS,
  DELIVERY_MODES,
  courseDraftFrom,
  normalizeCourseDraft,
  validateCourseDraft,
  type CourseDraft,
} from "@/features/elective-plan/lib/courses.ts";
import { DAYS, DAY_SHORT, PERIODS, PERIOD_KEYS, makeSlotId, slotLabel } from "@/features/elective-plan/lib/slots.ts";
import type { PlanCourse } from "@/features/elective-plan/lib/plan-types.ts";
import { usePlanState } from "@/features/elective-plan/lib/use-plan-state";
import { companyService } from "@/lib/services/company";
import type { Company } from "@/types";

/** `course: null` means a new course; `target: null` means the dialog is closed. */
export type CourseFormTarget = { course: PlanCourse | null };

/**
 * A course nobody has been told anything about yet.
 *
 * The numbers are the ones most of the seed carries — a ten-week course for
 * forty people — so the common case is a form where only the top half has to be
 * typed. `availability` is deliberately empty: it is the one field nothing can
 * be guessed about, and a default period would be a claim the company made an
 * offer it never made.
 */
const NEW_COURSE: CourseDraft = {
  courseCode: "",
  section: 1,
  title: "",
  category: "",
  provider: "",
  instructor: "",
  coordinator: null,
  deliveryMode: "ON_SITE",
  availability: [],
  sessionsPerWeek: 1,
  capacity: 40,
  weeks: 10,
  notes: null,
};

type ContactDraft = { name: string; email: string; phone: string };

/** The one name a company is shown under everywhere in this console. */
const companyLabel = (company: Company): string =>
  company.companyTh?.trim() || company.companyEn?.trim() || `บริษัท #${company.id}`;

/**
 * Add or edit one course.
 *
 * The planner's whole input used to arrive in a JSON file, which meant a course
 * the department was told about on Tuesday could not be planned until somebody
 * shipped a build. This is that gap closed: the same fields `readCourse` reads
 * out of the seed, asked for in the order a coordinator would have written them
 * down, and checked by the same rules before anything is saved.
 *
 * Periods are a grid rather than a list of tick boxes because the question they
 * answer — "which parts of the week can you teach" — is a shape, and the same
 * grid is what the availability page shows for every other course.
 */
type CourseDialogProps = {
  target: CourseFormTarget;
  courses: PlanCourse[];
  /** True for a course somebody typed in here, false for one from the seed. */
  isAdded: boolean;
  /** Periods this course currently holds; what a deletion would cost. */
  assignedCount: number;
  /**
   * `companyId` is the row the course will hang off in `electives`. It is
   * undefined on the bundled plan, which has no company table to point at.
   */
  onSave: (draft: CourseDraft, companyId?: number) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function CourseDialog(props: Omit<CourseDialogProps, "target"> & { target: CourseFormTarget | null }) {
  return props.target
    ? <CourseDialogForm {...props} target={props.target} key={props.target.course?.id ?? "new"} />
    : null;
}

function CourseDialogForm({ target, courses, isAdded, assignedCount, onSave, onDelete, onClose }: CourseDialogProps) {
  const plan = usePlanState();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editing = target.course;
  const [draft, setDraft] = useState<CourseDraft>(() => (editing ? courseDraftFrom(editing) : NEW_COURSE));
  const [contact, setContact] = useState<ContactDraft>(() => ({
    name: editing?.coordinator?.name ?? "",
    email: editing?.coordinator?.email ?? "",
    phone: editing?.coordinator?.phone ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * The company directory, read once the form is open rather than with the
   * plan: it is the same list the groups and MOU screens use, it is only
   * needed by the person filling this in, and a plan that failed to load
   * because the company list was slow would be the wrong trade.
   */
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  useEffect(() => {
    if (plan.mode !== "api") return;
    let live = true;
    companyService
      .list()
      .then((rows) => {
        if (!live) return;
        setCompanies(rows);
        // Match the course already being edited to its row by the name it is
        // shown under, so opening a form and saving it does not move a course
        // to a different company.
        const name = editing?.provider.trim();
        const found = name ? rows.find((row) => companyLabel(row) === name) : undefined;
        setCompanyId(found?.id ?? null);
      })
      .catch(() => { if (live) setError("โหลดรายชื่อบริษัทไม่สำเร็จ กรุณาลองใหม่"); });
    return () => { live = false; };
  }, [plan.mode, editing]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  /** What other courses already say, so the second one in a company is a pick. */
  const suggestions = useMemo(() => ({
    providers: [...new Set(courses.map((course) => course.provider.trim()).filter(Boolean))].sort(),
    instructors: [...new Set(courses.map((course) => course.instructor.trim()).filter(Boolean))].sort(),
  }), [courses]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(COURSE_CATEGORIES);
    for (const course of courses) {
      const cat = course.category?.trim();
      if (cat) set.add(cat);
    }
    if (draft.category?.trim()) {
      set.add(draft.category.trim());
    }
    return Array.from(set);
  }, [courses, draft.category]);

  const withContact = (): CourseDraft => ({
    ...draft,
    coordinator: contact.name.trim()
      ? { name: contact.name, email: contact.email || null, phone: contact.phone || null }
      : null,
  });

  const toggleSlot = (slotId: CourseDraft["availability"][number]) => {
    setDraft((current) => ({
      ...current,
      availability: current.availability.includes(slotId)
        ? current.availability.filter((slot) => slot !== slotId)
        : [...current.availability, slotId],
    }));
  };

  const submit = () => {
    const next = withContact();
    const problem = validateCourseDraft(next, courses, editing?.id);
    if (problem) {
      setError(problem);
      return;
    }
    if (plan.mode === "api" && !companyId) {
      setError("กรุณาเลือกบริษัทผู้สอนจากรายชื่อ");
      return;
    }
    setError(null);
    onSave(normalizeCourseDraft(next), companyId ?? undefined);
  };

  const number = (value: number) => (Number.isFinite(value) ? value : "");
  const parse = (value: string) => (value === "" ? Number.NaN : Number.parseInt(value, 10));
  const shortfall = draft.sessionsPerWeek - draft.availability.length;

  return (
    <dialog
      className="course-dialog course-form-dialog"
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="dialog-header">
        <div>
          <p className="section-kicker">{editing ? "แก้ไขรายวิชา" : "เพิ่มรายวิชาเข้าแผน"}</p>
          <h2>{editing ? editing.title : `วิชาใหม่ใน${plan.term.label}`}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="ปิดหน้าต่าง">×</button>
      </div>

      <div className="dialog-content">
        {plan.error ? <p className="room-form-error" role="alert">{plan.error}</p> : null}
        <form className="course-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label>
            รหัสวิชา
            <input
              type="text"
              value={draft.courseCode}
              placeholder="เช่น 21105809"
              autoFocus={!editing}
              onChange={(event) => setDraft({ ...draft, courseCode: event.target.value })}
            />
          </label>

          <label>
            ตอนเรียน
            {/* วิชาเดียวกันที่เปิดสองตอนคือสองวิชาสำหรับระบบนี้: คนละคาบ คนละห้อง
                และเดินเอกสารแยกกัน สิ่งเดียวที่ใช้ร่วมกันคือรหัสวิชา */}
            <input
              type="number"
              min={1}
              max={99}
              value={number(draft.section)}
              onChange={(event) => setDraft({ ...draft, section: parse(event.target.value) })}
            />
          </label>

          <label className="course-form-wide">
            ชื่อวิชา
            <input
              type="text"
              value={draft.title}
              placeholder="เช่น Cloud Native Development"
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>

          {/*
            * On the shared plan the company is a foreign key, so it is picked
            * rather than typed: "บ. เอบีซี" and "ABC จำกัด" are one company to a
            * reader and two rows to a database, and the course has to point at
            * the same one the MOU and the LINE group already do. On the bundled
            * plan there is no company table, so the free-text box stays.
            */}
          <label>
            บริษัทผู้สอน
            {plan.mode === "api" ? (
              <select
                value={companyId ?? ""}
                disabled={companies.length === 0}
                onChange={(event) => {
                  const picked = companies.find((item) => String(item.id) === event.target.value);
                  setCompanyId(picked?.id ?? null);
                  setDraft({ ...draft, provider: picked ? companyLabel(picked) : "" });
                }}
              >
                <option value="">{companies.length ? "— เลือกบริษัท —" : "กำลังโหลดรายชื่อบริษัท…"}</option>
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>{companyLabel(item)}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  list="course-providers"
                  value={draft.provider}
                  placeholder="เช่น Soft Square"
                  onChange={(event) => setDraft({ ...draft, provider: event.target.value })}
                />
                <datalist id="course-providers">
                  {suggestions.providers.map((item) => <option key={item} value={item} />)}
                </datalist>
              </>
            )}
          </label>

          <label>
            ผู้สอน
            <input
              type="text"
              list="course-instructors"
              value={draft.instructor}
              placeholder="เช่น อาจารย์กานต์ ศรีสุวรรณ"
              onChange={(event) => setDraft({ ...draft, instructor: event.target.value })}
            />
            <datalist id="course-instructors">
              {suggestions.instructors.map((item) => <option key={item} value={item} />)}
            </datalist>
          </label>

          <label>
            หมวดของวิชา
            <select
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            >
              <option value="">— เลือกหมวดของวิชา —</option>
              {categoryOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            รูปแบบการสอน
            {/* The scheduler reads this, it is not a note: an ONLINE course is
                given no room and blocks nobody else from one. */}
            <select
              value={draft.deliveryMode}
              onChange={(event) => setDraft({ ...draft, deliveryMode: event.target.value as CourseDraft["deliveryMode"] })}
            >
              {DELIVERY_MODES.map((mode) => (
                <option key={mode} value={mode}>{DELIVERY_LABELS[mode]}</option>
              ))}
            </select>
          </label>

          <label>
            จำนวนคาบต่อสัปดาห์
            <input
              type="number"
              min={1}
              max={18}
              value={number(draft.sessionsPerWeek)}
              onChange={(event) => setDraft({ ...draft, sessionsPerWeek: parse(event.target.value) })}
            />
          </label>

          <fieldset className="availability-picker course-form-wide">
            <legend>ช่วงที่บริษัทสะดวก</legend>
            <div className="availability-grid" role="group" aria-label="ช่วงที่บริษัทสะดวก">
              <div className="availability-row">
                <span className="availability-corner" aria-hidden="true" />
                {DAYS.map((day) => <span className="availability-head" key={day}>{DAY_SHORT[day]}</span>)}
              </div>
              {PERIOD_KEYS.map((period) => (
                <div className="availability-row" key={period}>
                  <span className="availability-period">
                    {PERIODS[period].label}
                    <small>{PERIODS[period].start}–{PERIODS[period].end}</small>
                  </span>
                  {DAYS.map((day) => {
                    const slotId = makeSlotId(day, period);
                    const on = draft.availability.includes(slotId);
                    return (
                      <button
                        className={`availability-slot${on ? " is-on" : ""}`}
                        key={slotId}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleSlot(slotId)}
                      >
                        <span aria-hidden="true">{on ? "✓" : ""}</span>
                        <span className="sr-only">{slotLabel(slotId)}{on ? " — สะดวก" : " — ไม่สะดวก"}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="availability-picker-note">
              {/* Said here rather than only on submit: the number of periods to
                  pick follows from the field above it, and a reader who has to
                  press "เพิ่ม" to find that out has to come back up for it. */}
              {shortfall > 0
                ? `เลือกอีก ${formatNumber(shortfall)} ช่วง — วิชานี้ต้องได้ ${formatNumber(draft.sessionsPerWeek || 0)} คาบต่อสัปดาห์`
                : `เลือกไว้ ${formatNumber(draft.availability.length)} ช่วง · ยิ่งบริษัทให้ทางเลือกน้อย ระบบจะยิ่งจัดให้ก่อน`}
            </p>
          </fieldset>

          <label>
            {/* ตัวเลขเดียวกันนี้เป็นเกณฑ์เลือกห้องด้วย: ห้องที่นั่งน้อยกว่านี้ถือว่าเล็กไป */}
            จำนวนที่รับ (คน)
            <input
              type="number"
              min={0}
              max={10000}
              value={number(draft.capacity)}
              onChange={(event) => setDraft({ ...draft, capacity: parse(event.target.value) })}
            />
          </label>

          <label>
            จำนวนสัปดาห์
            <input
              type="number"
              min={1}
              max={52}
              value={number(draft.weeks)}
              onChange={(event) => setDraft({ ...draft, weeks: parse(event.target.value) })}
            />
          </label>

          {/* Folded away by default. Nothing in the plan is computed from the
              coordinator — it is who to ring when a period has to move — so it
              would otherwise be three fields standing between the reader and
              the button. */}
          <details className="course-form-wide course-contact" open={Boolean(contact.name)}>
            <summary>ผู้ประสานงานของบริษัท (ไม่บังคับ)</summary>
            <div className="course-contact-fields">
              <label>
                ชื่อผู้ประสานงาน
                <input
                  type="text"
                  value={contact.name}
                  placeholder="เช่น คุณนลิน"
                  onChange={(event) => setContact({ ...contact, name: event.target.value })}
                />
              </label>
              <label>
                อีเมล
                <input
                  type="text"
                  inputMode="email"
                  value={contact.email}
                  placeholder="name@company.co.th"
                  onChange={(event) => setContact({ ...contact, email: event.target.value })}
                />
              </label>
              <label>
                เบอร์โทร
                <input
                  type="text"
                  inputMode="tel"
                  value={contact.phone}
                  placeholder="เช่น 081-234-5678"
                  onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                />
              </label>
            </div>
          </details>

          <label className="course-form-wide">
            หมายเหตุ
            <textarea
              value={draft.notes ?? ""}
              rows={2}
              placeholder="เช่น บริษัทแจ้งว่าสะดวกพุธเช้าช่วงเดียว"
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </label>

          {error ? <p className="room-form-error" role="alert">{error}</p> : null}

          <div className="dialog-actions course-form-wide">
            {editing ? (
              confirmingDelete ? (
                <span className="delete-confirm">
                  <span>
                    {isAdded ? `ลบ ${editing.title}?` : `เอา ${editing.title} ออกจากแผน?`}
                    {assignedCount > 0 ? ` ${formatNumber(assignedCount)} คาบของวิชานี้จะหายไปจากตาราง` : " วิชานี้ยังไม่ถูกจัดลงคาบใด"}
                    {isAdded ? "" : " วิชาจากข้อมูลตั้งต้นจะกลับมาเมื่อกดคืนค่าเริ่มต้น"}
                  </span>
                  <button className="danger-button" type="button" onClick={onDelete}>ยืนยัน</button>
                  <button className="text-button" type="button" onClick={() => setConfirmingDelete(false)}>ไม่ลบ</button>
                </span>
              ) : (
                <button className="text-button danger-text" type="button" onClick={() => setConfirmingDelete(true)}>
                  {isAdded ? "ลบวิชานี้" : "เอาวิชานี้ออกจากแผน"}
                </button>
              )
            ) : (
              <span className="panel-caption">
                วิชาที่เพิ่มจะนับเป็นวิชาของ{plan.term.shortLabel} และเก็บไว้ในเครื่องนี้ ไม่กระทบข้อมูลตั้งต้นของภาค
              </span>
            )}
            <span className="dialog-actions-end">
              <button className="secondary-button" type="button" onClick={onClose}>ยกเลิก</button>
              <button className="primary-button" type="submit">{editing ? "บันทึก" : "เพิ่มรายวิชา"}</button>
            </span>
          </div>
        </form>
      </div>
    </dialog>
  );
}
