"use client";

import { lazy, useDeferredValue, useMemo, useState } from "react";
import { DeferredRecordDialog } from "@/features/dashboard/components/deferred-record-dialog";
import { EmptyResult } from "@/features/dashboard/components/empty-result";
import { FilterFields } from "@/features/dashboard/components/filter-fields";
import { FilterSummary } from "@/features/dashboard/components/filter-summary";
import { LatestCompanyCase } from "@/features/dashboard/components/latest-company-case";
import { PAGE_SIZE, Pager } from "@/features/dashboard/components/pager";
import { ResultAnnouncer } from "@/features/dashboard/components/result-announcer";
import { companyKey } from "@/features/dashboard/lib/company-directory";
import { allowedValue } from "@/features/dashboard/lib/filter-values";
import { formatNumber } from "@/features/dashboard/lib/format";
import { filterApplications, scopeCompanies } from "@/features/dashboard/lib/internship-history";
import { CompanyEditDraft, FilterValue, gapLabel, mouStatusOptions, mouTone, RANK_LABELS, SortOption } from "@/features/dashboard/lib/internship-presentation";
import { applicationRanks, buildStats, INTAKE_META, type CompanyStats, type IntakeKind } from "@/features/dashboard/lib/internship-stats";
import { sortMouStatuses } from "@/features/dashboard/lib/mou-statuses";
import type { InternshipApplication, InternshipCompany, InternshipMouStatus, InternshipTrack } from "@/features/dashboard/lib/types";
import { useCompanyDirectory } from "@/features/dashboard/lib/use-company-directory";
import { useRecordDialog } from "@/features/dashboard/lib/use-record-dialog";
import { useUrlFilters } from "@/features/dashboard/lib/use-url-filters";

const CompanyDetailDialog = lazy(() => import("./internship-detail-dialog").then(module => ({ default: module.CompanyDetailDialog })));

/**
 * "ตารางข้อมูล" tab: the search/filter panel and the company register, moved
 * unchanged from the former single-page internship dashboard. It also owns the
 * query string, so `view` (the active sub-tab) is written alongside the filters.
 */
