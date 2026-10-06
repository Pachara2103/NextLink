"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChecklistCode } from "@/features/elective-plan/components/checklist-code";
import { CourseDialog, type CourseFormTarget } from "@/features/elective-plan/components/course-dialog";
import { dayFilter, periodFilter } from "@/features/elective-plan/lib/filter-values.ts";
import { EmptyResult } from "@/features/elective-plan/components/empty-result";
import { FilterSummary } from "@/features/elective-plan/components/filter-summary";
import { Pager } from "@/features/elective-plan/components/pager";
import { PlanShell } from "@/features/elective-plan/components/plan-shell";
import { ResultAnnouncer } from "@/features/elective-plan/components/result-announcer";
import { SlotFilters, matchesSlotFilter } from "@/features/elective-plan/components/slot-filters";
import { StatusToast, useStatusToast } from "@/features/elective-plan/components/status-toast";
import {
  CHECKLIST_FIELDS,
  DONE_LABELS,
  DONE_ORDER,
  RECEIPT_LABELS,
  RECEIPT_ORDER,
  checklistPatch,
  checklistTone,
  isChecklistComplete,
  type ChecklistField,
  type CourseChecklist,
} from "@/features/elective-plan/lib/checklist.ts";
import {
  buildChecklistWorkbook,
  buildCourseWorkbook,
  courseFileName,
  type ExportContext,
} from "@/features/elective-plan/lib/course-export.ts";
import { formatNumber } from "@/features/elective-plan/lib/format";
import { DAY_COLORS } from "@/features/elective-plan/lib/day-colors.ts";
import { DAY_LABELS, PERIODS, parseSlotId, slotLabel, type DayKey, type PeriodKey, type SlotId } from "@/features/elective-plan/lib/slots.ts";
import type { PlacedPeriod, PlanCourse } from "@/features/elective-plan/lib/plan-types.ts";
import { usePlanState } from "@/features/elective-plan/lib/use-plan-state";
import { useUrlFilters } from "@/features/elective-plan/lib/use-url-filters";

type PlacementFilter = "all" | "placed" | "unplaced";
/** Which table the page is showing: the schedule facts, or the paperwork. */
type ViewMode = "table" | "checklist";
type ChecklistFilter = "all" | "incomplete" | "complete";

const PAGE_SIZE = 10;

/**
 * Every course as a row: what the company offered, and what it got.
 *
 * It used to sit under the board on the overview, which meant the board — the
 * thing you are actually working in — shared the page with a table you only
 * consult. On its own page the board gets the whole screen and this gets room
 * to be a proper reference list.
 *
 * It is also where a term is chosen. On the shared plan that choice is not
 * this table's — picking a past term loads that term into the store, so the
 * board, the rooms and the paperwork are all showing it too. A term that has
 * ended is a plan like any other now: paperwork arrives late and whole terms
 * get entered after the fact, and neither is possible on a record nobody can
 * write to. In seed mode the past is still bundled files, read-only, which is
 * what `archives` is.
 */
