"use client";

import { AcademicPeriodEmptyState, AcademicPeriodSelector } from "@/features/dashboard/components/academic-period-selector";
import { FilterFields } from "@/features/dashboard/components/filter-fields";
import { PageSections } from "@/features/dashboard/components/page-sections";

import { isPending, isSigned, nextAction, queueKind } from "@/features/dashboard/lib/mou-stats";

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
import { isMouCompany } from "@/features/dashboard/lib/dataset-validation";
import { allowedValue, QUEUE_VALUES } from "@/features/dashboard/lib/filter-values";
import { display, formatNumber, formatUpdated } from "@/features/dashboard/lib/format";
import { authorizationStatusOptions, FilterValue, MouEditDraft, mouStorageKey, optionalMouValue, Props, SortOption, statusClass } from "@/features/dashboard/lib/mou-presentation";
import { MOU_DOCUMENT_STATUSES, sortMouStatuses } from "@/features/dashboard/lib/mou-statuses";
import { QUEUE_META, queueRank, type QueueKind } from "@/features/dashboard/lib/queue";
import type { MouCompany } from "@/features/dashboard/lib/types";
import { useLocalDataset } from "@/features/dashboard/lib/use-local-dataset";
import { useRecordDialog } from "@/features/dashboard/lib/use-record-dialog";
import { useUrlFilters } from "@/features/dashboard/lib/use-url-filters";
const MouDetailDialog = lazy(() => import("./mou-detail-dialog").then(module => ({ default: module.MouDetailDialog })));

