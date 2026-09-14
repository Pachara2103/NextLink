"use client";

import { AcademicPeriodEmptyState, AcademicPeriodSelector } from "@/features/dashboard/components/academic-period-selector";
import { FilterFields } from "@/features/dashboard/components/filter-fields";
import { PageSections } from "@/features/dashboard/components/page-sections";

import { buildStats, INTAKE_META, queueKind, applicationRanks, toCount, type CompanyStats, type IntakeKind } from "@/features/dashboard/lib/internship-stats";

import { AppNav, DashboardModuleNav } from "@/features/dashboard/components/app-nav";
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
import { isInternshipCompany } from "@/features/dashboard/lib/dataset-validation";
import { allowedValue, QUEUE_VALUES } from "@/features/dashboard/lib/filter-values";
import { formatNumber, formatUpdated, optionalValue } from "@/features/dashboard/lib/format";
import { CompanyEditDraft, FilterValue, gapLabel, mouStatusOptions, mouTone, Props, RANK_LABELS, SortOption } from "@/features/dashboard/lib/internship-presentation";
import { INTERNSHIP_TRACKS } from "@/features/dashboard/lib/internship-tracks";
import { sortMouStatuses } from "@/features/dashboard/lib/mou-statuses";
import { QUEUE_META, queueRank, type QueueKind } from "@/features/dashboard/lib/queue";
import type { InternshipMouStatus } from "@/features/dashboard/lib/types";
import { useAcademicPeriod } from '../lib/use-academic-period';
import { filterApplications, scopeCompanies, positionPopularity } from '../lib/internship-history';
import { InternshipEvaluations } from './internship-evaluations';
import { InternshipOutcomes } from './internship-outcomes';
import { LatestCompanyCase } from './latest-company-case';
import { companyKey } from '../lib/company-directory';
import { useCompanyDirectory } from '../lib/use-company-directory';
import { applicantSummary, countOpenings } from '../lib/internship-outcomes';
import { useLocalDataset } from "@/features/dashboard/lib/use-local-dataset";
import { useRecordDialog } from "@/features/dashboard/lib/use-record-dialog";
import { useUrlFilters } from "@/features/dashboard/lib/use-url-filters";
const CompanyDetailDialog = lazy(() => import("./internship-detail-dialog").then(module => ({ default: module.CompanyDetailDialog })));

