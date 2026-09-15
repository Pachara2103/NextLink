"use client";

import { AcademicPeriodEmptyState, AcademicPeriodSelector } from "@/features/dashboard/components/academic-period-selector";
import { PageSections } from "@/features/dashboard/components/page-sections";
import { FilterFields } from "@/features/dashboard/components/filter-fields";

import { lazy, useDeferredValue, useMemo, useRef, useState } from "react";
import { AppNav, DashboardModuleNav } from "@/features/dashboard/components/app-nav";
import { PriorityKpi } from "@/features/dashboard/components/priority-kpi";
import { QueueFilterGroup } from "@/features/dashboard/components/queue-filter";
import { PAGE_SIZE, Pager } from "@/features/dashboard/components/pager";
import { EmptyResult } from "@/features/dashboard/components/empty-result";
import { FilterSummary } from "@/features/dashboard/components/filter-summary";
import { ResultAnnouncer } from "@/features/dashboard/components/result-announcer";
import { StatusToast, useStatusToast } from "@/features/dashboard/components/status-toast";
import { CapstoneRanking } from "@/features/dashboard/components/capstone-ranking";
import type { CapstoneTab } from "@/features/dashboard/components/capstone-detail-dialog";
import type { CapstoneDataset, CapstoneDraft, CapstoneTopic } from "@/features/dashboard/lib/capstone-types";
import { EMPTY_FILTERS, buildCapstoneIndex, capstoneTopicMetrics, capstoneStats, filterTopics, type CapstoneFilters } from "@/features/dashboard/lib/capstone-stats";
import { TOPIC_STATUSES } from "@/features/dashboard/lib/capstone-statuses";
import { applyCapstoneDraft } from "@/features/dashboard/lib/capstone-edit";
import { StorageRecoveryPanel } from "./storage-recovery";
import { useCapstoneDataset } from "@/features/dashboard/lib/use-capstone-dataset";
import { useRecordDialog } from "@/features/dashboard/lib/use-record-dialog";
import { useUrlFilters } from "@/features/dashboard/lib/use-url-filters";
import { QUEUE_META, queueRank, type QueueKind } from "@/features/dashboard/lib/queue";
import { formatNumber, formatUpdated } from "@/features/dashboard/lib/format";

import { DeferredRecordDialog } from "@/features/dashboard/components/deferred-record-dialog";

const CapstoneDetailDialog = lazy(() => import("./capstone-detail-dialog").then(module => ({ default: module.CapstoneDetailDialog })));