export function MouDashboard({ payload }: Props) {
  const { items: companies, update: updateCompanies, reset: resetCompanies, editedAt, ready, warning, hasOverrides, undo, recovery, recover } = useLocalDataset(mouStorageKey, payload.companies, isMouCompany);
  const { selected: selectedCompany, dialogRef, open: openCompany, close: closeCompany } = useRecordDialog(companies);
  const { toast, show: showToast, dismiss: dismissToast, holdTimer, resumeTimer } = useStatusToast();
  const [query, setQuery] = useState("");
  // Typing stays responsive as the row count grows; the list catches up.
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<FilterValue>("all");
  const [templateFilter, setTemplateFilter] = useState<FilterValue>("all");
  const [revisedFilter, setRevisedFilter] = useState<FilterValue>("all");
  const [queueFilter, setQueueFilter] = useState<QueueKind | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");

  const statuses = useMemo(() => sortMouStatuses([...MOU_DOCUMENT_STATUSES, ...companies.map((company) => company.documentStatus)]), [companies]);
  const authorizationStatuses = useMemo(() => [...new Set([
    ...authorizationStatusOptions,
    ...companies.map((company) => company.authorizationStatus).filter((value): value is string => Boolean(value)),
  ])], [companies]);
  const templates = useMemo(() => [...new Set(companies.map((company) => company.template).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "th")), [companies]);

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return companies.filter((company) => {
      const searchable = [company.companyThai, company.companyEnglish, ...company.shortNames, company.coordinator, company.documentStatus, company.template, company.revisionRequest, company.legalReviewResult, company.authorizationRequest, company.authorizationStatus].filter(Boolean).join(" ").toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || company.documentStatus === statusFilter;
      const matchesTemplate = templateFilter === "all" || company.template === templateFilter;
      const matchesRevised = revisedFilter === "all" || company.revised === revisedFilter;
      const matchesQueue = queueFilter === "all" || (isPending(company) && queueKind(company) === queueFilter);
      return matchesQuery && matchesStatus && matchesTemplate && matchesRevised && matchesQueue;
    });
  }, [companies, deferredQuery, queueFilter, revisedFilter, statusFilter, templateFilter]);

  const total = filteredCompanies.length;
  const signed = filteredCompanies.filter(isSigned).length;
  const queueRef = useRef<HTMLElement>(null);
  const pending = filteredCompanies.filter(isPending);
  const revised = filteredCompanies.filter((company) => company.revised === "Y").length;
  const authorizationDone = filteredCompanies.filter((company) => company.authorizationStatus === "มอบอำนาจแล้ว").length;
  const signedRate = total ? Math.round((signed / total) * 100) : 0;
  const statusCounts = statuses.map((status) => [status, filteredCompanies.filter((company) => company.documentStatus === status).length] as const).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
  const maxStatusCount = Math.max(...statusCounts.map(([, count]) => count), 1);
  const queueCounts: Record<QueueKind, number> = {
    BLOCKED: pending.filter((company) => queueKind(company) === "BLOCKED").length,
    WAITING: pending.filter((company) => queueKind(company) === "WAITING").length,
    IN_PROGRESS: pending.filter((company) => queueKind(company) === "IN_PROGRESS").length,
  };
  const queueCompanies = [...pending].sort((left, right) => {
    const rank = (company: MouCompany) => queueRank(queueKind(company));
    return rank(left) - rank(right) || left.companyThai.localeCompare(right.companyThai, "th");
  });
  const hasFilters = Boolean(query.trim()) || statusFilter !== "all" || templateFilter !== "all" || revisedFilter !== "all" || queueFilter !== "all";

  useUrlFilters({
    q: query.trim(),
    status: statusFilter === "all" ? "" : statusFilter,
    template: templateFilter === "all" ? "" : templateFilter,
    revised: revisedFilter === "all" ? "" : revisedFilter,
    queue: queueFilter === "all" ? "" : queueFilter,
    sort: sortBy === "default" ? "" : sortBy,
  }, (found) => {
    if (found.q) setQuery(found.q);
    setStatusFilter(allowedValue(found.status, statuses) ?? "all");
    if (found.template) setTemplateFilter(found.template);
    setRevisedFilter(allowedValue(found.revised, ["Y", "N"]) ?? "all");
    setQueueFilter(allowedValue(found.queue, QUEUE_VALUES) ?? "all");
    setSortBy(allowedValue(found.sort, ["default", "document_status", "next_action", "company"] as const) ?? "default");
  });
  const queueOrder = (company: MouCompany) => isSigned(company) ? 3 : queueKind(company) === "BLOCKED" ? 0 : queueKind(company) === "WAITING" ? 1 : 2;
  const displayCompanies = sortBy === "default" ? filteredCompanies : [...filteredCompanies].sort((left, right) => {
    if (sortBy === "next_action") return queueOrder(left) - queueOrder(right) || left.companyThai.localeCompare(right.companyThai, "th");
    if (sortBy === "company") return left.companyThai.localeCompare(right.companyThai, "th");
    return left.documentStatus.localeCompare(right.documentStatus, "th") || left.companyThai.localeCompare(right.companyThai, "th");
  });


  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(displayCompanies.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const pagedCompanies = pageCount > 1 ? displayCompanies.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE) : displayCompanies;

  // Any change to the filters puts the reader back at the first page; without
  // this a narrowed result set can land on a page that no longer exists.
  // Reset before committing a new filter view, without a second effect render.
  const pageScope = JSON.stringify([query, statusFilter, templateFilter, revisedFilter, queueFilter, sortBy]);
  const [previousPageScope, setPreviousPageScope] = useState(pageScope);
  if (previousPageScope !== pageScope) { setPreviousPageScope(pageScope); setPage(1); }

  const showFollowUps = () => {
    setQueueFilter("all");
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTemplateFilter("all");
    setRevisedFilter("all");
    setQueueFilter("all");
    setSortBy("default");
  };

  const saveCompany = async (id: string, draft: MouEditDraft) => {
      const persisted = await updateCompanies((current) => current.map((company) => {
      if (company.id !== id) return company;
      const companyThai = draft.companyThai.trim();
      const companyEnglish = draft.companyEnglish.trim();
      const shortNames = draft.shortNames.split(",").map((value) => value.trim()).filter(Boolean);
      const template = optionalMouValue(draft.template);
      const revisionRequest = optionalMouValue(draft.revisionRequest);
      const revisionSentDate = optionalMouValue(draft.revisionSentDate);
      const legalReviewResult = optionalMouValue(draft.legalReviewResult);
      const authorizationRequest = optionalMouValue(draft.authorizationRequest);
      const authorizationSentDate = optionalMouValue(draft.authorizationSentDate);
      const authorizationStatus = optionalMouValue(draft.authorizationStatus);
      const coordinator = optionalMouValue(draft.coordinator);
      const note = optionalMouValue(draft.note);
      return {
        ...company,
        companyThai,
        companyEnglish,
        shortNames,
        documentStatus: draft.documentStatus.trim(),
        revised: draft.revised,
        template,
        revisionRequest,
        revisionSentDate,
        legalReviewResult,
        reviewStatus: draft.reviewStatus,
        authorizationRequest,
        authorizationSentDate,
        authorizationStatus,
        coordinator,
        note,
        raw: {
          ...company.raw,
          "บริษัท": companyThai,
          "Company Name": companyEnglish,
          "สถานะเอกสาร": draft.documentStatus.trim(),
          "แก้ไข": draft.revised,
          "อว. (Template MoU)": template,
          "คพ.บันทึกขอตรวจแก้ MoU": revisionRequest,
          "วันที่ส่งออก (ตรวจแก้)": revisionSentDate,
          "อว.ผลพิจารณาจากศูนย์กฎหมาย": legalReviewResult,
          "คพ.ขอมอบอำนาจ": authorizationRequest,
          "วันที่ส่งออก (มอบอำนาจ)": authorizationSentDate,
          "สถานะมอบอำนาจ": authorizationStatus,
          "หมายเหตุ": note,
          "ชื่อผู้ประสานงาน": coordinator,
        },
      };
    }));
    showToast(persisted ? "บันทึกการแก้ไข MOU แล้ว" : "บันทึกไม่ได้ การแก้ไขยังอยู่ในแบบฟอร์ม", undo);
    return persisted;
  };

  const updateCompanyDocumentStatus = async (id: string, nextStatus: string) => {
    const company = companies.find((item) => item.id === id);
    if (!company || company.documentStatus === nextStatus) return;
    const apply = (value: string) => updateCompanies((current) => current.map((item) => item.id === id ? {
      ...item,
      documentStatus: value,
      raw: { ...item.raw, "สถานะเอกสาร": value },
    } : item));
    if (!await apply(nextStatus)) { showToast("บันทึกสถานะไม่ได้ กรุณาตรวจข้อมูลล่าสุด"); return; }
    showToast(`${company.companyThai} · สถานะเอกสารเป็น "${nextStatus}"`, undo);
  };

  const resetDemoData = async () => {
    if (!window.confirm("คืนค่าข้อมูลตั้งต้นและลบการแก้ไขทั้งหมดในเบราว์เซอร์นี้หรือไม่?")) return;
    const persisted = await resetCompanies();
    showToast(persisted ? "คืนค่าข้อมูลตั้งต้นแล้ว" : "คืนค่าไม่ได้ ข้อมูลเดิมยังอยู่");
  };

  const updateCompanyAuthorizationStatus = async (id: string, nextStatus: string) => {
    const company = companies.find((item) => item.id === id);
    const value = optionalMouValue(nextStatus);
    if (!company || company.authorizationStatus === value) return;
    const apply = (next: string | null) => updateCompanies((current) => current.map((item) => item.id === id ? {
      ...item,
      authorizationStatus: next,
      raw: { ...item.raw, "สถานะมอบอำนาจ": next },
    } : item));
    if (!await apply(value)) { showToast("บันทึกสถานะไม่ได้ กรุณาตรวจข้อมูลล่าสุด"); return; }
    showToast(`${company.companyThai} · สถานะมอบอำนาจเป็น "${value ?? "ยังไม่ระบุ"}"`, undo);
  };

  return (
    <div className="app-shell mou-shell" data-ready={ready}>
      <header className="topbar">
        <AppNav title="MOU" />
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
          <div><p className="section-kicker">ภาพรวมการจัดการคู่สัญญา</p><h2>ภาพรวมคู่สัญญา MOU</h2><p className="intro-copy">เห็นสถานะเอกสาร งานตรวจแก้ การมอบอำนาจ และคนที่ต้องติดตามต่อ</p></div>
          <div className="intro-badges"><span className="scope-chip"><span className="scope-chip-label">ทะเบียน</span>{formatNumber(companies.length)} คู่สัญญา · ชีต {payload.sheetName}</span><p className="academic-period-copy">ภาพสถานะงานติดตามเอกสารในปีและเทอมที่เลือก ไม่ใช่ช่วงอายุสัญญา</p></div>
        </section>

        <PageSections />
      <section className="kpi-grid" aria-label="ตัวชี้วัด MOU">
          <PriorityKpi label="ต้องติดตาม" count={pending.length} counts={queueCounts} note="ดูรายการที่ต้องทำต่อ" onClick={showFollowUps} />
          <article className="kpi-card blue"><div className="kpi-topline"><span className="kpi-label">บริษัททั้งหมด</span><span className="kpi-context">ตามตัวกรอง</span></div><div className="kpi-value">{formatNumber(total)}</div><div className="kpi-note">คู่สัญญาที่อยู่ในทะเบียนนี้</div></article>
          <article className="kpi-card green"><div className="kpi-topline"><span className="kpi-label">ลงนามแล้ว</span><span className="kpi-context">{signedRate}%</span></div><div className="kpi-value">{formatNumber(signed)} / {formatNumber(total)}</div><span className="kpi-progress" role="progressbar" aria-label="สัดส่วน MOU ที่ลงนามแล้ว" aria-valuemin={0} aria-valuemax={100} aria-valuenow={signedRate}><i className="kpi-progress-fill green" style={{ width: `${signedRate}%` }} /></span><div className="kpi-note">พร้อมใช้เป็นข้อตกลงความร่วมมือ</div></article>
          <article className="kpi-card purple"><div className="kpi-topline"><span className="kpi-label">มอบอำนาจแล้ว</span><span className="kpi-context">{total ? Math.round((authorizationDone / total) * 100) : 0}%</span></div><div className="kpi-value">{formatNumber(authorizationDone)}</div><div className="kpi-note">จาก {formatNumber(total)} บริษัท</div></article>
          <article className="kpi-card orange"><div className="kpi-topline"><span className="kpi-label">อยู่ระหว่างแก้ไข</span><span className="kpi-context">{total ? Math.round((revised / total) * 100) : 0}%</span></div><div className="kpi-value">{formatNumber(revised)}</div><div className="kpi-note">รายการที่มีค่าแก้ไขเป็น Y</div></article>
        </section>

        <section id="dashboard-filters" tabIndex={-1} className="control-panel" aria-label="ตัวกรองข้อมูล MOU">
          <div className="control-heading"><div><h3>ค้นหาและกรองข้อมูล</h3></div><button className="text-button" type="button" onClick={resetFilters} disabled={!hasFilters}>ล้างตัวกรอง</button></div>
          <FilterFields activeCount={[statusFilter, templateFilter, revisedFilter].filter(value => value !== "all").length} search={<label className="search-field"><span>ค้นหาบริษัท ผู้ประสานงาน หรือเลขที่เอกสาร</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="เช่น Mock Cloud 01, คพ.1003, ผู้ประสานงานจำลอง 03…" /></label>}>
            <label><span>สถานะเอกสาร</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">ทุกสถานะ</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label><span>Template MoU</span><select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)}><option value="all">ทุก Template</option>{templates.map((template) => <option key={template} value={template}>{template}</option>)}</select></label>
            <label><span>มีการแก้ไข</span><select value={revisedFilter} onChange={(event) => setRevisedFilter(event.target.value)}><option value="all">ทุกสถานะการแก้ไข</option><option value="Y">มีการแก้ไข (Y)</option><option value="N">ไม่มีการแก้ไข (N)</option></select></label>
          </FilterFields>
          <ResultAnnouncer message={`พบ ${formatNumber(total)} บริษัทตามตัวกรองปัจจุบัน`} />
          <FilterSummary
            summary={hasFilters ? `พบ ${formatNumber(total)} บริษัทตามตัวกรอง` : `แสดงทั้งหมด ${formatNumber(total)} บริษัท`}
            filters={[
              ...(query.trim() ? [{ label: "ค้นหา", value: query.trim(), onClear: () => setQuery("") }] : []),
              ...(statusFilter !== "all" ? [{ label: "สถานะ", value: statusFilter, onClear: () => setStatusFilter("all") }] : []),
              ...(templateFilter !== "all" ? [{ label: "Template", value: templateFilter, onClear: () => setTemplateFilter("all") }] : []),
              ...(revisedFilter !== "all" ? [{ label: "แก้ไข", value: revisedFilter, onClear: () => setRevisedFilter("all") }] : []),
              ...(queueFilter !== "all" ? [{ label: "คิว", value: QUEUE_META[queueFilter].label, onClear: () => setQueueFilter("all") }] : []),
            ]}
          />
        </section>

        <section id="action-queue" tabIndex={-1} className="panel follow-up-panel" ref={queueRef} aria-labelledby="mou-queue-heading">
          <div className="panel-heading"><div><p className="section-kicker">งานที่ต้องทำ</p><h3 id="mou-queue-heading">รายการ MOU ที่ต้องติดตาม</h3></div><span className="count-chip">{formatNumber(pending.length)} รายการ</span></div>
          <QueueFilterGroup label="กรองระดับความเร่งด่วนของ MOU ที่ต้องติดตาม" value={queueFilter} counts={queueCounts} total={pending.length} onChange={setQueueFilter} />
          <div className="follow-up-list mou-follow-up-list">{queueCompanies.length ? queueCompanies.map((company) => { const meta = QUEUE_META[queueKind(company)]; return <button className="follow-up-item" key={company.id} type="button" onClick={(event) => openCompany(company.id, event.currentTarget)}><span className={`follow-up-icon ${meta.className}`} aria-hidden="true">{meta.icon}</span><span className="follow-up-copy"><span className={`follow-up-severity ${meta.className}`}>{meta.label}</span><strong>{company.companyEnglish}</strong><small>{company.companyThai} · {nextAction(company)}</small></span><span className="chevron" aria-hidden="true">›</span></button>; }) : <EmptyResult message="ไม่มีรายการ MOU ที่ต้องติดตามตามตัวกรองปัจจุบัน" hasFilters={hasFilters} onClear={resetFilters} />}</div>
        </section>

        <section id="dashboard-analysis" tabIndex={-1} className="analytics-grid">
          <article className="panel chart-panel"><div className="panel-heading"><div><p className="section-kicker">สัดส่วนสถานะ</p><h3>สถานะเอกสาร MOU</h3></div><span className="panel-caption">จาก {formatNumber(total)} บริษัท · กดแถบเพื่อกรอง</span></div><div className="bar-chart" aria-label="กราฟสถานะเอกสาร MOU">{statusCounts.length === 0 ? <EmptyResult message="ไม่มีบริษัทให้แสดงตามตัวกรองปัจจุบัน" hasFilters={hasFilters} onClear={resetFilters} /> : statusCounts.map(([status, count]) => <button className={`bar-row ${statusFilter === status ? "is-active" : ""}`} key={status} type="button" onClick={() => setStatusFilter(statusFilter === status ? "all" : status)} aria-pressed={statusFilter === status}><span className="bar-label"><span className={`tone-dot ${statusClass(status)}`} /> <span>{status}</span><strong>{formatNumber(count)} · {total ? Math.round((count / total) * 100) : 0}%</strong></span><span className="bar-track"><span className="bar-fill" style={{ width: `${(count / maxStatusCount) * 100}%` }} /></span></button>)}</div></article>
          <article className="panel chart-panel"><div className="panel-heading"><div><p className="section-kicker">ความคืบหน้า</p><h3>ความครบถ้วนของกระบวนการ</h3></div><span className="panel-caption">ตรวจจากข้อมูลในชีต</span></div><div className="mou-process-summary">{[
            ["มี Template MoU", filteredCompanies.filter((company) => Boolean(company.template)), "blue"],
            ["มีผลตรวจแก้", filteredCompanies.filter((company) => Boolean(company.legalReviewResult)), "purple"],
            ["มอบอำนาจแล้ว", filteredCompanies.filter((company) => company.authorizationStatus === "มอบอำนาจแล้ว"), "green"],
            ["ลงนามแล้ว", filteredCompanies.filter(isSigned), "orange"],
          ].map(([label, items, tone]) => { const count = (items as MouCompany[]).length; const percentage = total ? Math.round((count / total) * 100) : 0; return <div className="mou-process-summary-row" key={label as string}><span className={`legend-dot ${tone}`} /><span>{label as string}</span><strong>{formatNumber(count)}</strong><span className="mou-process-track"><i className={`mou-process-fill ${tone}`} style={{ width: `${percentage}%` }} /></span><small>{percentage}%</small></div>; })}</div></article>
        </section>

        <section id="dashboard-directory" tabIndex={-1} className="panel table-panel" aria-labelledby="mou-directory-heading">
          <div className="panel-heading table-heading"><div><p className="section-kicker">รายการทั้งหมด</p><h3 id="mou-directory-heading">ทะเบียนบริษัทและสถานะเอกสาร</h3></div><div className="table-heading-actions"><label className="table-sort"><span>เรียงตาม</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} aria-label="เรียงรายการบริษัท"><option value="default">ลำดับเดิม</option><option value="next_action">งานที่ต้องทำก่อน</option><option value="document_status">สถานะเอกสาร</option><option value="company">ชื่อบริษัท</option></select></label><span className="panel-caption">{formatNumber(total)} รายการ</span></div></div>
          <div className="table-scroll-note">บนมือถือจะแสดงเป็นการ์ดพร้อมสถานะและงานถัดไป</div>
          <div className="table-wrap"><table><caption className="sr-only">ทะเบียนบริษัทและสถานะ MOU</caption><thead><tr><th scope="col">บริษัท</th><th scope="col">สถานะเอกสาร</th><th scope="col">Template / แก้ไข</th><th scope="col">ตรวจแก้</th><th scope="col">มอบอำนาจ</th><th scope="col">ผู้ประสานงาน</th><th scope="col">งานถัดไป</th><th scope="col"><span className="sr-only">รายละเอียด</span></th></tr></thead><tbody>{pagedCompanies.length ? pagedCompanies.map((company) => <tr key={company.id}><td><button className="course-link" type="button" onClick={(event) => openCompany(company.id, event.currentTarget)}><span className="course-code">แถวที่ {company.rowNumber} · {company.shortNames.join(", ") || "ไม่มีชื่อสั้น"}</span><strong>{company.companyThai}</strong><small>{company.companyEnglish}</small></button></td><td><select className={`status-select status-pill ${statusClass(company.documentStatus)}`} value={company.documentStatus} onChange={(event) => updateCompanyDocumentStatus(company.id, event.target.value)} aria-label={`อัปเดตสถานะเอกสาร MOU ของ ${company.companyThai}`}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></td><td><span className="provider-name">{display(company.template)}</span><small className={company.revised === "Y" ? "mou-revised" : ""}>{company.revised === "Y" ? "มีการแก้ไข" : "ไม่มีการแก้ไข"}</small></td><td><span className="mou-reference-cell">{display(company.revisionRequest, "ยังไม่มีเลขที่บันทึก")}</span><small>{display(company.revisionSentDate, "ยังไม่ได้ส่งออก")}</small></td><td><span className="mou-reference-cell">{display(company.authorizationRequest, "ยังไม่มีเลขที่บันทึก")}</span><select className={`status-select status-pill ${statusClass(company.authorizationStatus ?? "")}`} value={company.authorizationStatus ?? ""} onChange={(event) => updateCompanyAuthorizationStatus(company.id, event.target.value)} aria-label={`อัปเดตสถานะมอบอำนาจของ ${company.companyThai}`}><option value="">ยังไม่ระบุสถานะ</option>{authorizationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></td><td><span className="provider-name">{display(company.coordinator)}</span></td><td><div className="workflow-next"><strong>{isSigned(company) ? "ทุกขั้นตอนเสร็จแล้ว" : nextAction(company)}</strong><small>{company.legalReviewResult ? `ผลตรวจ: ${company.legalReviewResult}` : "ยังไม่มีผลตรวจระบุ"}</small></div></td><td><button className="row-action" type="button" onClick={(event) => openCompany(company.id, event.currentTarget)} aria-label={`ดูรายละเอียด MOU ของ ${company.companyThai}`}>รายละเอียด</button></td></tr>) : <tr><td colSpan={8}><EmptyResult message="ไม่พบบริษัทที่ตรงกับตัวกรอง" hasFilters={hasFilters} onClear={resetFilters} /></td></tr>}</tbody></table></div>
          <div className="mobile-course-list mou-mobile-list">{pagedCompanies.length ? pagedCompanies.map((company) => <article className="mobile-course-card" key={company.id}><div className="mobile-course-card-header"><button className="course-link mobile-course-link" type="button" onClick={(event) => openCompany(company.id, event.currentTarget)}><span className="course-code">แถวที่ {company.rowNumber} · {company.companyEnglish}</span><strong>{company.companyThai}</strong></button><label className="mobile-status-field"><span>สถานะเอกสาร</span><select className={`status-select status-pill ${statusClass(company.documentStatus)}`} value={company.documentStatus} onChange={(event) => updateCompanyDocumentStatus(company.id, event.target.value)} aria-label={`อัปเดตสถานะเอกสาร MOU ของ ${company.companyThai}`}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div><div className="mobile-course-meta"><span>{display(company.template)}</span><span>{display(company.coordinator)}</span><span>{company.revised === "Y" ? "มีการแก้ไข" : "ไม่มีการแก้ไข"}</span></div><div className="mobile-status-fields"><label><span>สถานะมอบอำนาจ</span><select className={`status-select status-pill ${statusClass(company.authorizationStatus ?? "")}`} value={company.authorizationStatus ?? ""} onChange={(event) => updateCompanyAuthorizationStatus(company.id, event.target.value)} aria-label={`อัปเดตสถานะมอบอำนาจของ ${company.companyThai}`}><option value="">ยังไม่ระบุสถานะ</option>{authorizationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div><div className="mobile-course-next"><span>งานถัดไป</span><strong>{isSigned(company) ? "ทุกขั้นตอนเสร็จแล้ว" : nextAction(company)}</strong></div><button className="row-action mobile-detail-action" type="button" onClick={(event) => openCompany(company.id, event.currentTarget)} aria-label={`ดูรายละเอียด MOU ของ ${company.companyThai}`}>ดูรายละเอียด</button></article>) : <EmptyResult message="ไม่พบบริษัทที่ตรงกับตัวกรอง" hasFilters={hasFilters} onClear={resetFilters} />}</div>
          <Pager page={activePage} pageCount={pageCount} total={displayCompanies.length} unit="บริษัท" onChange={setPage} />
        </section>
      </main>

      {selectedCompany && <DeferredRecordDialog dialogRef={dialogRef} onClose={closeCompany}><MouDetailDialog key={selectedCompany.id} company={selectedCompany} dialogRef={dialogRef} onClose={closeCompany} onSave={saveCompany} statusOptions={statuses} /></DeferredRecordDialog>}
      <StatusToast toast={toast} onDismiss={dismissToast} onHold={holdTimer} onResume={resumeTimer} />
    </div>
  );
}
