"use client";

import { AcademicPeriodEmptyState, AcademicPeriodSelector } from "@/features/dashboard/components/academic-period-selector";
import { FilterFields } from "@/features/dashboard/components/filter-fields";
import { PageSections } from "@/features/dashboard/components/page-sections";

import { electiveCapacity, firstIssue, isBlocked, isFollowUp, nextAction, operationalReadiness, queueSeverity, queueSeverityRank, workflowStatusLabels, type OperationalReadinessKey } from "@/features/dashboard/lib/elective-stats";

import { AppNav } from "@/features/dashboard/components/app-nav";
import { lazy, useDeferredValue, useMemo, useRef, useState } from "react";

import { DeferredRecordDialog } from "@/features/dashboard/components/deferred-record-dialog";
import { EmptyResult } from "@/features/dashboard/components/empty-result";
import { FilterSummary } from "@/features/dashboard/components/filter-summary";
import { StorageRecoveryPanel } from "./storage-recovery";
import { LocalDataStatus, StorageWarning } from "@/features/dashboard/components/local-data-status";
import { PAGE_SIZE, Pager } from "@/features/dashboard/components/pager";
import { PriorityKpi } from "@/features/dashboard/components/priority-kpi";
import { QueueFilterGroup } from "@/features/dashboard/components/queue-filter";
import { ResultAnnouncer } from "@/features/dashboard/components/result-announcer";
import { StatusToast, useStatusToast } from "@/features/dashboard/components/status-toast";
import { isDashboardCourse } from "@/features/dashboard/lib/dataset-validation";
import { CourseEditDraft, courseOccupancy, courseStatusOptions, deliveryModeLabels, electiveStorageKey, Props, QueueSeverityKey, readinessOptions, scheduleSummary, SortOption, statusClass, workflowProgress, workflowStatusOptions } from "@/features/dashboard/lib/elective-presentation";
import { allowedValue, QUEUE_VALUES, WORKFLOW_VALUES } from "@/features/dashboard/lib/filter-values";
import { formatNumber, formatUpdated, optionalValue } from "@/features/dashboard/lib/format";
import { QUEUE_META, type QueueKind } from "@/features/dashboard/lib/queue";
import type { WorkflowTaskStatus } from "@/features/dashboard/lib/types";
import { useDashboardDataset } from "@/features/dashboard/lib/use-dashboard-dataset";
import { useRecordDialog } from "@/features/dashboard/lib/use-record-dialog";
import { useUrlFilters } from "@/features/dashboard/lib/use-url-filters";
const CourseDialog = lazy(() => import("./elective-detail-dialog").then(module => ({ default: module.CourseDialog })));