export function InternshipDashboard({ payload }: Props) {
  const track = payload.track;
  const directory = useCompanyDirectory();
  const directoryById = useMemo(() => new Map(directory.items.map(c => [c.id, c])), [directory.items]);
  const sharedId = (id: string) => companyKey(track === 'ฝึกงาน' ? 'internship' : 'cooperative', id);
  const { items: allCompanies, update: updateCompanies, reset: resetCompanies, editedAt, ready, warning, hasOverrides, undo, recovery, recover } = useLocalDataset(INTERNSHIP_TRACKS[track].storageKey, payload.companies, isInternshipCompany);
  const { toast, show: showToast, dismiss: dismissToast, holdTimer, resumeTimer } = useStatusToast();

  const period = useAcademicPeriod();
  const [studyYear, setStudyYear] = useState("all");
  const [round, setRound] = useState("all");
  const scope = useMemo(() => ({ studyYear, round }), [studyYear, round]);
  const companies = useMemo(() => scopeCompanies(allCompanies, scope, track), [allCompanies, scope, track]);
  const applications = useMemo(() => filterApplications(payload.applications, scope), [payload.applications, scope]);
  const RANKS = useMemo(() => applicationRanks(applications), [applications]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [industryFilter, setIndustryFilter] = useState<FilterValue>("all");
  const [mouFilter, setMouFilter] = useState<FilterValue>("all");
  const [intakeFilter, setIntakeFilter] = useState<IntakeKind | "all">("all");
  const [queueFilter, setQueueFilter] = useState<QueueKind | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("demand");
  const queueRef = useRef<HTMLElement>(null);

  const allStats = useMemo(() => buildStats(companies, applications), [companies, applications]);
  const totalApplications = applications.length;

  const industries = useMemo(() => [...new Set(companies.map((company) => company.industry))].sort((left, right) => left.localeCompare(right, "th")), [companies]);
  const mouStatuses = useMemo(() => sortMouStatuses(companies.map((company) => company.mouStatus)), [companies]);

  const filteredStats = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    return allStats.filter((stats) => {
      const company = stats.company;
      const haystack = [company.name, company.shortName, company.industry, company.coordinator ?? "", ...company.positions.map((position) => position.name)]
        .join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (industryFilter !== "all" && company.industry !== industryFilter) return false;
      if (mouFilter !== "all" && company.mouStatus !== mouFilter) return false;
      if (intakeFilter !== "all" && stats.intake !== intakeFilter) return false;
      return true;
    });
  }, [allStats, deferredQuery, industryFilter, mouFilter, intakeFilter]);

  const displayStats = useMemo(() => {
    const sorted = filteredStats.filter((stats) => queueFilter === "all" || queueKind(stats) === queueFilter);
    const byName = (left: CompanyStats, right: CompanyStats) => left.company.name.localeCompare(right.company.name, "th");
    if (sortBy === "first_choice") sorted.sort((left, right) => right.firstPicks - left.firstPicks || right.totalPicks - left.totalPicks || byName(left, right));
    else if (sortBy === "shortfall") sorted.sort((left, right) => right.shortfall - left.shortfall || right.declared - left.declared || byName(left, right));
    else if (sortBy === "name") sorted.sort(byName);
    else sorted.sort((left, right) => right.totalPicks - left.totalPicks || right.firstPicks - left.firstPicks || byName(left, right));
    return sorted;
  }, [filteredStats, queueFilter, sortBy]);

  const filteredCompanies = useMemo(() => filteredStats.map(s => s.company), [filteredStats]);
  const applicants = applicantSummary(applications, new Set(filteredCompanies.map(c => c.id)));
  const openingCount = countOpenings(filteredCompanies);
  const total = filteredStats.length;
  const declaredTotal = filteredStats.reduce((sum, stats) => sum + stats.declared, 0);
  const acceptedTotal = filteredStats.reduce((sum, stats) => sum + stats.accepted, 0);
  const fillRate = declaredTotal ? Math.round((acceptedTotal / declaredTotal) * 100) : 0;
  const shortCompanies = filteredStats.filter((stats) => stats.shortfall > 0).length;
  const firstPicksTotal = filteredStats.reduce((sum, stats) => sum + stats.firstPicks, 0);
  const competition = declaredTotal ? firstPicksTotal / declaredTotal : 0;

  const followUps = useMemo(
    () => filteredStats
      .map((stats) => ({ stats, kind: queueKind(stats) }))
      .filter((entry): entry is { stats: CompanyStats; kind: QueueKind } => entry.kind !== null)
      .sort((left, right) => queueRank(left.kind) - queueRank(right.kind) || right.stats.declared - left.stats.declared),
    [filteredStats],
  );
  const queueCounts: Record<QueueKind, number> = {
    BLOCKED: followUps.filter((entry) => entry.kind === "BLOCKED").length,
    WAITING: followUps.filter((entry) => entry.kind === "WAITING").length,
    IN_PROGRESS: followUps.filter((entry) => entry.kind === "IN_PROGRESS").length,
  };

  const shownFollowUps = followUps.filter((entry) => queueFilter === "all" || entry.kind === queueFilter);

  const rankBoard = useMemo(() => [...filteredStats].sort((left, right) => right.totalPicks - left.totalPicks || right.firstPicks - left.firstPicks).slice(0, 10), [filteredStats]);
  const maxPicks = Math.max(...rankBoard.map((stats) => stats.totalPicks), 1);
  const shownPicks = filteredStats.reduce((sum, stats) => sum + stats.totalPicks, 0);

  const intakeBoard = useMemo(() => [...filteredStats].sort((left, right) => right.shortfall - left.shortfall || right.declared - left.declared).slice(0, 10), [filteredStats]);
  const maxSeats = Math.max(...intakeBoard.flatMap((stats) => [stats.declared, stats.accepted]), 1);

  const hasFilters = studyYear !== "all" || round !== "all" || Boolean(query.trim()) || industryFilter !== "all" || mouFilter !== "all" || intakeFilter !== "all" || queueFilter !== "all";

  useUrlFilters({
    studyYear: studyYear === "all" ? "" : studyYear,
    round: round === "all" ? "" : round,
    q: query.trim(),
    industry: industryFilter === "all" ? "" : industryFilter,
    mou: mouFilter === "all" ? "" : mouFilter,
    intake: intakeFilter === "all" ? "" : intakeFilter,
    queue: queueFilter === "all" ? "" : queueFilter,
    sort: sortBy === "demand" ? "" : sortBy,
  }, (found) => {
    if (["1", "2", "3", "unknown"].includes(found.studyYear)) setStudyYear(found.studyYear);
    if (["1", "2", "unknown"].includes(found.round)) setRound(found.round);
    if (found.q) setQuery(found.q);
    if (found.industry) setIndustryFilter(found.industry);
    setMouFilter(allowedValue(found.mou, mouStatuses) ?? "all");
    setIntakeFilter(allowedValue(found.intake, Object.keys(INTAKE_META) as IntakeKind[]) ?? "all");
    setQueueFilter(allowedValue(found.queue, QUEUE_VALUES) ?? "all");
    setSortBy(allowedValue(found.sort, ["demand", "first_choice", "shortfall", "name"] as const) ?? "demand");
  });

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(displayStats.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pagedStats = pageCount > 1 ? displayStats.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE) : displayStats;

  // Any change to the filters puts the reader back at the first page; without
  // this a narrowed result set can land on a page that no longer exists.
  // Reset before committing a new filter view, without a second effect render.
  const pageScope = JSON.stringify([studyYear, round, query, industryFilter, mouFilter, intakeFilter, queueFilter, sortBy]);
  const [previousPageScope, setPreviousPageScope] = useState(pageScope);
  if (previousPageScope !== pageScope) { setPreviousPageScope(pageScope); setPage(1); }

  const { selected: selectedCompany, dialogRef, open: openCompany, close: closeCompany } = useRecordDialog(companies);
  const selectedStats = useMemo(
    () => (selectedCompany ? allStats.find((stats) => stats.company.id === selectedCompany.id) ?? null : null),
    [allStats, selectedCompany],
  );

  const resetFilters = () => {
    setStudyYear("all"); setRound("all");
    setQuery("");
    setIndustryFilter("all");
    setMouFilter("all");
    setIntakeFilter("all");
    setQueueFilter("all");
  };

  const showFollowUps = () => {
    setQueueFilter("all");
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateMouStatus = async (id: string, nextStatus: InternshipMouStatus) => {
    const company = companies.find((item) => item.id === id);
    if (!company || company.mouStatus === nextStatus) return;
    if (!await updateCompanies((current) => current.map((item) => (item.id === id ? { ...item, mouStatus: nextStatus } : item)))) { showToast("บันทึกสถานะไม่ได้ กรุณาตรวจข้อมูลล่าสุด"); return; }
    showToast(`${company.shortName} · สถานะ MOU เป็น "${nextStatus}"`, undo);
  };

  const saveCompany = async (id: string, draft: CompanyEditDraft) => {
    return updateCompanies((current) => current.map((item) => (item.id === id ? {
      ...item,
      name: draft.name.trim() || item.name,
      shortName: draft.shortName.trim() || item.shortName,
      industry: draft.industry.trim() || item.industry,
      coordinator: optionalValue(draft.coordinator),
      note: optionalValue(draft.note),
      positions: draft.positions.map((position, index) => ({
        ...item.positions[index],
        name: position.name.trim() || item.positions[index]?.name || `ตำแหน่งที่ ${index + 1}`,
        declaredIntake: toCount(position.declaredIntake),
        accepted: toCount(position.accepted),
      })),
    } : item)));
  };

  const resetDemoData = async () => {
    if (!window.confirm(`คืนค่าข้อมูล${track}ตั้งต้นและลบการแก้ไขของหน้านี้ในเบราว์เซอร์หรือไม่?`)) return;
    const persisted = await resetCompanies();
    showToast(persisted ? "คืนค่าข้อมูลตั้งต้นแล้ว" : "คืนค่าไม่ได้ ข้อมูลเดิมยังอยู่");
  };

  return (
    <div className="app-shell internship-shell" data-track={track} data-ready={ready}>
      <header className="topbar">
        <AppNav title={track} />
        <div className="header-tools">
          <div className="header-meta">
            <span>{payload.isMock ? "ข้อมูลตัวอย่าง ณ" : "ข้อมูลอัปเดต:"} {formatUpdated(payload.lastUpdated, payload.timezone)}</span>
            <LocalDataStatus editedAt={editedAt} warning={warning} hasOverrides={hasOverrides} timezone={payload.timezone} onReset={resetDemoData} />
          </div>
          <AcademicPeriodSelector />
        </div>
      </header>
      <DashboardModuleNav />

      <main id="main-content" tabIndex={-1} className="page-content">
        <AcademicPeriodEmptyState hasData={payload.companies.length > 0} />
        <StorageWarning message={warning} /><StorageRecoveryPanel key={recovery?.raw} recovery={recovery} onRecover={recover} />
        <section className="intro-row">
          <div><p className="section-kicker">การรับนิสิตเข้าร่วมงาน</p><h2>ภาพรวมบริษัทรับ{track}</h2><p className="intro-copy">เห็นอันดับที่นิสิตเลือก จำนวนที่บริษัทแจ้งว่าจะรับ และจำนวนที่รับตามทะเบียน</p></div>
          <div className="intro-badges"><span className="scope-chip"><span className="scope-chip-label">{track}</span>{formatNumber(totalApplications)} ใบสมัคร · อันดับที่พบ {RANKS.length ? RANKS.join(", ") : "ยังไม่มี"}</span></div>
        </section>

        <PageSections />
      <section className="kpi-grid" aria-label="ตัวชี้วัดการรับนิสิตของบริษัท">
          <PriorityKpi label="ต้องติดตาม" count={followUps.length} counts={queueCounts} note="ดูรายการที่ต้องทำต่อ" onClick={showFollowUps} />
          <article className="kpi-card blue"><div className="kpi-topline"><span className="kpi-label">บริษัทที่เปิดรับ</span><span className="kpi-context">ตามตัวกรอง</span></div><div className="kpi-value">{formatNumber(total)}</div><div className="kpi-note">แห่งที่อยู่ในรอบนี้</div></article>
          <article className="kpi-card blue" data-kpi="unique-applicants"><div className="kpi-topline"><span className="kpi-label">นิสิตที่สมัคร (ไม่ซ้ำ)</span></div><div className="kpi-value">{applicants.unidentified ? '≥ ' : ''}{formatNumber(applicants.people)}</div><div className="kpi-note">จาก {formatNumber(applicants.applications)} ใบสมัคร · นับคนเดิมข้ามรอบครั้งเดียว{applicants.unidentified > 0 && ` · ไม่ทราบรหัส ${applicants.unidentified} ใบสมัคร`}</div></article>
          <article className="kpi-card purple" data-kpi="openings"><div className="kpi-topline"><span className="kpi-label">ตำแหน่งทั้งหมด</span></div><div className="kpi-value">{formatNumber(openingCount)}</div><div className="kpi-note">ของบริษัทตามตัวกรอง รวมตำแหน่งที่ยังไม่มีคนรับ</div></article>
          <article className="kpi-card green"><div className="kpi-topline"><span className="kpi-label">รับตามทะเบียน</span><span className="kpi-context">{fillRate}%</span></div><div className="kpi-value">{formatNumber(acceptedTotal)} / {formatNumber(declaredTotal)}</div><span className="kpi-progress" role="progressbar" aria-label="สัดส่วนที่รับตามทะเบียนเทียบกับที่แจ้งไว้" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(fillRate, 100)}><i className="kpi-progress-fill green" style={{ width: `${Math.min(fillRate, 100)}%` }} /></span><div className="kpi-note">{shortCompanies} บริษัทยังรับไม่ครบ</div></article>
          <article className="kpi-card purple"><div className="kpi-topline"><span className="kpi-label">ที่นั่งที่แจ้งจะรับ</span><span className="kpi-context">ทุกตำแหน่ง</span></div><div className="kpi-value">{formatNumber(declaredTotal)}</div><div className="kpi-note">จำนวนที่บริษัทแจ้งไว้ตอนเปิดรอบ</div></article>
          <article className="kpi-card orange"><div className="kpi-topline"><span className="kpi-label">การแข่งขันอันดับ 1</span><span className="kpi-context">ต่อที่นั่ง</span></div><div className="kpi-value">{competition.toFixed(1)}</div><div className="kpi-note">{formatNumber(firstPicksTotal)} ใบสมัครเลือกเป็นอันดับ 1</div></article>
        </section>

        <section id="dashboard-filters" tabIndex={-1} className="control-panel" aria-label="ตัวกรองข้อมูลบริษัท">
          <div className="control-heading"><div><h3>ค้นหาและกรองข้อมูล</h3></div><button className="text-button" type="button" onClick={resetFilters} disabled={!hasFilters}>ล้างตัวกรอง</button></div>
          <FilterFields activeCount={[studyYear, round, industryFilter, mouFilter, intakeFilter].filter(value => value !== "all").length} search={<label className="search-field"><span>ค้นหาบริษัท ตำแหน่ง หรือผู้ประสานงาน</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="เช่น Mock Cloud, Data Engineering, ผู้ประสานงานจำลอง 01…" /></label>}>
            <label><span>ประเภทธุรกิจ</span><select value={industryFilter} onChange={(event) => setIndustryFilter(event.target.value)}><option value="all">ทุกประเภท</option>{industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select></label>
            <label><span>ชั้นปีนิสิต</span><select value={studyYear} onChange={event => setStudyYear(event.target.value)}><option value="all">ทุกชั้นปี</option>{[1, 2, 3].map(y => <option key={y} value={y}>ปี {y}</option>)}<option value="unknown">ยังไม่ทราบชั้นปี</option></select></label>
            <label><span>รอบสมัคร</span><select value={round} onChange={event => setRound(event.target.value)}><option value="all">ทุกรอบ</option><option value="1">รอบ 1</option><option value="2">รอบ 2</option><option value="unknown">ยังไม่ทราบรอบ</option></select></label>
            <label><span>สถานะ MOU</span><select value={mouFilter} onChange={(event) => setMouFilter(event.target.value)}><option value="all">ทุกสถานะ</option>{mouStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label><span>ผลการรับ</span><select value={intakeFilter} onChange={(event) => setIntakeFilter(event.target.value as IntakeKind | "all")}><option value="all">ทุกผลการรับ</option>{(Object.keys(INTAKE_META) as IntakeKind[]).map((kind) => <option key={kind} value={kind}>{INTAKE_META[kind].label}</option>)}</select></label>
          </FilterFields>
          <ResultAnnouncer message={`พบ ${formatNumber(total)} บริษัทตามตัวกรองปัจจุบัน`} />
          <FilterSummary
            summary={`แสดง ${formatNumber(total)} จาก ${formatNumber(companies.length)} บริษัท`}
            filters={[
              ...(query.trim() ? [{ label: "ค้นหา", value: query.trim(), onClear: () => setQuery("") }] : []),
              ...(industryFilter !== "all" ? [{ label: "ประเภทธุรกิจ", value: industryFilter, onClear: () => setIndustryFilter("all") }] : []),
              ...(mouFilter !== "all" ? [{ label: "สถานะ MOU", value: mouFilter, onClear: () => setMouFilter("all") }] : []),
              ...(intakeFilter !== "all" ? [{ label: "ผลการรับ", value: INTAKE_META[intakeFilter].label, onClear: () => setIntakeFilter("all") }] : []),
              ...(queueFilter !== "all" ? [{ label: "คิวติดตาม", value: QUEUE_META[queueFilter].label, onClear: () => setQueueFilter("all") }] : []),
            ]}
          />
        </section>

        <section id="action-queue" tabIndex={-1} className="panel follow-up-panel" ref={queueRef} aria-labelledby="internship-queue-heading">
          <div className="panel-heading"><div><p className="section-kicker">งานที่ต้องทำ</p><h3 id="internship-queue-heading">บริษัทที่ต้องติดตาม</h3></div><span className="count-chip">{formatNumber(followUps.length)} รายการ</span></div>
          <QueueFilterGroup label="กรองระดับความเร่งด่วนของบริษัทที่ต้องติดตาม" value={queueFilter} counts={queueCounts} total={followUps.length} onChange={setQueueFilter} />
          <div className="follow-up-list internship-follow-up-list">
            {shownFollowUps.length ? shownFollowUps.map(({ stats, kind }) => {
              const meta = QUEUE_META[kind];
              return (
                <button className="follow-up-item" key={stats.company.id} type="button" onClick={(event) => openCompany(stats.company.id, event.currentTarget)}>
                  <span className={`follow-up-icon ${meta.className}`} aria-hidden="true">{meta.icon}</span>
                  <span className="follow-up-copy">
                    <span className={`follow-up-severity ${meta.className}`}>{meta.label}</span>
                    <strong>{stats.company.shortName}</strong>
                    <small>{INTAKE_META[stats.intake].label} · แจ้ง {formatNumber(stats.declared)} รับตามทะเบียน {formatNumber(stats.accepted)}</small>
                  </span>
                  <span className="chevron" aria-hidden="true">›</span>
                </button>
              );
            }) : <EmptyResult message="ไม่มีบริษัทที่ต้องติดตามตามตัวกรองปัจจุบัน" hasFilters={hasFilters} onClear={resetFilters} />}
          </div>
        </section>

        <section id="dashboard-analysis" tabIndex={-1} className="analytics-grid">
          <article className="panel chart-panel">
            <div className="panel-heading"><div><p className="section-kicker">สัดส่วนอันดับ</p><h3>Top 10 บริษัทที่ถูกเลือกมากที่สุด</h3></div><span className="panel-caption">จาก {formatNumber(shownPicks)} การเลือก · กดแถบเพื่อดูรายละเอียด</span></div>
            <ul className="rank-legend">{RANKS.map((rank) => <li key={rank}><span className={`rank-key rank-${rank}`} aria-hidden="true" />{RANK_LABELS[rank] ?? `อันดับ ${rank}`}</li>)}</ul>
            <div className="bar-chart">
              {rankBoard.length ? rankBoard.map((stats) => (
                <button className="bar-row" key={stats.company.id} type="button" onClick={(event) => openCompany(stats.company.id, event.currentTarget)} aria-label={`${stats.company.shortName} ถูกเลือก ${stats.totalPicks} ครั้ง เป็นอันดับ 1 จำนวน ${stats.firstPicks} ใบสมัคร`}>
                  <span className="bar-label"><span>{stats.company.shortName}</span><strong>{formatNumber(stats.totalPicks)} ครั้ง · อันดับ 1: {formatNumber(stats.firstPicks)}</strong></span>
                  <span className="bar-track rank-stack">
                    {RANKS.map((rank) => (stats.picksByRank[rank] ? <span className={`rank-segment rank-${rank}`} key={rank} style={{ width: `${(stats.picksByRank[rank] / maxPicks) * 100}%` }} /> : null))}
                  </span>
                </button>
              )) : <EmptyResult message="ไม่มีบริษัทที่ตรงกับตัวกรอง" hasFilters={hasFilters} onClear={resetFilters} />}
            </div>
          </article>

          <article className="panel chart-panel">
            <div className="panel-heading"><div><p className="section-kicker">ความครบถ้วน</p><h3>บริษัทที่รับไม่ครบมากที่สุด</h3></div><span className="panel-caption">รับตามทะเบียน {formatNumber(acceptedTotal)} จาก {formatNumber(declaredTotal)} ที่นั่ง · กดแถบเพื่อดูรายละเอียด</span></div>
            <ul className="rank-legend"><li><span className="rank-key intake-key-declared" aria-hidden="true" />แจ้งจะรับ</li><li><span className="rank-key intake-key-accepted" aria-hidden="true" />รับตามทะเบียน</li></ul>
            <div className="bar-chart">
              {intakeBoard.length ? intakeBoard.map((stats) => (
                <button className="bar-row" key={stats.company.id} type="button" onClick={(event) => openCompany(stats.company.id, event.currentTarget)} aria-label={`${stats.company.shortName} แจ้งจะรับ ${stats.declared} คน รับตามทะเบียน ${stats.accepted} คน`}>
                  <span className="bar-label"><span>{stats.company.shortName}</span><strong>{formatNumber(stats.accepted)} / {formatNumber(stats.declared)} · {gapLabel(stats)}</strong></span>
                  <span className="bar-track intake-track">
                    <span className="intake-declared" style={{ width: `${(stats.declared / maxSeats) * 100}%` }} />
                    <span className="intake-accepted" style={{ width: `${(stats.accepted / maxSeats) * 100}%` }} />
                  </span>
                </button>
              )) : <EmptyResult message="ไม่มีบริษัทที่ตรงกับตัวกรอง" hasFilters={hasFilters} onClear={resetFilters} />}
            </div>
          </article>
        </section>

        <section className="panel insight-panel" aria-labelledby="position-ranking-title">
        <div className="panel-heading"><div><p className="section-kicker">ความสนใจแยกตำแหน่ง</p><h3 id="position-ranking-title">Top 10 ตำแหน่งที่ถูกเลือกมากที่สุด</h3></div><span className="panel-caption">ตามตัวกรอง · นับทุกอันดับที่มีข้อมูล</span></div>
        <ol className="insight-ranking">{positionPopularity(filteredStats.map(s => s.company), applications).filter(p => p.picks > 0).slice(0, 10).map(p => <li key={p.id}><button type="button" onClick={event => openCompany(p.companyId, event.currentTarget)}><strong>{p.title}</strong><span>{p.company}</span><span>{p.picks} การเลือก · {p.unidentified ? '≥ ' : ''}{p.people} คน{p.unidentified > 0 && ` (ไม่ทราบรหัส ${p.unidentified} การเลือก)`} · อันดับ 1: {p.first}</span></button></li>)}</ol>
        {!applications.length && <p className="empty-state">ยังไม่มีการสมัครในขอบเขตนี้</p>}
      </section>
      <InternshipOutcomes seed={payload.outcomes} allCompanies={allCompanies} companies={filteredCompanies} scope={scope} track={track} />
      <InternshipEvaluations companies={filteredStats.map(s => s.company)} period={period} track={track} scope={scope} />
      <section id="dashboard-directory" tabIndex={-1} className="panel table-panel" aria-labelledby="internship-directory-heading">
          <div className="panel-heading table-heading">
            <div><p className="section-kicker">รายการทั้งหมด</p><h3 id="internship-directory-heading">ทะเบียนบริษัทรับ{track}</h3></div>
            <div className="table-heading-actions">
              <label className="table-sort"><span>เรียงตาม</span>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} aria-label="เรียงรายการบริษัท">
                  <option value="demand">ถูกเลือกมากที่สุด</option>
                  <option value="first_choice">อันดับ 1 มากที่สุด</option>
                  <option value="shortfall">รับขาดมากที่สุด</option>
                  <option value="name">ชื่อบริษัท</option>
                </select>
              </label>
              <span className="panel-caption">{total} รายการ</span>
            </div>
          </div>

          <div className="table-scroll-note">บนมือถือจะแสดงเป็นการ์ดพร้อมสถานะและงานถัดไป</div>
          <div className="table-wrap">
            <table className="internship-table">
              <caption className="sr-only">ทะเบียนบริษัทรับ{track}พร้อมอันดับที่นิสิตเลือกและจำนวนที่รับตามทะเบียน</caption>
              <thead><tr>
                <th scope="col">บริษัท</th>
                <th scope="col">MOU</th>
                <th scope="col">นิสิตเลือก</th>
                <th scope="col">อันดับ 1</th>
                <th scope="col">แจ้งจะรับ</th>
                <th scope="col">รับตามทะเบียน</th>
                <th scope="col">ผลการรับ</th>
                <th scope="col"><span className="sr-only">รายละเอียด</span></th>
              </tr></thead>
              <tbody>
                {pagedStats.length ? pagedStats.map((stats) => (
                  <tr key={stats.company.id}>
                    <td>
                      <button className="course-link" type="button" onClick={(event) => openCompany(stats.company.id, event.currentTarget)}>
                        <span className="course-code">{stats.company.shortName} · แถวที่ {stats.company.rowNumber}</span>
                        <strong>{stats.company.name}</strong>
                        <small>{stats.company.industry}</small>
                      </button>
                      <LatestCompanyCase company={directoryById.get(sharedId(stats.company.id))} companyId={sharedId(stats.company.id)} ready={directory.ready} warning={directory.warning} />
                    </td>
                    <td>
                      <select className={`status-select status-pill ${mouTone(stats.company.mouStatus)}`} value={stats.company.mouStatus} onChange={(event) => updateMouStatus(stats.company.id, event.target.value as InternshipMouStatus)} aria-label={`อัปเดตสถานะ MOU ของ ${stats.company.shortName}`}>
                        {mouStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="picks-cell">
                        <strong>{formatNumber(stats.totalPicks)}</strong>
                        <span className="bar-track rank-stack" role="img" aria-label={RANKS.map((rank) => `${RANK_LABELS[rank] ?? `อันดับ ${rank}`} ${stats.picksByRank[rank]} ใบสมัคร`).join(", ")}>
                          {RANKS.map((rank) => (stats.picksByRank[rank] ? <span className={`rank-segment rank-${rank}`} key={rank} style={{ width: `${(stats.picksByRank[rank] / Math.max(stats.totalPicks, 1)) * 100}%` }} /> : null))}
                        </span>
                      </div>
                    </td>
                    <td><span className="seat-count">{formatNumber(stats.firstPicks)}</span><small>{totalApplications ? Math.round((stats.firstPicks / totalApplications) * 100) : 0}% ของใบสมัคร</small></td>
                    <td><span className="seat-count">{formatNumber(stats.declared)}</span><small>{stats.company.positions.length} ตำแหน่ง</small></td>
                    <td><span className="seat-count">{formatNumber(stats.accepted)}</span><small>{stats.declared ? `${stats.fillRate}% ของที่แจ้ง` : "ยังไม่แจ้งจำนวน"}</small></td>
                    <td><span className={`status-pill ${INTAKE_META[stats.intake].tone}`}>{INTAKE_META[stats.intake].label}</span><small>{gapLabel(stats)}</small></td>
                    <td><button className="row-action" type="button" onClick={(event) => openCompany(stats.company.id, event.currentTarget)} aria-label={`ดูรายละเอียดของ ${stats.company.shortName}`}>รายละเอียด</button></td>
                  </tr>
                )) : <tr><td colSpan={8}><EmptyResult message="ไม่พบบริษัทที่ตรงกับตัวกรอง" hasFilters={hasFilters} onClear={resetFilters} /></td></tr>}
              </tbody>
            </table>
          </div>

          <div className="mobile-course-list internship-mobile-list">
            {pagedStats.length ? pagedStats.map((stats) => (
              <article className="mobile-course-card" key={stats.company.id}>
                <div className="mobile-course-card-header">
                  <button className="course-link mobile-course-link" type="button" onClick={(event) => openCompany(stats.company.id, event.currentTarget)}>
                    <span className="course-code">{stats.company.shortName} · {stats.company.industry}</span>
                    <strong>{stats.company.name}</strong>
                  </button>
                  <label className="mobile-status-field"><span>สถานะ MOU</span>
                    <select className={`status-select status-pill ${mouTone(stats.company.mouStatus)}`} value={stats.company.mouStatus} onChange={(event) => updateMouStatus(stats.company.id, event.target.value as InternshipMouStatus)} aria-label={`อัปเดตสถานะ MOU ของ ${stats.company.shortName}`}>
                      {mouStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <LatestCompanyCase company={directoryById.get(sharedId(stats.company.id))} companyId={sharedId(stats.company.id)} ready={directory.ready} warning={directory.warning} />
                <div className="mobile-course-meta"><span>นิสิตเลือก {formatNumber(stats.totalPicks)} ครั้ง</span><span>อันดับ 1: {formatNumber(stats.firstPicks)} ใบสมัคร</span></div>
                <span className="bar-track rank-stack" role="img" aria-label={RANKS.map((rank) => `${RANK_LABELS[rank] ?? `อันดับ ${rank}`} ${stats.picksByRank[rank]} ใบสมัคร`).join(", ")}>
                  {RANKS.map((rank) => (stats.picksByRank[rank] ? <span className={`rank-segment rank-${rank}`} key={rank} style={{ width: `${(stats.picksByRank[rank] / Math.max(stats.totalPicks, 1)) * 100}%` }} /> : null))}
                </span>
                <div className="mobile-course-next"><span>แจ้งจะรับ / รับตามทะเบียน</span><strong>{formatNumber(stats.declared)} → {formatNumber(stats.accepted)} · {gapLabel(stats)}</strong></div>
                <button className="row-action mobile-detail-action" type="button" onClick={(event) => openCompany(stats.company.id, event.currentTarget)} aria-label={`ดูรายละเอียดของ ${stats.company.shortName}`}>ดูรายละเอียด</button>
              </article>
            )) : <EmptyResult message="ไม่พบบริษัทที่ตรงกับตัวกรอง" hasFilters={hasFilters} onClear={resetFilters} />}
          </div>

          <Pager page={activePage} pageCount={pageCount} total={displayStats.length} unit="บริษัท" onChange={setPage} />
        </section>
      </main>

      {selectedCompany && <DeferredRecordDialog dialogRef={dialogRef} onClose={closeCompany}><CompanyDetailDialog key={selectedCompany.id} track={track} readOnlyIntake={studyYear !== "all" || round !== "all"} stats={selectedStats} dialogRef={dialogRef} totalApplications={totalApplications} onClose={closeCompany} onSave={saveCompany} /></DeferredRecordDialog>}
      <StatusToast toast={toast} onDismiss={dismissToast} onHold={holdTimer} onResume={resumeTimer} />
    </div>
  );
}