export function CourseList() {
  const plan = usePlanState();
  const { payload, terms, archives } = plan;
  const { toast, show, dismiss, holdTimer, resumeTimer } = useStatusToast();
  // The plan always has a term; the full list of terms is read after it, so
  // this page renders before the switcher has anything else to offer.
  const currentTerm = useMemo(
    () => terms.find((term) => term.status === "CURRENT") ?? terms[0] ?? plan.term,
    [terms, plan.term],
  );

  const [courseForm, setCourseForm] = useState<CourseFormTarget | null>(null);
  /**
   * Which term the table shows: what the reader picked, or the one being
   * planned until they pick.
   *
   * Derived rather than `useState(currentTerm.id)`. On the shared plan the
   * term arrives from a request, so an initial value would be the empty
   * placeholder this page renders before that lands — and it would stay that
   * for ever, because an initialiser only runs once.
   */
  const [pickedTermId, setPickedTermId] = useState<string | null>(null);
  /**
   * A pick is honoured while it names a term — or while there is no list of
   * terms to check it against yet, which is how a link to a past term survives
   * being opened before that list has been read. A pick the list came back
   * without (a renamed term, a hand-edited URL) falls back to what is loaded.
   *
   * With no pick at all this page shows the term the *planner* is on, not the
   * term being planned. Those are usually the same and were assumed to be:
   * walking from a past term's board to this page then flipped the switcher
   * back to the current term, which asked the store to change term under
   * somebody who had only changed page.
   */
  const termId = useMemo(() => {
    if (pickedTermId === null) return payload.term.id;
    const known = terms.some((term) => term.id === pickedTermId);
    return known || terms.length === 0 ? pickedTermId : payload.term.id;
  }, [pickedTermId, terms, payload.term.id]);
  const [search, setSearch] = useState("");
  const [day, setDay] = useState<DayKey | "">("");
  const [period, setPeriod] = useState<PeriodKey | "">("");
  const [placement, setPlacement] = useState<PlacementFilter>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [checklistFilter, setChecklistFilter] = useState<ChecklistFilter>("all");
  const [page, setPage] = useState(1);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  const shared = plan.mode === "api";

  /**
   * A term that has been closed.
   *
   * Decided by the term's own status, not by whether its data has arrived — and
   * a term this page has never heard of counts as closed, because it is either
   * a link opened before the term list landed or a hand-edited URL.
   *
   * What it no longer decides is whether anything can be changed. It only
   * changes the wording: "วิชาที่เปิดจริง" reads better over a term that ran
   * than "ช่วงที่บริษัทสะดวก" does.
   */
  const selectedTerm = useMemo(() => terms.find((term) => term.id === termId) ?? null, [terms, termId]);
  const isPast = selectedTerm ? selectedTerm.status === "ARCHIVED" : termId !== currentTerm.id;

  /** A finished term's bundled copy — seed mode only; see the file header. */
  const archive = useMemo(
    () => (shared ? null : archives.find((item) => item.term.id === termId) ?? null),
    [shared, archives, termId],
  );
  /** True while nothing can be edited: seed mode looking at a term that ended. */
  const readOnly = !shared && isPast;

  /**
   * The chosen term's data is not here yet.
   *
   * On the shared plan that means the store is still fetching it — the term on
   * screen is not the term that was picked. In seed mode it means the bundled
   * archive has not been found.
   */
  const loadingTerm = shared ? payload.term.id !== termId : isPast && archive === null;

  /**
   * Ask the store for the term the URL names.
   *
   * The switcher does this itself when somebody uses it; this is for the other
   * way in — a link to `?term=2568-2` opened cold, which sets the picked term
   * before the store has been told about it.
   */
  useEffect(() => {
    if (!shared || !plan.ready || termId === payload.term.id) return;
    const target = terms.find((term) => term.id === termId);
    if (target?.serverId !== undefined) void plan.selectTerm(target.serverId);
  }, [shared, plan, plan.ready, termId, payload.term.id, terms]);

  /**
   * The checklist belongs to the term being worked on — which can be a term
   * that ended, now that late paperwork can be recorded against one.
   */
  const checklistView = view === "checklist" && !readOnly;

  useUrlFilters(
    {
      q: search,
      day,
      period,
      placement: !readOnly && !checklistView && placement !== "all" ? placement : "",
      term: termId === currentTerm.id ? "" : termId,
      view: checklistView ? "checklist" : "",
      done: checklistView && checklistFilter !== "all" ? checklistFilter : "",
    },
    (found) => {
      setSearch(found.q ?? "");
      setDay(dayFilter(found.day));
      setPeriod(periodFilter(found.period));
      setPlacement(found.placement === "placed" || found.placement === "unplaced" ? found.placement : "all");
      setView(found.view === "checklist" ? "checklist" : "table");
      setChecklistFilter(found.done === "incomplete" || found.done === "complete" ? found.done : "all");
      setPickedTermId(found.term || null);
      setPage(1);
    },
  );

  const roomsById = useMemo(() => new Map(plan.rooms.map((room) => [room.id, room])), [plan.rooms]);

  // Whichever term is on screen shows its own courses, and a term still on its
  // way shows none — an empty table while it loads is the truth, where another
  // term's courses under its name would not be.
  //
  // Memoised because the empty case is a fresh array every render, and the
  // filtered rows below depend on this identity.
  const courses = useMemo(
    () => (archive ? archive.courses : loadingTerm ? [] : plan.courses),
    [archive, loadingTerm, plan.courses],
  );

  const periodsByCourse = useMemo(() => {
    const byCourse = new Map<string, PlacedPeriod[]>();
    const add = (courseId: string, entry: PlacedPeriod) => {
      const list = byCourse.get(courseId);
      if (list) list.push(entry);
      else byCourse.set(courseId, [entry]);
    };

    if (archive) {
      for (const session of archive.sessions) {
        // The room is the name it had that term, not a lookup into today's
        // room list — see `ArchivedSession` for why.
        add(session.courseId, {
          key: `${session.courseId}@${session.slotId}`,
          slotId: session.slotId,
          roomLabel: session.roomName,
          locked: false,
        });
      }
    } else {
      for (const item of plan.assignments) {
        add(item.courseId, {
          key: item.id,
          slotId: item.slotId,
          roomLabel: item.roomId ? roomsById.get(item.roomId)?.name ?? item.roomId : null,
          locked: item.locked,
        });
      }
    }
    return byCourse;
  }, [archive, plan.assignments, roomsById]);

  const rows = useMemo(() => {
    // One box for course, lecturer, company and category. Four separate
    // controls asked the reader to know which field a word lived in before
    // they could look it up, which is a question the box can answer itself.
    const needle = deferredSearch.trim().toLowerCase();
    return courses
      .map((course) => ({
        course,
        placed: periodsByCourse.get(course.id) ?? [],
        // Read for every row even in the plain table: it costs a lookup, and
        // it keeps the two views reading from one source rather than each
        // deciding for itself what "this course's checklist" means.
        checklist: plan.checklistFor(course.id),
      }))
      .filter(({ course, placed, checklist }) => {
        if (!matchesSlotFilter(course.availability, day, period)) return false;
        // Only the current term has a "still to do" state; in a finished term
        // every course listed is a course that ran.
        if (!readOnly && !checklistView) {
          if (placement === "placed" && placed.length < course.sessionsPerWeek) return false;
          if (placement === "unplaced" && placed.length >= course.sessionsPerWeek) return false;
        }
        if (checklistView && checklistFilter !== "all" && editingCode !== course.id) {
          const complete = isChecklistComplete(checklist);
          if (checklistFilter === "complete" && !complete) return false;
          if (checklistFilter === "incomplete" && complete) return false;
        }
        if (!needle) return true;
        return [course.title, course.courseCode, course.provider, course.instructor, course.category]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      });
  }, [
    courses,
    periodsByCourse,
    readOnly,
    deferredSearch,
    day,
    period,
    placement,
    checklistView,
    checklistFilter,
    editingCode,
    plan,
  ]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeFilters = [
    search ? { label: "ค้นหา", value: search, onClear: () => setSearch("") } : null,
    day || period
      ? {
          label: "ช่วงที่สะดวก",
          value: [day ? DAY_LABELS[day] : "", period ? PERIODS[period].label : ""].filter(Boolean).join(" "),
          onClear: () => { setDay(""); setPeriod(""); },
        }
      : null,
    !readOnly && !checklistView && placement !== "all"
      ? {
          label: "สถานะ",
          value: placement === "placed" ? "จัดแล้ว" : "ยังไม่ได้จัด",
          onClear: () => setPlacement("all"),
        }
      : null,
    checklistView && checklistFilter !== "all"
      ? {
          label: "เช็กลิสต์",
          value: checklistFilter === "complete" ? "ครบแล้ว" : "ยังทำไม่ครบ",
          onClear: () => setChecklistFilter("all"),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const clearFilters = () => {
    setSearch("");
    setDay("");
    setPeriod("");
    setPlacement("all");
    setChecklistFilter("all");
  };

  /**
   * Course, company, code and category in one cell.
   *
   * They were four columns for two things: which course this row is, and whose
   * it is. Split across the table they cost width that the paperwork columns
   * needed more — and a reader looking for a course reads the name and the
   * company together anyway, because two companies teach courses with nearly
   * the same name. The links stay separate inside the cell: one goes to this
   * course, the other to everything that company teaches.
   */
  const courseCell = (course: PlanCourse) => (
    <span className="course-cell">
      {readOnly ? (
        <span className="course-link is-static"><strong>{course.title}</strong></span>
      ) : (
        <Link className="course-link" href={`/elective-plan/courses?q=${encodeURIComponent(course.title)}`}>
          <strong>{course.title}</strong>
        </Link>
      )}
      {readOnly ? (
        <span className="course-provider is-static">{course.provider}</span>
      ) : (
        <Link className="provider-link course-provider" href={`/elective-plan/courses?provider=${encodeURIComponent(course.provider)}`}>
          {course.provider}
        </Link>
      )}
      <span className="course-code">
        {course.courseCode}
        {/* ตอนเรียนขึ้นเฉพาะตอนที่สองเป็นต้นไป วิชาส่วนใหญ่เปิดตอนเดียว การเขียน
            "ตอน 1" ทุกแถวจึงเป็นคำที่ไม่ได้บอกอะไรใหม่ */}
        {course.section > 1 ? ` ตอน ${course.section}` : ""} · {course.category}
      </span>
    </span>
  );

  /**
   * The row's own แก้ไข, in a column of its own at the end.
   *
   * It used to sit under the course name, beside a "เพิ่มเอง" badge. Both are
   * gone from there: a control tucked under a title reads as part of the title,
   * and every row in a shared plan was typed in by somebody, so a badge saying
   * so marked nothing. Last column, right-aligned, one per row — the place a
   * reader already looks for a row action.
   */
  const editCell = (course: PlanCourse) =>
    readOnly || !plan.isAddedCourse(course.id) ? (
      <td className="row-action-cell" />
    ) : (
      <td className="row-action-cell">
        <button className="row-action-button" type="button" onClick={() => setCourseForm({ course })}>
          แก้ไข
          <span className="sr-only"> {course.title}</span>
        </button>
      </td>
    );

  /**
   * Show the course that was just added.
   *
   * A new course lands at the end of the list, which is very likely a page the
   * reader is not on and may be behind a filter they left set — and a table
   * that does not change is a table that says the course was not added. So the
   * filters go, the schedule view comes back, and the page jumps to the end.
   */
  const revealCourses = () => {
    clearFilters();
    setView("table");
    setEditingCode(null);
    setPage(Math.max(1, Math.ceil((plan.courses.length + 1) / PAGE_SIZE)));
  };

  /** The term is a scope, not a filter: the search box narrows within it. */
  /**
   * Switch terms.
   *
   * On the shared plan this loads that term into the store, so the switch is
   * refused while a draft is open — the draft belongs to the term it was made
   * against. The picked term is only recorded once the store has agreed, so a
   * refusal leaves the select showing where the reader still is.
   */
  const changeTerm = async (nextId: string) => {
    if (shared) {
      const target = terms.find((term) => term.id === nextId);
      if (target?.serverId !== undefined && !(await plan.selectTerm(target.serverId))) return;
    }
    setPickedTermId(nextId);
    setPage(1);
    setPlacement("all");
  };

  const changeView = (next: ViewMode) => {
    setView(next);
    setPlacement("all");
    setEditingCode(null);
    setPage(1);
  };

  /** One cell of the checklist table: a status to pick, or a code to type. */
  const checklistControl = (courseId: string, courseTitle: string, checklist: CourseChecklist, field: ChecklistField) => {
    if (field.kind === "code") {
      return (
        <ChecklistCode
          value={checklist.mcvJoinCode}
          label={`${field.label} — ${courseTitle}`}
          onChange={(value) => { void plan.setChecklistField(courseId, checklistPatch(field, value)); }}
          onEditing={(editing) => setEditingCode(editing ? courseId : null)}
        />
      );
    }
    const options = field.kind === "receipt" ? RECEIPT_ORDER : DONE_ORDER;
    const labels: Record<string, string> = field.kind === "receipt" ? RECEIPT_LABELS : DONE_LABELS;
    return (
      <select
        className={`checklist-select tone-${checklistTone(checklist, field)}`}
        value={checklist[field.key]}
        aria-label={`${field.label} — ${courseTitle}`}
        onChange={(event) => plan.setChecklistField(courseId, checklistPatch(field, event.target.value))}
      >
        {options.map((option) => (
          <option key={option} value={option}>{labels[option]}</option>
        ))}
      </select>
    );
  };

  /**
   * Download what is on screen as .xlsx — every filtered row, not just the
   * page being shown, because the page is a reading convenience and nobody
   * asks for "the ten courses I can currently see" in a spreadsheet.
   *
   * The file is built here in the browser: these pages are statically
   * rendered and there is no server to ask, and a term's worth of courses is
   * a few dozen rows either way.
   */
  const downloadXlsx = () => {
    const context: ExportContext = {
      term: archive ? archive.term : selectedTerm ?? currentTerm,
      isArchived: isPast,
      filters: activeFilters.map((filter) => (filter.value ? `${filter.label}: ${filter.value}` : filter.label)),
      dataUpdated: archive ? archive.lastUpdated : payload.lastUpdated,
      isMock: archive ? archive.isMock : payload.isMock,
      timezone: payload.timezone,
      exportedAt: new Date(),
    };

    // The button exports what is on screen. Someone who switched to the
    // checklist wants the checklist; handing them the schedule columns would
    // be the app disagreeing with itself about which table it is showing.
    const bytes = checklistView ? buildChecklistWorkbook(context, rows) : buildCourseWorkbook(context, rows);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = courseFileName(context, checklistView ? "checklist" : "table");
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked a tick later: revoking in the same task cancels the download in
    // Safari, which has not read the blob yet when click() returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <PlanShell
      title="รายวิชาเลือก"
      lastUpdated={archive ? archive.lastUpdated : payload.lastUpdated}
      timezone={payload.timezone}
      isMock={archive ? archive.isMock : payload.isMock}
      // Local edits belong to the term being planned; saying "แก้ไขไว้ในเครื่องนี้"
      // over a bundled archive would point at edits this page is not showing.
      editedAt={readOnly ? null : plan.editedAt}
      onReset={plan.resetAll}
    >
      <div className="intro-row">
        <div>
          <p className="section-kicker">รายวิชา</p>
          <h2>{isPast ? "วิชาที่เปิดจริง และคาบที่สอนจริง" : "ช่วงที่บริษัทสะดวก และคาบที่ได้จริง"}</h2>
          <p className="intro-copy">
            {readOnly
              ? `${(selectedTerm ?? archive?.term)?.label ?? "เทอมที่เลือก"} — เทอมที่ปิดไปแล้ว ดูได้อย่างเดียว`
              : isPast
                ? `${(selectedTerm ?? currentTerm).label} — เทอมที่ปิดไปแล้ว เพิ่มหรือแก้ข้อมูลย้อนหลังได้`
                : "กดชื่อวิชาหรือชื่อบริษัทเพื่อไปแก้ช่วงที่สะดวกของรายการนั้นได้ทันที"}
          </p>
        </div>
        <div className="intro-badges">
          <label className="term-switcher">
            <span className="term-switcher-label">เทอม / ปีการศึกษา</span>
            <select value={termId} onChange={(event) => void changeTerm(event.target.value)}>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.label}{term.status === "CURRENT" ? " · กำลังจัด" : ""}
                </option>
              ))}
            </select>
          </label>
          <span className="scope-chip">
            <span className="scope-chip-label">วิชาทั้งหมด</span> {formatNumber(courses.length)}
          </span>
        </div>
      </div>

      <section className="panel table-panel">
        {/* Two tables, one page. The schedule facts and the paperwork are
            about the same list of courses and are read by the same person on
            the same afternoon, so they share the search box, the term and the
            export button rather than living on two pages that drift apart.
            A bundled archive has nothing to tick, so it gets no switch. */}
        {/* The switch and the one control that acts on the list as a whole share
            a row: adding a course is not a filter and does not belong among
            them, and it is the same list in either view. A term that has ended
            keeps both — that is what entering a term after the fact is. */}
        {readOnly ? null : (
          <div className="view-switch-row">
            <div className="view-switch" role="group" aria-label="รูปแบบตาราง">
              <button
                className={`view-switch-button${checklistView ? "" : " is-active"}`}
                type="button"
                aria-pressed={!checklistView}
                onClick={() => changeView("table")}
              >
                ตารางรายวิชา
              </button>
              <button
                className={`view-switch-button${checklistView ? " is-active" : ""}`}
                type="button"
                aria-pressed={checklistView}
                onClick={() => changeView("checklist")}
              >
                เช็กลิสต์งานเอกสาร
              </button>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => setCourseForm({ course: null })}
              title={`เพิ่มรายวิชาเข้า${(selectedTerm ?? currentTerm).label}`}
            >
              ＋ เพิ่มรายวิชา
            </button>
          </div>
        )}
        <div className={`filters ${readOnly ? "filters-archive" : "filters-list"}`}>
          <label>
            ค้นหาวิชา ผู้สอน บริษัท หรือหมวด
            <input
              type="search"
              value={search}
              placeholder="พิมพ์ชื่อวิชา, ชื่ออาจารย์, ชื่อบริษัท, หมวดหมู่"
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
          </label>
          {/* Every course in a finished term ran, so a "จัดครบแล้ว / ยังจัดไม่ครบ"
              control there would be a filter with one possible answer. In the
              checklist the same slot asks the question that view is for. */}
          {archive ? null : checklistView ? (
            <label>
              สถานะเช็กลิสต์
              <select
                value={checklistFilter}
                onChange={(event) => { setChecklistFilter(event.target.value as ChecklistFilter); setPage(1); }}
              >
                <option value="all">ทั้งหมด</option>
                <option value="incomplete">ยังทำไม่ครบ</option>
                <option value="complete">ครบแล้ว</option>
              </select>
            </label>
          ) : (
            <label>
              สถานะการจัด
              <select
                value={placement}
                onChange={(event) => { setPlacement(event.target.value as PlacementFilter); setPage(1); }}
              >
                <option value="all">ทั้งหมด</option>
                <option value="placed">จัดครบแล้ว</option>
                <option value="unplaced">ยังจัดไม่ครบ</option>
              </select>
            </label>
          )}
          <SlotFilters
            day={day}
            period={period}
            onDay={(next) => { setDay(next); setPage(1); }}
            onPeriod={(next) => { setPeriod(next); setPage(1); }}
          />
        </div>
        <div className="list-toolbar">
          <FilterSummary summary={`พบ ${formatNumber(rows.length)} วิชา`} filters={activeFilters} />
          <button
            className="secondary-button"
            type="button"
            onClick={downloadXlsx}
            disabled={rows.length === 0}
            title={`ดาวน์โหลด ${formatNumber(rows.length)} วิชาที่แสดงอยู่เป็นไฟล์ Excel`}
          >
            ดาวน์โหลด Excel
          </button>
        </div>

        <ResultAnnouncer
          message={loadingTerm
            ? `กำลังโหลด${(selectedTerm ?? currentTerm).label}`
            : `พบ ${rows.length} วิชา ใน${(selectedTerm ?? currentTerm).label}`}
        />
        {/* Another term is a separate read. Until it lands there is nothing to
            say about it — and "ไม่พบวิชา" would be a claim about the term, not
            about the request still being in flight. */}
        {loadingTerm ? (
          <p className="empty-result" role="status">กำลังโหลดรายวิชาของ{(selectedTerm ?? currentTerm).label}…</p>
        ) : rows.length === 0 ? (
          <EmptyResult message="ไม่พบวิชาที่ตรงกับตัวกรอง" hasFilters={activeFilters.length > 0} onClear={clearFilters} />
        ) : (
          <>
            <div className="table-wrap">
              {checklistView ? (
              /* The course cell stays, so a row is still recognisable as the
                 same row in either view; everything after it is the work
                 itself. Eight controls in a row is a lot of table, which is
                 why the columns are headed with a phrase and the full step is
                 on the control's own label for anyone who needs it read out. */
              <table className="checklist-table">
                {/* Declared widths, not measured ones. The table is laid out
                    fixed so every status column is the same width whatever is
                    inside it — otherwise the two columns holding the longest
                    answer come out wider than the rest, and a row of controls
                    that should read as one row of the same thing reads as
                    several. Percentages so the whole thing still fits when a
                    sidebar takes a slice of the page. */}
                <colgroup>
                  <col style={{ width: "20%" }} />
                  {CHECKLIST_FIELDS.map((field) => (
                    <col key={field.key} style={{ width: field.kind === "code" ? "8%" : "10%" }} />
                  ))}
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">วิชา</th>
                    {CHECKLIST_FIELDS.map((field) => (
                      <th scope="col" key={field.key} title={field.label}>{field.short}</th>
                    ))}
                    <th scope="col" className="row-action-cell"><span className="sr-only">การแก้ไข</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ course, checklist }) => (
                    <tr key={course.id} className={isChecklistComplete(checklist) ? "is-complete" : undefined}>
                      <td>{courseCell(course)}</td>
                      {CHECKLIST_FIELDS.map((field) => (
                        <td key={field.key}>{checklistControl(course.id, course.title, checklist, field)}</td>
                      ))}
                      {editCell(course)}
                    </tr>
                  ))}
                </tbody>
              </table>
              ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">วิชา</th>
                    <th scope="col">ผู้สอน</th>
                    <th scope="col">{isPast ? "ช่วงที่แจ้งไว้" : "ช่วงที่สะดวก"}</th>
                    <th scope="col">{isPast ? "คาบที่สอน" : "คาบที่ได้"}</th>
                    <th scope="col">ห้อง</th>
                    <th scope="col" className="row-action-cell"><span className="sr-only">การแก้ไข</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ course, placed }) => (
                    <tr key={course.id}>
                      {/* ทั้งชื่อวิชาและชื่อบริษัทพาไปหน้าเดียวกัน โดยกรองตามสิ่งที่กด
                          — คำถามถัดไปจากแถวนี้คือ "แล้วเขาสอนคาบไหนได้อีก" ซึ่ง
                          ตอบอยู่ในหน้าช่วงที่สะดวก หน้านั้นรู้จักแต่เทอมที่กำลังจัด
                          แถวของเทอมเก่าจึงเป็นข้อความเปล่า ไม่ใช่ลิงก์ */}
                      <td>{courseCell(course)}</td>
                      <td><span className="schedule-text">{course.instructor}</span></td>
                      <td>
                        {course.availability.length === 0 ? (
                          <span className="status-pill tone-orange">ยังไม่ได้แจ้ง</span>
                        ) : (
                          <span className="day-chip-list">
                            {course.availability.map((slotId: SlotId) => {
                              const colour = DAY_COLORS[parseSlotId(slotId).day];
                              return (
                                <span
                                  className="day-chip"
                                  key={slotId}
                                  style={{
                                    ["--day-ink" as string]: colour.ink,
                                    ["--day-bg" as string]: colour.bg,
                                    ["--day-border" as string]: colour.border,
                                  }}
                                >
                                  {slotLabel(slotId)}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </td>
                      <td>
                        {placed.length === 0 ? (
                          <span className="status-pill tone-orange">ยังไม่ได้จัด</span>
                        ) : (
                          /* Same day colours as the column beside it, so the two
                             can be compared at a glance — which is the whole
                             reason they sit next to each other. The lock is what
                             the old green/blue split used to carry; it stays as a
                             glyph rather than a colour, because colour is now
                             saying which day. Nothing in a past term is locked:
                             a record cannot be moved, so a lock on every chip
                             would mark a distinction that no longer exists. */
                          <span className="day-chip-list">
                            {placed.map((item) => {
                              const colour = DAY_COLORS[parseSlotId(item.slotId).day];
                              return (
                                <span
                                  className={`day-chip${item.locked ? " is-locked" : ""}`}
                                  key={item.key}
                                  style={{
                                    ["--day-ink" as string]: colour.ink,
                                    ["--day-bg" as string]: colour.bg,
                                    ["--day-border" as string]: colour.border,
                                  }}
                                >
                                  {item.locked ? <span className="day-chip-lock" aria-hidden="true">🔒</span> : null}
                                  {slotLabel(item.slotId)}
                                  {item.locked ? <span className="sr-only"> — ยืนยันแล้ว</span> : null}
                                </span>
                              );
                            })}
                          </span>
                        )}
                        {placed.length < course.sessionsPerWeek ? (
                          <small>ต้องได้ {course.sessionsPerWeek} คาบ/สัปดาห์</small>
                        ) : null}
                      </td>
                      <td>
                        {course.deliveryMode === "ONLINE" ? (
                          <span className="room-tag">ออนไลน์</span>
                        ) : placed.length === 0 ? (
                          <span className="schedule-text">—</span>
                        ) : (
                          <span className="status-stack">
                            {placed.map((item) => (
                              <span className="room-tag" key={item.key}>
                                {item.roomLabel ?? "ยังไม่มีห้อง"}
                              </span>
                            ))}
                          </span>
                        )}
                        <small>รับ {formatNumber(course.capacity)} คน</small>
                      </td>
                      {editCell(course)}
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
            <Pager
              page={safePage}
              pageCount={pageCount}
              total={rows.length}
              unit="วิชา"
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </section>

      <CourseDialog
        target={courseForm}
        // Uniqueness is checked against the term being planned, never against
        // whichever term the table happens to be showing.
        courses={plan.courses}
        isAdded={courseForm?.course ? plan.isAddedCourse(courseForm.course.id) : false}
        assignedCount={courseForm?.course ? plan.assignmentsForCourse(courseForm.course.id) : 0}
        onSave={async (draft, companyId) => {
          const target = courseForm?.course;
          if (target) {
            if (!await plan.updateCourse(target.id, draft)) return;
            show(`แก้ ${draft.title} แล้ว`);
          } else {
            if (!await plan.addCourse(draft, companyId)) return;
            show(`เพิ่ม ${draft.title} เข้า${currentTerm.shortLabel} แล้ว`);
            revealCourses();
          }
          setCourseForm(null);
        }}
        onDelete={async () => {
          const target = courseForm?.course;
          if (!target) return;
          const losing = plan.assignmentsForCourse(target.id);
          if (!await plan.removeCourse(target.id)) return;
          show(
            losing > 0
              ? `เอา ${target.title} ออกแล้ว · ${formatNumber(losing)} คาบถูกปลดออกจากตาราง`
              : `เอา ${target.title} ออกแล้ว`);
          setCourseForm(null);
        }}
        onClose={() => setCourseForm(null)}
      />

      <StatusToast toast={toast} onDismiss={dismiss} onHold={holdTimer} onResume={resumeTimer} />
    </PlanShell>
  );
}