export function CapstoneDashboard({ payload }: { payload: CapstoneDataset }) {
  const { data, ready, editedAt, warning, save, reset, recovery, recover } = useCapstoneDataset(payload);
  const [filters, setFilters] = useState<CapstoneFilters>(EMPTY_FILTERS);
  const [queue, setQueue] = useState<QueueKind | "all">("all");
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [rankingId, setRankingId] = useState("");
  const [rankingRound, setRankingRound] = useState("");
  const [initialTab, setInitialTab] = useState<CapstoneTab>("topic");
  const queueRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLElement>(null);
  const dialog = useRecordDialog(data.topics);
  const toast = useStatusToast();
  const deferredQuery = useDeferredValue(filters.query);
  const setFilter = (key: keyof CapstoneFilters, value: string) => setFilters(f => ({ ...f, [key]: value }));
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setQueue("all"); setPage(1); };
  const hasFilters = Object.values(filters).some(Boolean) || queue !== "all";
  const index = useMemo(() => buildCapstoneIndex(data), [data]);
  const metrics = useMemo(() => capstoneTopicMetrics(data.topics, filters.round), [data.topics, filters.round]);
  const rounds = useMemo(() => [...new Set(data.topics.flatMap(t => t.rounds))].sort(), [data.topics]);
  const categories = useMemo(() => [...new Set(data.topics.map(t => t.category))].sort(), [data.topics]);
  const periodCompanies = useMemo(() => {
    const companyIds = new Set(data.topics.map(topic => topic.companyId));
    return data.companies.filter(company => companyIds.has(company.id));
  }, [data.topics, data.companies]);
  useUrlFilters({ ...filters, queue: queue === "all" ? "" : queue, sort: sort === "default" ? "" : sort }, found => {
    const allowed: Record<string, string[]> = {
      year: payload.topics.map(t => t.year), round: payload.topics.flatMap(t => t.rounds),
      company: payload.companies.map(c => c.id), professor: payload.professors.map(p => p.id),
      status: Object.keys(TOPIC_STATUSES), topic: payload.topics.map(t => t.id),
    };
    const restored = { ...EMPTY_FILTERS };
    for (const key of Object.keys(restored) as (keyof CapstoneFilters)[]) {
      if (found[key] && (!allowed[key] || allowed[key].includes(found[key]))) restored[key] = found[key];
    }
    setFilters(restored);
    if (["BLOCKED", "WAITING", "IN_PROGRESS"].includes(found.queue)) setQueue(found.queue as QueueKind);
    if (["interest", "title", "capacity"].includes(found.sort)) setSort(found.sort);
  });
  const { year, round, company, professor, category, status, topic } = filters;
  const filtered = useMemo(() => filterTopics(data, { year, round, company, professor, category, status, topic, query: deferredQuery }, index), [data, index, year, round, company, professor, category, status, topic, deferredQuery]);
  const stats = useMemo(() => capstoneStats(filtered, round, metrics), [filtered, round, metrics]);
  const followUps = useMemo(() => filtered.map(topic => ({ topic, work: metrics.get(topic.id)!.work })).filter(row => row.work !== null).sort((a, b) => queueRank(a.work!.kind) - queueRank(b.work!.kind)), [filtered, metrics]);
  const visibleQueue = useMemo(() => followUps.filter(row => queue === "all" || row.work?.kind === queue), [followUps, queue]);
  const registered = useMemo(() => filtered.filter(t => queue === "all" || metrics.get(t.id)!.work?.kind === queue).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, "th");
    if (sort === "interest") return (metrics.get(b.id)!.interest ?? -1) - (metrics.get(a.id)!.interest ?? -1);
    if (sort === "capacity") return (b.capacity ?? -1) - (a.capacity ?? -1);
    return b.year.localeCompare(a.year) || a.id.localeCompare(b.id);
  }), [filtered, metrics, queue, sort]);
  const pageCount = Math.max(1, Math.ceil(registered.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const paged = registered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  // Reset before committing a new filter view, without a second effect render.
  const pageScope = JSON.stringify([filters, queue, sort]);
  const [previousPageScope, setPreviousPageScope] = useState(pageScope);
  if (previousPageScope !== pageScope) { setPreviousPageScope(pageScope); setPage(1); }
  const demand = useMemo(() => [...filtered].sort((a, b) => (metrics.get(b.id)!.interest ?? -1) - (metrics.get(a.id)!.interest ?? -1)).slice(0, 8), [filtered, metrics]);
  const maxDemand = Math.max(1, ...demand.map(t => metrics.get(t.id)!.interest ?? 0));
  const companyTopics = useMemo(() => {
    const groups = new Map<string, CapstoneTopic[]>();
    for (const topic of filtered) {
      if (!topic.companyId) continue;
      const topics = groups.get(topic.companyId) ?? [];
      topics.push(topic);
      groups.set(topic.companyId, topics);
    }
    return groups;
  }, [filtered]);
  const companies = useMemo(() => data.companies.filter(c => companyTopics.has(c.id)), [data.companies, companyTopics]);
  const companyCapacity = useMemo(() => companies.map(company => {
    const topics = companyTopics.get(company.id)!;
    return { company, confirmed: topics.reduce((n, t) => n + metrics.get(t.id)!.confirmed, 0), capacity: topics.reduce((n, t) => n + (t.capacity ?? 0), 0), unknown: topics.filter(t => t.capacity === null).length };
  }), [companies, companyTopics, metrics]);
  const maxCapacity = Math.max(1, ...companyCapacity.flatMap(c => [c.capacity, c.confirmed]));
  const rankedTopic = filtered.find(t => t.id === rankingId) ?? filtered[0];
  const selectedRound = rankedTopic?.rounds.includes(filters.round) ? filters.round : rankedTopic?.rounds.includes(rankingRound) ? rankingRound : rankedTopic?.rounds[0] ?? "";
  function open(topic: CapstoneTopic, trigger: HTMLElement, tab: CapstoneTab = "topic") {
    if (!ready) return;
    setInitialTab(tab); dialog.open(topic.id, trigger);
  }
  async function saveDraft(draft: CapstoneDraft) {
    const persisted = await save(applyCapstoneDraft(data, draft, new Date().toISOString()));
    toast.show(persisted ? "บันทึกข้อมูล Capstone ในเบราว์เซอร์แล้ว" : "บันทึกไม่ได้ การแก้ไขยังอยู่ในแบบฟอร์ม");
    return persisted;
  }
  async function resetDemo() {
    if (!window.confirm("คืนค่าข้อมูล Capstone ทั้งหมดเป็นข้อมูลตัวอย่าง? การแก้ไขในเบราว์เซอร์นี้จะถูกล้าง")) return;
    const cleared = await reset();
    toast.show(cleared ? "คืนค่าข้อมูล Capstone ตั้งต้นแล้ว" : "คืนค่าไม่ได้ ข้อมูลเดิมยังอยู่");
  }
  const filterLabels: Record<keyof CapstoneFilters, string> = { year: "ปี", round: "รอบ", company: "บริษัท", professor: "อาจารย์", category: "หมวดหมู่", status: "สถานะ", query: "ค้นหา", topic: "หัวข้อ" };
  const filterValue = (key: keyof CapstoneFilters, value: string) => key === "company" ? index.companies.get(value)?.name ?? value : key === "professor" ? index.professors.get(value)?.name ?? value : key === "status" ? TOPIC_STATUSES[value as keyof typeof TOPIC_STATUSES]?.label ?? value : value;
  const noResults = (message: string) => <EmptyResult message={message} hasFilters={hasFilters} onClear={resetFilters} />;
  const countLabel = (count: number | null) => count === null ? "ยังไม่มีข้อมูล" : formatNumber(count);

  return <div className="app-shell cap-shell" data-ready={ready}>
    <header className="topbar">
      <AppNav title="Capstone" />
      <div className="header-tools">
        <div className="header-meta"><span>ข้อมูลตัวอย่าง ณ {formatUpdated(data.lastUpdated, "Asia/Bangkok")}</span>{ready && (editedAt || warning) && <span className="local-edit-note">{editedAt ? `แก้ในเบราว์เซอร์นี้ ${formatUpdated(editedAt, "Asia/Bangkok")}` : "ข้อมูลในเบราว์เซอร์มีปัญหา"}<button type="button" className="local-edit-reset" onClick={resetDemo}>คืนค่าข้อมูลตัวอย่าง</button></span>}</div>
        <AcademicPeriodSelector />
      </div>
    </header>
    <DashboardModuleNav />
    <main id="main-content" tabIndex={-1} className="page-content">
      <AcademicPeriodEmptyState hasData={payload.topics.length > 0} /><StorageRecoveryPanel key={recovery?.raw} recovery={recovery} onRecover={recover} />
      <section className="intro-row"><div><p className="section-kicker">โครงการและความร่วมมือ</p><h2>ภาพรวม Capstone</h2><p className="intro-copy">ติดตามหัวข้อที่นิสิตสนใจ อันดับกลุ่มจากบริษัท และอาจารย์ที่ร่วมงาน</p></div><div className="intro-badges"><span className="scope-chip">{data.topics.length} โครงการ · {periodCompanies.length} บริษัท</span></div></section>
      {warning && <p className="cap-warning" role="status">{warning}</p>}
      <PageSections capstone />
      <section className="kpi-grid" aria-label="ตัวชี้วัด Capstone">
        <PriorityKpi label="หัวข้อที่ต้องติดตาม" count={stats.pending} counts={stats.counts} note="แต่ละหัวข้อนับครั้งเดียว" onClick={() => queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        <article className="kpi-card blue"><div className="kpi-label">หัวข้อทั้งหมด</div><div className="kpi-value" data-testid="topic-count">{stats.topics}</div><div className="kpi-note">ตามตัวกรอง · รวมทุกสถานะ</div></article>
        <article className="kpi-card green"><div className="kpi-label">กลุ่มที่ยืนยันแล้ว</div><div className="kpi-value" data-testid="confirmed-count">{stats.confirmed}</div><div className="kpi-note">สถานะปัจจุบันของหัวข้อ · รวมทุกรอบ</div></article>
        <article className="kpi-card purple"><div className="kpi-label">จำนวนกลุ่มที่ยังรับได้</div><div className="kpi-value" data-testid="remaining-count">{stats.remaining}</div><div className="kpi-note">เฉพาะหัวข้อเปิดรับ{stats.unknownCapacity ? ` · ยังไม่ทราบอีก ${stats.unknownCapacity} หัวข้อ` : ""}</div></article>
        <article className="kpi-card orange"><div className="kpi-label">บริษัทที่ร่วมเสนอหัวข้อ</div><div className="kpi-value">{stats.companies}</div><div className="kpi-note">นับบริษัทไม่ซ้ำตามตัวกรอง</div></article>
      </section>
      <section id="dashboard-filters" tabIndex={-1} className="control-panel" aria-label="ตัวกรอง Capstone">
        <div className="control-heading"><div><h3>ค้นหาและกรองข้อมูล</h3></div><button type="button" className="text-button" onClick={resetFilters} disabled={!hasFilters}>ล้างตัวกรอง</button></div>
        <FilterFields className="cap-filters" activeCount={[filters.year, filters.round, filters.company, filters.professor, filters.category, filters.status].filter(Boolean).length} search={<label className="search-field"><span>ค้นหาหัวข้อ บริษัท หรือผู้ประสานงาน</span><input type="search" placeholder="ชื่อหัวข้อ, CAP-001, บริษัท…" value={filters.query} onChange={e => setFilter("query", e.target.value)} /></label>}>
          <label><span>รอบรับสมัคร</span><select value={filters.round} onChange={e => setFilter("round", e.target.value)}><option value="">ทุกรอบ</option>{rounds.map(r => <option key={r} value={r}>รอบ {r}</option>)}</select></label>
          <label><span>บริษัท / หน่วยงาน</span><select value={filters.company} onChange={e => setFilter("company", e.target.value)}><option value="">ทุกบริษัท</option>{periodCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label><span>อาจารย์ที่เชื่อมกับบริษัท</span><select value={filters.professor} onChange={e => setFilter("professor", e.target.value)}><option value="">ทุกอาจารย์</option>{data.professors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label><span>หมวดหมู่</span><select value={filters.category} onChange={e => setFilter("category", e.target.value)}><option value="">ทุกหมวด</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label><span>สถานะหัวข้อ</span><select value={filters.status} onChange={e => setFilter("status", e.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(TOPIC_STATUSES).map(([value, status]) => <option key={value} value={value}>{status.label}</option>)}</select></label>
          </FilterFields>
        <FilterSummary summary={`พบ ${registered.length} หัวข้อในทะเบียน · ภาพรวม ${filtered.length} หัวข้อ`} filters={[
          ...(Object.keys(filters) as (keyof CapstoneFilters)[]).filter(key => filters[key]).map(key => ({ label: filterLabels[key], value: filterValue(key, filters[key]), onClear: () => setFilter(key, "") })),
          ...(queue !== "all" ? [{ label: "คิว", value: QUEUE_META[queue].label, onClear: () => setQueue("all") }] : []),
        ]} /><ResultAnnouncer message={`พบ ${registered.length} หัวข้อในทะเบียน`} />
      </section>
      <section id="action-queue" tabIndex={-1} className="panel follow-up-panel" ref={queueRef}>
        <div className="panel-heading"><div><p className="section-kicker">งานถัดไป</p><h3>หัวข้อที่ต้องติดตาม</h3></div><span className="panel-caption">ตัวกรองคิวใช้กับรายการนี้และทะเบียน</span></div>
        <QueueFilterGroup label="กรองงานติดตาม Capstone" value={queue} counts={stats.counts} total={stats.pending} onChange={setQueue} />
        <div className="follow-up-list">{visibleQueue.slice(0, 6).map(({ topic, work }) => <button key={topic.id} className="follow-up-item" type="button" disabled={!ready} onClick={e => open(topic, e.currentTarget)}><span className={`follow-up-icon ${QUEUE_META[work!.kind].className}`}>{QUEUE_META[work!.kind].icon}</span><span className="follow-up-copy"><span className={`follow-up-severity ${QUEUE_META[work!.kind].className}`}>{QUEUE_META[work!.kind].label}</span><strong>{topic.title}</strong><small>{work!.reason}</small></span><span className="chevron" aria-hidden="true">›</span></button>)}</div>
        {!visibleQueue.length && noResults("ไม่มีงานติดตามตามตัวกรองนี้")}
        {visibleQueue.length > 6 && <p className="source-footnote">แสดง 6 จาก {visibleQueue.length} หัวข้อ · <button className="text-button" type="button" onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth" })}>ดูต่อในทะเบียน</button></p>}
      </section>
      <div id="dashboard-analysis" tabIndex={-1} className="analytics-grid">
        <section className="panel"><div className="panel-heading"><div><p className="section-kicker">ความสนใจของนิสิต</p><h3>หัวข้อที่นิสิตเลือก</h3></div><span className="scope-chip">{stats.students} คนไม่ซ้ำ</span></div><p className="panel-caption">{filters.round ? `รอบ ${filters.round}` : "รวมทุกรอบแบบไม่ซ้ำ"} · สูงสุด 8 หัวข้อ · กดแถบเพื่อกรอง{stats.unknownInterest ? ` · ยังไม่มีข้อมูลอีก ${stats.unknownInterest} หัวข้อ` : ""}</p>
          <div className="bar-chart">{demand.map(t => <button className="bar-row" key={t.id} type="button" onClick={() => setFilter("topic", filters.topic === t.id ? "" : t.id)} aria-pressed={filters.topic === t.id}><span className="bar-label"><span>{t.title}</span><strong>{countLabel(metrics.get(t.id)!.interest)}{t.interestKnown ? " คน" : ""}</strong></span><span className="bar-track"><span className="bar-fill" style={{ width: `${((metrics.get(t.id)!.interest ?? 0) / maxDemand) * 100}%` }} /></span></button>)}</div>{!demand.length && noResults("ไม่มีหัวข้อให้แสดง")}
          <p className="source-footnote">นิสิตหนึ่งคนเลือกได้หลายหัวข้อ จำนวนรวมจึงไม่ใช่ผลบวกของแต่ละแท่ง</p>
        </section>
        <section className="panel"><div className="panel-heading"><div><p className="section-kicker">จำนวนกลุ่มรายบริษัท</p><h3>รับได้และยืนยันแล้ว</h3></div></div><p className="panel-caption">สถานะปัจจุบันของหัวข้อตามตัวกรอง · <span className="cap-legend-capacity">รับได้</span> / <span className="cap-legend-confirmed">ยืนยันแล้ว</span></p>
          <div className="bar-chart">{companyCapacity.map(c => <button type="button" className="bar-row" key={c.company.id} aria-pressed={filters.company === c.company.id} onClick={() => setFilter("company", filters.company === c.company.id ? "" : c.company.id)}><span className="bar-label"><span>{c.company.name}</span><strong>{c.unknown ? `≥ ${c.capacity}` : c.capacity} / {c.confirmed} กลุ่ม</strong></span><span className="cap-capacity-tracks"><span className="bar-track"><span className="bar-fill" style={{ width: `${c.capacity / maxCapacity * 100}%` }} /></span><span className="bar-track"><span className="cap-confirmed-fill" style={{ width: `${c.confirmed / maxCapacity * 100}%` }} /></span></span>{c.unknown > 0 && <small>ยังไม่ทราบจำนวนที่รับอีก {c.unknown} หัวข้อ</small>}</button>)}</div>{!companies.length && noResults("ไม่มีบริษัทในชุดข้อมูลที่เลือก")}
        </section>
      </div>
      <section id="capstone-relationships" tabIndex={-1} className="panel cap-panel" aria-label="บริษัทและอาจารย์">
        <div className="panel-heading"><div><p className="section-kicker">เครือข่ายความร่วมมือ</p><h3>บริษัทเชื่อมกับอาจารย์คนใด</h3></div><span className="panel-caption">กดชื่อเพื่อกรอง · ดูและแก้บทบาทจากรายละเอียดหัวข้อ</span></div>
        <div className="cap-company-grid">{companies.map(c => <article className="cap-company-card" key={c.id}><button className="text-button" type="button" onClick={() => setFilter("company", c.id)}>{c.name}</button><p className="panel-caption">{c.domain} · {companyTopics.get(c.id)!.length} หัวข้อ</p>{(index.relationships.get(c.id) ?? []).map(r => <div className="cap-company-person" key={r.id}><button type="button" className="text-button" onClick={() => setFilter("professor", r.professorId)}>{index.professors.get(r.professorId)?.name}</button><span>{r.role || "ยังไม่ระบุบทบาท"}</span><small>{r.source || "ยังไม่มีข้อมูลที่มา"}</small></div>)}{!index.relationships.get(c.id)?.length && <p>ยังไม่มีข้อมูลความเชื่อมโยง</p>}<button className="row-action" type="button" disabled={!ready} onClick={e => open(companyTopics.get(c.id)![0], e.currentTarget, "company")}>ดูความเชื่อมโยง</button></article>)}</div>{!companies.length && noResults("ไม่มีบริษัทในชุดข้อมูลที่เลือก")}
      </section>
      <section id="capstone-ranking" tabIndex={-1} className="panel cap-panel" aria-label="อันดับกลุ่มจากบริษัท">
        <div className="panel-heading"><div><p className="section-kicker">การคัดเลือกกลุ่มผู้สมัคร</p><h3>อันดับกลุ่มจากบริษัท</h3></div>{rankedTopic && <button type="button" className="secondary-button" disabled={!ready} onClick={e => open(rankedTopic, e.currentTarget, "teams")}>ดูและแก้อันดับ</button>}</div>
        {rankedTopic ? <><label className="cap-field"><span>โครงการที่แสดงอันดับ</span><select value={rankedTopic.id} onChange={e => setRankingId(e.target.value)}>{filtered.map(t => <option key={t.id} value={t.id}>{t.id} · {t.title} · ปี {t.year}</option>)}</select></label><CapstoneRanking topic={rankedTopic} data={data} round={selectedRound} onRoundChange={r => { setRankingRound(r); if (filters.round) setFilter("round", r); }} /></> : noResults("ไม่มีโครงการให้แสดงอันดับ")}
      </section>
      <section id="dashboard-directory" tabIndex={-1} className="panel table-panel cap-panel" ref={tableRef}>
        <div className="panel-heading table-heading"><div><p className="section-kicker">ทะเบียนโครงการ</p><h3>หัวข้อ Capstone · {registered.length} หัวข้อ</h3></div><label className="table-sort">เรียงตาม<select aria-label="เรียงหัวข้อ" value={sort} onChange={e => setSort(e.target.value)}><option value="default">ปีและรหัสหัวข้อ</option><option value="interest">จำนวนนิสิตที่เลือก</option><option value="capacity">จำนวนกลุ่มที่รับได้</option><option value="title">ชื่อหัวข้อ</option></select></label></div>
        <div className="table-wrap"><table><caption className="sr-only">ทะเบียนหัวข้อ Capstone</caption><thead><tr>{["หัวข้อ / หมวด", "บริษัท", "รอบเปิดรับ", "รับได้ / ยืนยัน (กลุ่ม)", "นิสิตที่เลือก (คน)", "สถานะหัวข้อ", "ผู้ประสานงาน", "รายละเอียด"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{paged.map(t => <tr key={t.id}><td><button className="course-link" type="button" disabled={!ready} onClick={e => open(t, e.currentTarget)}><span className="course-code">{t.id} · ปี {t.year} · {t.category}</span><strong>{t.title}</strong></button></td><td>{index.companies.get(t.companyId ?? "")?.name ?? "นิสิต / อาจารย์"}</td><td>{t.rounds.join(", ")}</td><td>{t.capacity ?? "ยังไม่ทราบ"} / {metrics.get(t.id)!.confirmed}</td><td><button className="text-button" type="button" disabled={!ready} aria-label={`ดูนิสิตที่เลือก ${t.id}`} onClick={e => open(t, e.currentTarget, "teams")}>{countLabel(metrics.get(t.id)!.interest)}</button></td><td><span className={`status-pill ${TOPIC_STATUSES[t.status].tone}`}>{TOPIC_STATUSES[t.status].label}</span></td><td>{t.coordinator || "ยังไม่มีข้อมูล"}</td><td><button className="row-action" type="button" disabled={!ready} aria-label={`รายละเอียด ${t.id}`} onClick={e => open(t, e.currentTarget)}>รายละเอียด</button></td></tr>)}{!paged.length && <tr><td colSpan={8}>{noResults("ไม่พบหัวข้อที่ตรงกับตัวกรอง")}</td></tr>}</tbody></table></div>
        <div className="mobile-course-list">{paged.map(t => <article className="mobile-course-card" key={t.id}><button className="course-link" type="button" disabled={!ready} onClick={e => open(t, e.currentTarget)}><span className="course-code">{t.id} · ปี {t.year} · {t.category}</span><strong>{t.title}</strong></button><p>{index.companies.get(t.companyId ?? "")?.name ?? "นิสิต / อาจารย์"}</p><span className={`status-pill ${TOPIC_STATUSES[t.status].tone}`}>{TOPIC_STATUSES[t.status].label}</span><p>รับได้ {t.capacity ?? "ยังไม่ทราบ"} / ยืนยัน {metrics.get(t.id)!.confirmed} กลุ่ม · รอบ {t.rounds.join(", ")}</p><p>นิสิตที่เลือก {countLabel(metrics.get(t.id)!.interest)}{t.interestKnown ? " คน" : ""} · สมัคร {countLabel(metrics.get(t.id)!.applications)} กลุ่ม</p><button className="row-action" type="button" disabled={!ready} onClick={e => open(t, e.currentTarget, "teams")}>ดูผู้สมัครและอันดับ</button></article>)}{!paged.length && noResults("ไม่พบหัวข้อที่ตรงกับตัวกรอง")}</div>
        <Pager page={activePage} pageCount={pageCount} total={registered.length} unit="หัวข้อ" onChange={setPage} />
      </section>
      <p className="source-footnote">ข้อมูลทั้งหมดสร้างขึ้นสำหรับ Demo · ความสนใจ ใบสมัคร อันดับจากบริษัท และผลยืนยันทีมเป็นข้อมูลคนละส่วน</p>
    </main>
    {dialog.selected && <DeferredRecordDialog dialogRef={dialog.dialogRef} onClose={dialog.close}><CapstoneDetailDialog key={dialog.selected.id} topic={dialog.selected} data={data} dialogRef={dialog.dialogRef} initialTab={initialTab} initialRound={filters.round || selectedRound} onClose={dialog.close} onSave={saveDraft} storageWarning={warning} /></DeferredRecordDialog>}
    <StatusToast toast={toast.toast} onDismiss={toast.dismiss} onHold={toast.holdTimer} onResume={toast.resumeTimer} />
  </div>;
}