export function ElectiveDashboard({ payload }: Props) {
  const { items: courses, update: updateCourses, reset: resetCourses, editedAt, ready, warning, hasOverrides, undo, recovery, recover } = useDashboardDataset(electiveStorageKey, payload.courses, isDashboardCourse);
  const { selected: selectedCourse, dialogRef, open: openCourse, close: closeCourse } = useRecordDialog(courses);
  const { toast, show: showToast, dismiss: dismissToast, holdTimer, resumeTimer } = useStatusToast();
  const [query, setQuery] = useState("");
  // Typing stays responsive as the row count grows; the list catches up.
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowTaskStatus | "all">("all");
  const [readinessFilters, setReadinessFilters] = useState<OperationalReadinessKey[]>([]);
  const [queueFilter, setQueueFilter] = useState<QueueSeverityKey>("all");
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const actionQueueRef = useRef<HTMLElement>(null);

  const categories = useMemo(
    () => [...new Set(courses.map((course) => course.category))].sort((a, b) => a.localeCompare(b, "th")),
    [courses],
  );
  const academicScopes = useMemo(
    () => [...new Set(courses.map((course) => `ปีการศึกษา ${course.academicYear} / ${course.term}`))],
    [courses],
  );
  const scopeLabel = academicScopes.length === 1 ? academicScopes[0] : "หลายภาคการศึกษา";

  const scopedCourses = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return courses.filter((course) => {
      const searchableValues = [
        course.courseCode,
        course.title,
        course.provider,
        course.instructor,
        course.category,
        course.coordinator?.name,
        course.coordinator?.email,
        course.source.sourceKey,
        ...course.workflow.flatMap((task) => [task.label, task.rawStatus, task.detail]),
      ];
      const matchesQuery = !normalizedQuery || searchableValues
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesCategory = category === "all" || course.category === category;
      const matchesStatus = status === "all" || course.status.course === status;
      const matchesWorkflowStatus = workflowStatus === "all" || course.workflow.some((task) => task.status === workflowStatus);
      const matchesQueue = queueFilter === "all" || (isFollowUp(course) && queueSeverity(course).key === queueFilter);
      const matchesFollowUp = !onlyFollowUps || isFollowUp(course);
      return matchesQuery && matchesCategory && matchesStatus && matchesWorkflowStatus && matchesQueue && matchesFollowUp;
    });
  }, [category, courses, onlyFollowUps, deferredQuery, queueFilter, status, workflowStatus]);

  const filteredCourses = useMemo(
    () => readinessFilters.length === 0 ? scopedCourses : scopedCourses.filter((course) => readinessFilters.includes(operationalReadiness(course).key)),
    [readinessFilters, scopedCourses],
  );

  const total = filteredCourses.length;
  const opened = filteredCourses.filter((course) => course.status.course === "เปิดแล้ว").length;
  const enrolled = filteredCourses.reduce((sum, course) => sum + course.enrolled, 0);
  const { capacity, occupancy, unknown: unknownCapacity, enrolled: knownEnrolled } = electiveCapacity(filteredCourses);
  const followUps = filteredCourses.filter(isFollowUp);
  const openedRate = total ? Math.round((opened / total) * 100) : 0;
  const blockedFollowUps = followUps.filter(isBlocked).length;
  const waitingFollowUps = followUps.filter((course) => queueSeverity(course).key === "WAITING").length;
  const inProgressFollowUps = followUps.filter((course) => queueSeverity(course).key === "IN_PROGRESS").length;
  const { remaining: remainingSeats, overbooked } = electiveCapacity(filteredCourses);
  const orderedFollowUps = [...followUps].sort((left, right) => queueSeverityRank(left) - queueSeverityRank(right) || left.title.localeCompare(right.title, "th"));
  const queueCountByKind: Record<QueueKind, number> = {
    BLOCKED: blockedFollowUps,
    WAITING: waitingFollowUps,
    IN_PROGRESS: inProgressFollowUps,
  };
  const categoryCounts = [...filteredCourses.reduce((map, course) => {
    map.set(course.category, (map.get(course.category) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
  const maxCategoryCount = Math.max(...categoryCounts.map(([, count]) => count), 1);

  const readiness = readinessOptions.map((option) => [
    option.key,
    option.label,
    scopedCourses.filter((course) => operationalReadiness(course).key === option.key).length,
    option.tone,
  ] as const);
  const readinessScopeTotal = scopedCourses.length;

  const displayCourses = useMemo(() => {
    if (sortBy === "default") return filteredCourses;
    return [...filteredCourses].sort((left, right) => {
      if (sortBy === "occupancy") return (courseOccupancy(right) ?? -1) - (courseOccupancy(left) ?? -1) || left.title.localeCompare(right.title, "th");
      if (sortBy === "next_action") return queueSeverityRank(left) - queueSeverityRank(right) || nextAction(left).localeCompare(nextAction(right), "th");
      return left.status.course.localeCompare(right.status.course, "th") || left.title.localeCompare(right.title, "th");
    });
  }, [filteredCourses, sortBy]);

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(displayCourses.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pagedCourses = pageCount > 1 ? displayCourses.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE) : displayCourses;

  // Any change to the filters puts the reader back at the first page; without
  // this a narrowed result set can land on a page that no longer exists.
  // Reset before committing a new filter view, without a second effect render.
  const pageScope = JSON.stringify([query, category, status, workflowStatus, readinessFilters, queueFilter, onlyFollowUps, sortBy]);
  const [previousPageScope, setPreviousPageScope] = useState(pageScope);
  if (previousPageScope !== pageScope) { setPreviousPageScope(pageScope); setPage(1); }

  const resetFilters = () => {
    setQuery("");
    setCategory("all");
    setStatus("all");
    setWorkflowStatus("all");
    setReadinessFilters([]);
    setQueueFilter("all");
    setOnlyFollowUps(false);
    setSortBy("default");
  };

  const showFollowUps = () => {
    setOnlyFollowUps(true);
    window.setTimeout(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      actionQueueRef.current?.scrollIntoView({ behavior, block: "start" });
    }, 0);
  };

  const showAllCourses = () => setOnlyFollowUps(false);

  const toggleReadinessFilter = (key: OperationalReadinessKey) => {
    setReadinessFilters((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const hasActiveFilters = Boolean(query.trim()) || category !== "all" || status !== "all" || workflowStatus !== "all" || readinessFilters.length > 0 || queueFilter !== "all" || onlyFollowUps;

  useUrlFilters({
    q: query.trim(),
    category: category === "all" ? "" : category,
    status: status === "all" ? "" : status,
    workflow: workflowStatus === "all" ? "" : workflowStatus,
    readiness: readinessFilters.join(","),
    queue: queueFilter === "all" ? "" : queueFilter,
    followups: onlyFollowUps ? "1" : "",
    sort: sortBy === "default" ? "" : sortBy,
  }, (found) => {
    if (found.q) setQuery(found.q);
    if (found.category) setCategory(found.category);
    setStatus(allowedValue(found.status, courseStatusOptions) ?? "all");
    setWorkflowStatus(allowedValue(found.workflow, WORKFLOW_VALUES) ?? "all");
    if (found.readiness) setReadinessFilters(found.readiness.split(",").filter((key): key is OperationalReadinessKey => readinessOptions.some((option) => option.key === key)));
    setQueueFilter(allowedValue(found.queue, QUEUE_VALUES) ?? "all");
    if (found.followups === "1") setOnlyFollowUps(true);
    setSortBy(allowedValue(found.sort, ["default", "course_status", "occupancy", "next_action"] as const) ?? "default");
  });

  const saveCourse = async (id: string, draft: CourseEditDraft) => {
      const persisted = await updateCourses((current) => current.map((course) => {
      if (course.id !== id) return course;
      const coordinatorName = draft.coordinatorName.trim();
      const coordinatorEmail = optionalValue(draft.coordinatorEmail);
      return {
        ...course,
        title: draft.title.trim(),
        category: draft.category.trim(),
        provider: draft.provider.trim(),
        instructor: draft.instructor.trim(),
        coordinator: coordinatorName || coordinatorEmail ? {
          name: coordinatorName || "ยังไม่ระบุ",
          email: coordinatorEmail,
          lineId: course.coordinator?.lineId ?? null,
        } : null,
        mcvJoinCode: optionalValue(draft.mcvJoinCode),
        deliveryMode: draft.deliveryMode,
        capacity: draft.capacity,
        enrolled: Math.max(0, Math.round(draft.enrolled)),
        weeks: Math.max(0, Math.round(draft.weeks)),
        status: {
          course: draft.courseStatus.trim(),
          documents: draft.documentsStatus.trim(),
          invitation: draft.invitationStatus.trim(),
          mcv: draft.mcvStatus.trim(),
        },
        notes: optionalValue(draft.notes),
        workflow: course.workflow.map((task) => {
          const editedTask = draft.workflow.find((item) => item.key === task.key);
          return editedTask ? { ...task, status: editedTask.status } : task;
        }),
      };
    }));
    showToast(persisted ? "บันทึกการแก้ไขรายวิชาแล้ว" : "บันทึกไม่ได้ การแก้ไขยังอยู่ในแบบฟอร์ม", undo);
    return persisted;
  };

  const updateCourseStatus = async (id: string, nextStatus: string) => {
    const course = courses.find((item) => item.id === id);
    if (!course || course.status.course === nextStatus) return;
    const applyStatus = (value: string) => updateCourses((current) => current.map((item) => item.id === id ? {
      ...item,
      status: { ...item.status, course: value },
    } : item));
    if (!await applyStatus(nextStatus)) { showToast("บันทึกสถานะไม่ได้ กรุณาตรวจข้อมูลล่าสุด"); return; }
    showToast(`${course.title} · สถานะเป็น "${nextStatus}"`, undo);
  };

  const resetDemoData = async () => {
    if (payload.source === "postgresql") { await resetCourses(); return; }
    if (!window.confirm("คืนค่าข้อมูลตั้งต้นและลบการแก้ไขทั้งหมดในเบราว์เซอร์นี้หรือไม่?")) return;
    const persisted = await resetCourses();
    showToast(persisted ? "คืนค่าข้อมูลตั้งต้นแล้ว" : "คืนค่าไม่ได้ ข้อมูลเดิมยังอยู่");
  };

  return (
    <div className="app-shell" data-ready={ready}>
      <header className="topbar">
        <AppNav title="วิชาเลือก" eyebrow="NEXTLINK / ACADEMIC OPERATIONS" />
        <div className="header-tools">
          <div className="header-meta">
            <span className="demo-badge"><span className="status-dot" /> {payload.source === "mock" ? "MOCK DATA" : "POSTGRESQL"}</span>
            <span>ข้อมูลอัปเดต: {formatUpdated(payload.lastUpdated, payload.timezone)}</span>
            <LocalDataStatus source={payload.source} editedAt={editedAt} warning={warning} hasOverrides={hasOverrides} timezone={payload.timezone} onReset={resetDemoData} />
          </div>
          <AcademicPeriodSelector availableYears={payload.availableAcademicYears} />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="page-content">
        <AcademicPeriodEmptyState hasData={payload.courses.length > 0} />
        <StorageWarning message={warning} /><StorageRecoveryPanel key={recovery?.raw} recovery={recovery} onRecover={recover} />
        <section className="intro-row">
          <div><p className="section-kicker">ภาพรวมการจัดการรายวิชา</p><h2>ภาพรวมวิชาเลือก</h2><p className="intro-copy">เห็นความพร้อม จำนวนที่นั่ง และงานที่ต้องติดตามก่อนเปิดสอน</p></div>
          <div className="intro-badges"><div className="data-note"><span className="note-icon" aria-hidden="true">i</span><span>{payload.isMock ? "Mock data · ใช้สำหรับ demo" : "ข้อมูลจาก PostgreSQL"} · {payload.dataset}</span></div><span className="scope-chip"><span className="scope-chip-label">ภาคการศึกษา</span>{scopeLabel}</span></div>
        </section>

        <PageSections />
      <section className="kpi-grid" aria-label="ตัวชี้วัดหลัก">
          <PriorityKpi label="ต้องติดตาม" count={followUps.length} counts={queueCountByKind} note="ดูรายการที่ต้องทำต่อ" pressed={onlyFollowUps} onClick={showFollowUps} />

          <article className="kpi-card blue">
            <div className="kpi-topline"><span className="kpi-label">รายวิชาทั้งหมด</span><span className="kpi-context">ตามตัวกรอง</span></div>
            <div className="kpi-value">{formatNumber(total)}</div>
            <div className="kpi-note">{hasActiveFilters ? `จากทั้งหมด ${formatNumber(courses.length)} รายวิชา` : "ในภาคการศึกษานี้"}</div>
          </article>

          <article className="kpi-card green">
            <div className="kpi-topline"><span className="kpi-label">เปิดสอน</span><span className="kpi-context">{openedRate}%</span></div>
            <div className="kpi-value">{formatNumber(opened)} / {formatNumber(total)}</div>
            <span className="kpi-progress" role="progressbar" aria-label="สัดส่วนรายวิชาที่เปิดสอน" aria-valuemin={0} aria-valuemax={100} aria-valuenow={openedRate}><i className="kpi-progress-fill green" style={{ width: `${openedRate}%` }} /></span>
            <div className="kpi-note">รายวิชาที่เปิดแล้ว</div>
          </article>

          <article className="kpi-card purple">
            <div className="kpi-topline"><span className="kpi-label">นิสิตลงทะเบียน</span><span className="kpi-context">{occupancy === null ? "ยังไม่ทราบอัตรา" : `${occupancy}%`}</span></div>
            <div className="kpi-value compact">{formatNumber(unknownCapacity ? knownEnrolled : enrolled)} / {formatNumber(capacity)}</div>
            <span className="kpi-progress" role="progressbar" aria-label="อัตราการใช้ที่นั่งรวม" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(occupancy ?? 0, 100)}><i className="kpi-progress-fill purple" style={{ width: `${Math.min(occupancy ?? 0, 100)}%` }} /></span>
            <div className="kpi-note">{unknownCapacity ? `เฉพาะวิชาที่ทราบจำนวนรับ · ลงทะเบียนทั้งหมด ${formatNumber(enrolled)} คน` : "คนลงทะเบียนจากที่นั่งทั้งหมด"}</div>
          </article>

          <article className="kpi-card orange">
            <div className="kpi-topline"><span className="kpi-label">ที่นั่งคงเหลือ</span><span className="kpi-context">รับเพิ่มได้</span></div>
            <div className="kpi-value">{formatNumber(remainingSeats)}</div>
            <div className="kpi-note">ที่นั่งว่างจากจำนวนที่ทราบ {formatNumber(capacity)}{unknownCapacity > 0 ? ` · ยังไม่ทราบจำนวนรับ ${unknownCapacity} วิชา` : ""}{overbooked > 0 ? ` · ลงเกินอีก ${formatNumber(overbooked)} คน` : ""}</div>
          </article>

        </section>

        <section id="dashboard-filters" tabIndex={-1} className="control-panel" aria-label="ตัวกรองข้อมูล">
          <div className="control-heading"><div><h3>ค้นหาและกรองข้อมูล</h3></div><button className="text-button" type="button" onClick={resetFilters} disabled={!hasActiveFilters}>ล้างตัวกรอง</button></div>
          <FilterFields activeCount={[category, status, workflowStatus].filter(value => value !== "all").length} search={<label className="search-field"><span>ค้นหารายวิชา บริษัท หรือผู้สอน</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="เช่น RAG, Soft Square, อาจารย์…" /></label>}>
            <label><span>หมวดหมู่</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">ทุกหมวดหมู่</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>สถานะรายวิชา</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option><option value="เปิดแล้ว">เปิดแล้ว</option><option value="พร้อมเปิด">พร้อมเปิด</option><option value="กำลังตรวจเอกสาร">กำลังตรวจเอกสาร</option><option value="รอเปิดรายวิชา">รอเปิดรายวิชา</option></select></label>
            <label><span>ความคืบหน้างาน</span><select value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value as WorkflowTaskStatus | "all")}><option value="all">ทุกสถานะงาน</option>{workflowStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </FilterFields>
          <ResultAnnouncer message={`พบ ${formatNumber(filteredCourses.length)} รายวิชาตามตัวกรองปัจจุบัน`} />
          <FilterSummary
            summary={hasActiveFilters
              ? `พบ ${formatNumber(filteredCourses.length)} รายวิชาตามตัวกรอง`
              : `แสดงทั้งหมด ${formatNumber(filteredCourses.length)} รายวิชา`}
            filters={[
              ...(query.trim() ? [{ label: "ค้นหา", value: query.trim(), onClear: () => setQuery("") }] : []),
              ...(category !== "all" ? [{ label: "หมวดหมู่", value: category, onClear: () => setCategory("all") }] : []),
              ...(status !== "all" ? [{ label: "สถานะรายวิชา", value: status, onClear: () => setStatus("all") }] : []),
              ...(workflowStatus !== "all" ? [{ label: "ความคืบหน้างาน", value: workflowStatusLabels[workflowStatus], onClear: () => setWorkflowStatus("all") }] : []),
              ...(readinessFilters.length > 0 ? [{ label: "ความพร้อมงาน", value: readinessFilters.map((key) => readinessOptions.find((item) => item.key === key)?.label).join(", "), onClear: () => setReadinessFilters([]) }] : []),
              ...(queueFilter !== "all" ? [{ label: "คิวติดตาม", value: QUEUE_META[queueFilter as QueueKind].label, onClear: () => setQueueFilter("all") }] : []),
              ...(onlyFollowUps ? [{ label: "เฉพาะรายการต้องติดตาม", onClear: () => setOnlyFollowUps(false) }] : []),
            ]}
          />
        </section>

        <section className="panel follow-up-panel" id="action-queue" tabIndex={-1} ref={actionQueueRef} aria-labelledby="action-queue-heading">
          <div className="panel-heading">
            <div><p className="section-kicker">งานที่ต้องทำ</p><h3 id="action-queue-heading">รายการที่ต้องติดตาม</h3></div>
            <div className="queue-heading-actions">
              {onlyFollowUps ? <button className="text-button" type="button" onClick={showAllCourses}>แสดงทั้งหมด</button> : null}
              <span className="count-chip">{followUps.length} รายการ</span>
            </div>
          </div>
          <QueueFilterGroup label="กรองระดับความเร่งด่วนของงานที่ต้องติดตาม" value={queueFilter} counts={queueCountByKind} total={followUps.length} onChange={setQueueFilter} />
          <div className="follow-up-list">{orderedFollowUps.length ? orderedFollowUps.map((course) => {
            const severity = queueSeverity(course);
            return <button className="follow-up-item" data-course-id={course.id} key={course.id} onClick={(event) => openCourse(course.id, event.currentTarget)} type="button">
              <span className={`follow-up-icon ${severity.className}`} aria-hidden="true">{severity.icon}</span>
              <span className="follow-up-copy"><span className={`follow-up-severity ${severity.className}`}>{severity.label}</span><strong>{course.title}</strong><small>{course.provider} · {firstIssue(course)}</small></span>
              <span className="chevron" aria-hidden="true">›</span>
            </button>;
          }) : <EmptyResult message="ไม่มีรายการที่ต้องติดตามตามตัวกรองปัจจุบัน" hasFilters={hasActiveFilters} onClear={resetFilters} />}</div>
        </section>

        <section id="dashboard-analysis" tabIndex={-1} className="analytics-grid">
          <article className="panel chart-panel"><div className="panel-heading"><div><p className="section-kicker">สัดส่วนหมวดหมู่</p><h3>รายวิชาแยกตามหมวดหมู่</h3></div><span className="panel-caption">จาก {formatNumber(total)} รายวิชา · กดแถบเพื่อกรอง</span></div><div className="bar-chart" aria-label="กราฟจำนวนรายวิชาแยกตามหมวดหมู่">{categoryCounts.length === 0 ? <EmptyResult message="ไม่มีรายวิชาให้แสดงตามตัวกรองปัจจุบัน" hasFilters={hasActiveFilters} onClear={resetFilters} /> : categoryCounts.map(([item, count]) => <button className={`bar-row ${category === item ? "is-active" : ""}`} key={item} type="button" onClick={() => setCategory(category === item ? "all" : item)} aria-pressed={category === item}><span className="bar-label"><span>{item}</span><strong>{formatNumber(count)} · {total ? Math.round((count / total) * 100) : 0}%</strong></span><span className="bar-track"><span className="bar-fill" style={{ width: `${(count / maxCategoryCount) * 100}%` }} /></span></button>)}</div></article>
          <article className="panel chart-panel"><div className="panel-heading"><div><p className="section-kicker">ความพร้อม</p><h3>ความพร้อมของงาน</h3></div><div className="readiness-heading-meta"><span className="panel-caption">{readinessFilters.length > 0 ? `จาก ${formatNumber(readinessScopeTotal)} รายวิชาก่อนกรองความพร้อม · กดแถบเพื่อกรอง` : `จาก ${formatNumber(readinessScopeTotal)} รายวิชา · กดแถบเพื่อกรอง`}</span>{readinessFilters.length > 0 ? <div className="selection-chip-list" aria-label="รายการ readiness ที่เลือก">{readinessFilters.map((selectedKey) => <button className="selection-chip" type="button" key={selectedKey} onClick={() => toggleReadinessFilter(selectedKey)} aria-label={`ยกเลิกการเลือก ${readinessOptions.find((item) => item.key === selectedKey)?.label}`}>เลือกแล้ว: {readinessOptions.find((item) => item.key === selectedKey)?.label} ×</button>)}<button className="selection-clear" type="button" onClick={() => setReadinessFilters([])}>ล้างการเลือก</button></div> : null}</div></div><div className="readiness-list" aria-label="สรุปความพร้อมของงาน">{readiness.map(([key, label, count, tone]) => <button className={`readiness-row ${readinessFilters.includes(key) ? "is-active" : ""}`} key={key} type="button" onClick={() => toggleReadinessFilter(key)} aria-pressed={readinessFilters.includes(key)}><span className="readiness-label"><span className={`legend-dot ${tone}`} /><span>{label}</span>{readinessFilters.includes(key) ? <em className="readiness-selected">เลือกแล้ว</em> : null}<strong>{count}</strong></span><span className="readiness-track"><span className={`readiness-fill ${tone}`} style={{ width: `${readinessScopeTotal ? (count / readinessScopeTotal) * 100 : 0}%` }} /></span><span className="readiness-percent">{readinessScopeTotal ? Math.round((count / readinessScopeTotal) * 100) : 0}%</span></button>)}</div></article>
        </section>

        <section id="dashboard-directory" tabIndex={-1} className="panel table-panel" aria-labelledby="course-directory-heading">
          <div className="panel-heading table-heading"><div><p className="section-kicker">รายการทั้งหมด</p><h3 id="course-directory-heading">ทะเบียนรายวิชา</h3></div><div className="table-heading-actions"><label className="table-sort"><span>เรียงตาม</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} aria-label="เรียงรายการรายวิชา"><option value="default">ลำดับเดิม</option><option value="course_status">สถานะรายวิชา</option><option value="occupancy">อัตราใช้ที่นั่งสูงสุด</option><option value="next_action">งานที่ต้องทำก่อน</option></select></label><span className="panel-caption">{formatNumber(filteredCourses.length)} รายการ</span></div></div>
          <div className="table-scroll-note">บนมือถือจะแสดงเป็นการ์ดพร้อมสถานะและงานถัดไป</div>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">ทะเบียนรายวิชาและสถานะการดำเนินงาน</caption>
              <thead><tr><th scope="col">รายวิชา</th><th scope="col">หมวดหมู่</th><th scope="col">บริษัท / ผู้สอน</th><th scope="col">วันและเวลา</th><th scope="col">ลงทะเบียน</th><th scope="col">สถานะ / ความพร้อม</th><th scope="col">งานถัดไป</th><th scope="col"><span className="sr-only">รายละเอียด</span></th></tr></thead>
              <tbody>{pagedCourses.length ? pagedCourses.map((course) => {
                const readinessState = operationalReadiness(course);
                const progress = workflowProgress(course);
                return <tr key={course.id}>
                  <td><button className="course-link" data-course-id={course.id} onClick={(event) => openCourse(course.id, event.currentTarget)} type="button"><span className="course-code">{course.courseCode} · ตอน {course.section}</span><strong>{course.title}</strong></button></td>
                  <td><span className="category-tag">{course.category}</span></td>
                  <td><span className="provider-name">{course.provider}</span><small>{course.instructor}</small></td>
                  <td><span className="schedule-text">{scheduleSummary(course)}</span><small>{deliveryModeLabels[course.deliveryMode]}</small></td>
                  <td><div className="enrollment-cell"><strong>{formatNumber(course.enrolled)} / {formatNumber(course.capacity)}</strong><span className="mini-progress" role="progressbar" aria-label={`อัตราใช้ที่นั่งของ ${course.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={courseOccupancy(course) === null ? undefined : Math.min(courseOccupancy(course)!, 100)} aria-valuetext={courseOccupancy(course) === null ? "ยังคำนวณอัตราไม่ได้" : `${courseOccupancy(course)}%`}><i style={{ width: `${Math.min(courseOccupancy(course) ?? 0, 100)}%` }} /></span></div></td>
                  <td><div className="status-stack"><select className={`status-select ${statusClass(course.status.course)}`} value={course.status.course} onChange={(event) => updateCourseStatus(course.id, event.target.value)} aria-label={`อัปเดตสถานะรายวิชา ${course.title}`}>{courseStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><span className={`status-pill status-pill-subtle ${readinessState.className}`}>งาน: {readinessState.label}</span></div></td>
                  <td><div className="workflow-next"><strong>{progress.complete}/{progress.total} เสร็จแล้ว</strong><small>{nextAction(course)}</small></div></td>
                  <td><button className="row-action" data-course-id={course.id} onClick={(event) => openCourse(course.id, event.currentTarget)} type="button" aria-label={`ดูรายละเอียด ${course.title}`}>รายละเอียด</button></td>
                </tr>;
              }) : <tr><td colSpan={8}><EmptyResult message="ไม่พบรายวิชาที่ตรงกับตัวกรอง" hasFilters={hasActiveFilters} onClear={resetFilters} /></td></tr>}</tbody>
            </table>
          </div>
          <div className="mobile-course-list" aria-label="ทะเบียนรายวิชาแบบมือถือ">
            {pagedCourses.length ? pagedCourses.map((course) => {
              const readinessState = operationalReadiness(course);
              const progress = workflowProgress(course);
              return <article className="mobile-course-card" key={course.id}>
                <div className="mobile-course-card-header"><button className="course-link mobile-course-link" data-course-id={course.id} onClick={(event) => openCourse(course.id, event.currentTarget)} type="button"><span className="course-code">{course.courseCode} · ตอน {course.section}</span><strong>{course.title}</strong></button><span className={`status-pill ${readinessState.className}`}>{readinessState.label}</span></div>
                <div className="mobile-course-meta"><span>{course.category}</span><span>{course.provider}</span><span>{course.instructor}</span></div>
                <div className="mobile-course-stats"><div><span>สถานะรายวิชา</span><select className={`status-select ${statusClass(course.status.course)}`} value={course.status.course} onChange={(event) => updateCourseStatus(course.id, event.target.value)} aria-label={`อัปเดตสถานะรายวิชา ${course.title}`}>{courseStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div><div><span>ลงทะเบียน</span><strong>{formatNumber(course.enrolled)} / {formatNumber(course.capacity)} คน</strong><span className="mini-progress" role="progressbar" aria-label={`อัตราใช้ที่นั่งของ ${course.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={courseOccupancy(course) === null ? undefined : Math.min(courseOccupancy(course)!, 100)} aria-valuetext={courseOccupancy(course) === null ? "ยังคำนวณอัตราไม่ได้" : `${courseOccupancy(course)}%`}><i style={{ width: `${Math.min(courseOccupancy(course) ?? 0, 100)}%` }} /></span></div></div>
                <div className="mobile-course-next"><span>งานถัดไป · {progress.complete}/{progress.total} เสร็จแล้ว</span><strong>{nextAction(course)}</strong></div>
                <button className="row-action mobile-detail-action" data-course-id={course.id} onClick={(event) => openCourse(course.id, event.currentTarget)} type="button" aria-label={`ดูรายละเอียด ${course.title}`}>ดูรายละเอียด</button>
              </article>;
            }) : <EmptyResult message="ไม่พบรายวิชาที่ตรงกับตัวกรอง" hasFilters={hasActiveFilters} onClear={resetFilters} />}
          </div>
          <Pager page={activePage} pageCount={pageCount} total={displayCourses.length} unit="รายวิชา" onChange={setPage} />
        </section>
      </main>

      {selectedCourse && <DeferredRecordDialog dialogRef={dialogRef} onClose={closeCourse}><CourseDialog key={selectedCourse.id} course={selectedCourse} isLive={payload.source === "postgresql"} dialogRef={dialogRef} onClose={closeCourse} onSave={saveCourse} /></DeferredRecordDialog>}
      <StatusToast toast={toast} onDismiss={dismissToast} onHold={holdTimer} onResume={resumeTimer} />
    </div>
  );
}