export function InternshipDirectory({ track, view, allCompanies, applications: allApplications, onMouStatus, onSave }: {
  track: InternshipTrack;
  view: string;
  allCompanies: InternshipCompany[];
  applications: InternshipApplication[];
  onMouStatus: (id: string, status: InternshipMouStatus) => void;
  onSave: (id: string, draft: CompanyEditDraft) => Promise<boolean>;
}) {
  const directory = useCompanyDirectory();
  const directoryById = useMemo(() => new Map(directory.items.map(c => [c.id, c])), [directory.items]);
  const sharedId = (id: string) => companyKey(track === "ฝึกงาน" ? "internship" : "cooperative", id);

  const [studyYear, setStudyYear] = useState("all");
  const [round, setRound] = useState("all");
  const scope = useMemo(() => ({ studyYear, round }), [studyYear, round]);
  const companies = useMemo(() => scopeCompanies(allCompanies, scope, track), [allCompanies, scope, track]);
  const applications = useMemo(() => filterApplications(allApplications, scope), [allApplications, scope]);
  const RANKS = useMemo(() => applicationRanks(applications), [applications]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [industryFilter, setIndustryFilter] = useState<FilterValue>("all");
  const [mouFilter, setMouFilter] = useState<FilterValue>("all");
  const [intakeFilter, setIntakeFilter] = useState<IntakeKind | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("demand");

  const allStats = useMemo(() => buildStats(companies, applications), [companies, applications]);
  const totalApplications = applications.length;
  const industries = useMemo(() => [...new Set(companies.map((company) => company.industry))].sort((left, right) => left.localeCompare(right, "th")), [companies]);
  const mouStatuses = useMemo(() => sortMouStatuses(companies.map((company) => company.mouStatus)), [companies]);

  const filteredStats = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    return allStats.filter((stats) => {
      const company = stats.company;
      const haystack = [company.name, company.shortName, company.industry, company.coordinator ?? "", ...company.positions.map((position) => position.name)].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (industryFilter !== "all" && company.industry !== industryFilter) return false;
      if (mouFilter !== "all" && company.mouStatus !== mouFilter) return false;
      if (intakeFilter !== "all" && stats.intake !== intakeFilter) return false;
      return true;
    });
  }, [allStats, deferredQuery, industryFilter, mouFilter, intakeFilter]);

  const displayStats = useMemo(() => {
    const sorted = [...filteredStats];
    const byName = (left: CompanyStats, right: CompanyStats) => left.company.name.localeCompare(right.company.name, "th");
    if (sortBy === "first_choice") sorted.sort((left, right) => right.firstPicks - left.firstPicks || right.totalPicks - left.totalPicks || byName(left, right));
    else if (sortBy === "shortfall") sorted.sort((left, right) => right.shortfall - left.shortfall || right.declared - left.declared || byName(left, right));
    else if (sortBy === "name") sorted.sort(byName);
    else sorted.sort((left, right) => right.totalPicks - left.totalPicks || right.firstPicks - left.firstPicks || byName(left, right));
    return sorted;
  }, [filteredStats, sortBy]);

  const total = filteredStats.length;
  const hasFilters = studyYear !== "all" || round !== "all" || Boolean(query.trim()) || industryFilter !== "all" || mouFilter !== "all" || intakeFilter !== "all";

  useUrlFilters({
    view: view === "overview" ? "" : view,
    studyYear: studyYear === "all" ? "" : studyYear,
    round: round === "all" ? "" : round,
    q: query.trim(),
    industry: industryFilter === "all" ? "" : industryFilter,
    mou: mouFilter === "all" ? "" : mouFilter,
    intake: intakeFilter === "all" ? "" : intakeFilter,
    sort: sortBy === "demand" ? "" : sortBy,
  }, (found) => {
    if (["1", "2", "3", "unknown"].includes(found.studyYear)) setStudyYear(found.studyYear);
    if (["1", "2", "unknown"].includes(found.round)) setRound(found.round);
    if (found.q) setQuery(found.q);
    if (found.industry) setIndustryFilter(found.industry);
    setMouFilter(allowedValue(found.mou, mouStatuses) ?? "all");
    setIntakeFilter(allowedValue(found.intake, Object.keys(INTAKE_META) as IntakeKind[]) ?? "all");
    setSortBy(allowedValue(found.sort, ["demand", "first_choice", "shortfall", "name"] as const) ?? "demand");
  });

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(displayStats.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pagedStats = pageCount > 1 ? displayStats.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE) : displayStats;
  // Any filter change returns the reader to the first page.
  const pageScope = JSON.stringify([studyYear, round, query, industryFilter, mouFilter, intakeFilter, sortBy]);
  const [previousPageScope, setPreviousPageScope] = useState(pageScope);
  if (previousPageScope !== pageScope) { setPreviousPageScope(pageScope); setPage(1); }

  const { selected: selectedCompany, dialogRef, open: openCompany, close: closeCompany } = useRecordDialog(companies);
  const selectedStats = useMemo(() => (selectedCompany ? allStats.find((stats) => stats.company.id === selectedCompany.id) ?? null : null), [allStats, selectedCompany]);
  const updateMouStatus = onMouStatus;
  const saveCompany = onSave;

  const resetFilters = () => {
    setStudyYear("all"); setRound("all"); setQuery("");
    setIndustryFilter("all"); setMouFilter("all"); setIntakeFilter("all");
  };

  return <>
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
            ]}
          />
        </section>

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
      {selectedCompany && <DeferredRecordDialog dialogRef={dialogRef} onClose={closeCompany}><CompanyDetailDialog key={selectedCompany.id} track={track} readOnlyIntake={studyYear !== "all" || round !== "all"} stats={selectedStats} dialogRef={dialogRef} totalApplications={totalApplications} onClose={closeCompany} onSave={saveCompany} /></DeferredRecordDialog>}
  </>;
}
