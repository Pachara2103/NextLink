"use client";

import { useDeferredValue, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FridayActivityRecord } from "@/lib/services/friday-activity";
import { academicPeriodLabel, type AcademicPeriod } from "../lib/academic-period";
import { LIVE_FRIDAY_FORMATS, LIVE_FRIDAY_STATUSES, fridayApiPeriod, fridayLiveCount, fridayLiveDate, fridayLiveTimestamp, fridayUiPeriod } from "../lib/friday-api";
import { useFridayActivities } from "../lib/use-friday-activities";
import { useFridayReport } from "../lib/use-friday-report";
import { fridayReportUrl, type FridayAnalytics, type FridayEvaluations } from "@/lib/services/friday-reporting";
import { focusDashboardSection } from "../lib/section-navigation";
import { DashboardModuleNav } from "./app-nav";
import { FilterFields } from "./filter-fields";
import { FilterSummary } from "./filter-summary";
import { ResultAnnouncer } from "./result-announcer";
import { PAGE_SIZE, Pager } from "./pager";
import { FridayLiveDetail } from "./friday-live-detail";
import { FridayLiveImport } from "./friday-live-import";
import { FridayLiveOverview } from "./friday-live-overview";
import { FridayLiveEvaluationBoard } from "./friday-live-evaluation-board";
import "./friday-live.css";
import "./friday-workspace.css";

const VIEWS = [{ id: "overview", label: "ภาพรวม" }, { id: "evaluation", label: "ผลการประเมิน" }, { id: "table", label: "ตารางกิจกรรม" }] as const;
type View = typeof VIEWS[number]["id"];

function LiveActivityRow({ activity, onOpen }: { activity: FridayActivityRecord; onOpen: () => void }) {
  return <tr><td><button className="course-link" type="button" onClick={onOpen}><strong>{activity.title}</strong><span className="course-code">{activity.domain || "ยังไม่ระบุศาสตร์"}</span></button><small>{activity.companies.map(company => company.name).join(" · ") || "ยังไม่กำหนดบริษัท"}</small></td><td>{activity.sessions.length ? activity.sessions.map((session, index) => <div key={session.id ?? index}><span>{fridayLiveDate(session.sessionDate)}</span><small>{session.startTime ?? "ยังไม่ระบุเวลา"} - {session.endTime ?? "ยังไม่ระบุเวลา"} · {session.location || "ยังไม่ระบุสถานที่"}</small></div>) : "ยังไม่มีรอบจัด"}</td><td>{LIVE_FRIDAY_FORMATS[activity.format]}</td><td><span className={`status-pill ${activity.status === "completed" ? "tone-green" : activity.status === "cancelled" ? "tone-neutral" : "tone-orange"}`}>{LIVE_FRIDAY_STATUSES[activity.status]}</span></td><td><button className="row-action" type="button" onClick={onOpen} aria-label={`ดูรายละเอียด ${activity.title}`}>รายละเอียด</button></td></tr>;
}

function validDatabaseId(value: string | null): value is string {
  return value !== null && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}

export function FridayLiveDashboard({ period }: { period: AcademicPeriod }) {
  const router = useRouter();
  const params = useSearchParams();
  const view: View = VIEWS.some(item => item.id === params.get("view")) ? params.get("view") as View : "overview";
  const evaluationPageParam = Number(params.get("evaluationPage"));
  const evaluationPage = Number.isInteger(evaluationPageParam) && evaluationPageParam >= 1 && evaluationPageParam <= 2147483647 ? evaluationPageParam : 1;
  const evaluationKindParam = params.get("evaluationKind") ?? "";
  const evaluationKind = ["student", "company", "reported", "unmatched"].includes(evaluationKindParam) ? evaluationKindParam : "";
  const includeProvisional = params.get("includeProvisional") === "true";
  const activityId = params.get("activityId");
  const validId = validDatabaseId(activityId);
  const [creating, setCreating] = useState(false);
  // URL is the source of truth for reload, shared links and browser traversal.
  const search = (params.get("q") ?? "").slice(0, 500);
  const statusParam = params.get("status") ?? "";
  const status = Object.prototype.hasOwnProperty.call(LIVE_FRIDAY_STATUSES, statusParam) ? statusParam : "";
  const companyParam = params.get("companyId");
  const companyId = validDatabaseId(companyParam) ? companyParam : "";
  const pageParam = Number(params.get("page"));
  const page = Number.isInteger(pageParam) && pageParam >= 1 && pageParam <= 2147483647 ? pageParam : 1;

  const [importOpen, setImportOpen] = useState(false);
  const importButton = useRef<HTMLButtonElement>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const dataset = useFridayActivities({ ...fridayApiPeriod(period), search: deferredSearch, status, companyId, page, pageSize: PAGE_SIZE }, view === "table");
  const reportQuery = { ...fridayApiPeriod(period), search: deferredSearch, status, companyId };
  const analytics = useFridayReport<FridayAnalytics>(view === "overview" ? fridayReportUrl("analytics", reportQuery) : null);
  const evaluations = useFridayReport<FridayEvaluations>(view === "evaluation" ? fridayReportUrl("evaluations", { ...reportQuery, includeProvisional, kind: evaluationKind, page: evaluationPage, pageSize: PAGE_SIZE }) : null);
  const { data, options, error, optionsError, loading } = dataset;
  const activeReport = view === "overview" ? analytics : evaluations;
  const connectionLoading = view === "table" ? loading : activeReport.loading;
  const connectionError = view === "table" ? error : activeReport.error;
  const lastUpdated = view === "table" ? data?.lastUpdated : activeReport.data?.lastUpdated;
  const hasData = view === "table" ? Boolean(data) : Boolean(activeReport.data);
  const years = [...new Set([period.year, new Date().getFullYear() + 543, ...(options?.periods.map(item => fridayUiPeriod(item).year) ?? [])])].sort((a, b) => b - a);
  const hasFilters = Boolean(search || status || companyId);
  function activityUrl(id: string | null, filters = { search, status, companyId, page }) {
    const query = new URLSearchParams(params.toString());
    query.set("year", String(period.year)); query.set("term", period.term);
    query.delete("activityId"); query.delete("q"); query.delete("status"); query.delete("companyId"); query.delete("page");
    if (id) query.set("activityId", id);
    if (filters.search) query.set("q", filters.search);
    if (filters.status) query.set("status", filters.status);
    if (filters.companyId) query.set("companyId", filters.companyId);
    if (filters.page > 1) query.set("page", String(filters.page));
    return `/dashboard/friday-activities?${query}`;
  }
  function openActivity(id: string) { router.push(activityUrl(id), { scroll: false }); }
  function closeActivity() { setCreating(false); if (activityId !== null) router.replace(activityUrl(null), { scroll: false }); }
  function changePeriod(next: AcademicPeriod) { router.push(`/dashboard/friday-activities?${new URLSearchParams({ year: String(next.year), term: next.term, view })}`, { scroll: false }); }
  function beforeWrite() { dataset.beforeWrite(); }
  function changed() { beforeWrite(); void dataset.reload(); void dataset.loadOptions(); void analytics.reload(); void evaluations.reload(); }
  function changeView(next: View) {
    const query = new URLSearchParams(params.toString()); query.set("view", next);
    window.history.pushState(null, "", `?${query}`);
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = VIEWS.findIndex(item => item.id === view);
    const next = event.key === "ArrowRight" ? (index + 1) % VIEWS.length : event.key === "ArrowLeft" ? (index + VIEWS.length - 1) % VIEWS.length : event.key === "Home" ? 0 : event.key === "End" ? VIEWS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); changeView(VIEWS[next].id); document.getElementById(`friday-tab-${VIEWS[next].id}`)?.focus();
  }
  function evaluationSettings(settings: { page?: number; includeProvisional?: boolean; kind?: string }) {
    const query = new URLSearchParams(params.toString());
    query.set("evaluationPage", String(settings.page ?? 1));
    if (settings.includeProvisional !== undefined) query.set("includeProvisional", String(settings.includeProvisional));
    if (settings.kind !== undefined) { query.delete("evaluationKind"); if (settings.kind) query.set("evaluationKind", settings.kind); }
    window.history.replaceState(null, "", `?${query}`);
  }
  function changeFilters(changes: Partial<{ search: string; status: string; companyId: string; page: number }>) {
    // Native history updates useSearchParams without a server navigation for
    // each keystroke, and do not create a history entry per character.
    const target = new URL(activityUrl(activityId, { search, status, companyId, page: 1, ...changes }), window.location.origin);
    if (changes.search !== undefined || changes.status !== undefined || changes.companyId !== undefined) target.searchParams.delete("evaluationPage");
    window.history.replaceState(null, "", target.pathname + target.search);
  }
  function clear() { changeFilters({ search: "", status: "", companyId: "" }); }
  const resultMessage = loading ? "กำลังอ่านรายการกิจกรรม…" : error ? "ยังยืนยันจำนวนกิจกรรมไม่ได้ กรุณาโหลดข้อมูลใหม่" : data ? `${hasFilters ? "พบ" : "แสดงทั้งหมด"} ${fridayLiveCount(data.total)} กิจกรรม${hasFilters ? "ตามตัวกรอง" : "ในภาคการศึกษานี้"}` : "ยังไม่ได้รับข้อมูล";
  return <div className="app-shell friday-dashboard friday-live-dashboard" data-ready={hasData && !connectionLoading} data-source="postgresql">
    <header className="topbar">
      <DashboardModuleNav />
      <div className="header-tools">
        <section className="academic-period-panel" aria-label="ช่วงการศึกษาที่แสดง">
          <div className="academic-period-fields">
            <label><span>ปีการศึกษา</span><select aria-label="เลือกปีการศึกษา" value={period.year} disabled={importOpen} onChange={event => changePeriod({ ...period, year: Number(event.target.value) })}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
            <label><span>ภาคการศึกษา</span><select aria-label="เลือกภาคการศึกษา" value={period.term} disabled={importOpen} onChange={event => changePeriod({ ...period, term: event.target.value as AcademicPeriod["term"] })}><option value="1">เทอม 1</option><option value="2">เทอม 2</option><option value="summer">ภาคฤดูร้อน</option></select></label>
          </div>
          {importOpen && <p className="academic-period-caption">ปิดการนำเข้าก่อนเปลี่ยนปีหรือภาคการศึกษา</p>}
        </section>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="page-content">
      <div className="friday-workspace-toolbar"><div className="io-subtabs" role="tablist" aria-label="มุมมองหน้า Friday Activity">{VIEWS.map(item => <button key={item.id} id={`friday-tab-${item.id}`} type="button" role="tab" aria-selected={view === item.id} aria-controls={`friday-panel-${item.id}`} tabIndex={view === item.id ? 0 : -1} onKeyDown={onTabKey} onClick={() => changeView(item.id)}>{item.label}</button>)}</div>
        <div className="friday-live-actions"><button className="primary-button" type="button" disabled={!options || Boolean(optionsError)} onClick={() => setCreating(true)}>สร้างกิจกรรม</button><button ref={importButton} className="secondary-button" type="button" disabled={!options || Boolean(optionsError)} onClick={() => setImportOpen(true)}>นำเข้า Excel / CSV</button><button className="secondary-button" type="button" disabled={loading || analytics.loading || evaluations.loading} onClick={changed}>โหลดข้อมูลใหม่</button></div>
      </div>
      <p className="panel-caption friday-live-connection" role="status"><span className={`tone-dot ${connectionError || optionsError ? "tone-orange" : "tone-green"}`} aria-hidden="true" />{academicPeriodLabel(period)} · ฐานข้อมูลกลาง · {connectionLoading ? "กำลังอ่านข้อมูล…" : connectionError ? "อ่านข้อมูลไม่สำเร็จ" : lastUpdated ? `ข้อมูลแก้ไขล่าสุด ${fridayLiveTimestamp(lastUpdated)}` : hasData ? view === "evaluation" ? "ยังไม่มีผลประเมินในขอบเขตนี้" : "ยังไม่มีกิจกรรมในภาคการศึกษานี้" : "ยังไม่ได้รับข้อมูล"}</p>
      {view === "table" && <nav className="page-sections" aria-label="ทางลัดในหน้านี้">{[{ id: "dashboard-filters", label: "ค้นหา" }, { id: "dashboard-directory", label: "ทะเบียน" }].map(section => <a key={section.id} href={`#${section.id}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); focusDashboardSection(section.id); }}>{section.label}</a>)}</nav>}
      {activityId !== null && !validId && <div role="alert" className="friday-live-alert">รหัสกิจกรรมในลิงก์ไม่ถูกต้อง <button type="button" className="text-button" onClick={closeActivity}>กลับสู่รายการ</button></div>}
      {view === "table" && error && <div className="friday-live-alert" role="alert"><strong>อ่านรายการกิจกรรมไม่สำเร็จ</strong><p>{error}</p>{data && <p>รายการด้านล่างเป็นข้อมูลที่อ่านสำเร็จครั้งก่อน กรุณาโหลดใหม่เพื่อตรวจข้อมูลปัจจุบัน</p>}<button className="secondary-button" type="button" onClick={() => void dataset.reload()}>ลองอ่านรายการอีกครั้ง</button></div>}
      {optionsError && <div className="friday-live-alert" role="alert"><p>อ่านทะเบียนบริษัท ผู้ติดต่อ และเจ้าหน้าที่ไม่สำเร็จ: {optionsError}</p><button className="secondary-button" type="button" onClick={() => void dataset.loadOptions()}>ลองอ่านทะเบียนอีกครั้ง</button></div>}
      {importOpen && options && <FridayLiveImport companies={options.companies} onClose={() => { setImportOpen(false); importButton.current?.focus(); }} onCommitted={changed} />}
      {view !== "table" && hasFilters && <div className="friday-report-filter-note" role="status"><span>ใช้ตัวกรองร่วมกัน: {[search, options?.companies.find(company => company.id === companyId)?.name, status ? LIVE_FRIDAY_STATUSES[status as keyof typeof LIVE_FRIDAY_STATUSES] : ""].filter(Boolean).join(" · ")}</span><button className="text-button" type="button" onClick={() => changeView("table")}>ปรับตัวกรอง</button><button className="text-button" type="button" onClick={clear}>ล้างตัวกรองทั้งหมด</button></div>}
      <section id="friday-panel-overview" role="tabpanel" aria-labelledby="friday-tab-overview" hidden={view !== "overview"}>
        <FridayLiveOverview data={analytics.data} loading={analytics.loading} error={analytics.error} onRetry={() => void analytics.reload()} onFilter={filters => { const target = new URL(activityUrl(null, { search, status, companyId, page: 1, ...filters }), window.location.origin); target.searchParams.set("view", "table"); target.searchParams.delete("evaluationPage"); window.history.pushState(null, "", target.pathname + target.search); }} />
      </section>
      <section id="friday-panel-evaluation" role="tabpanel" aria-labelledby="friday-tab-evaluation" hidden={view !== "evaluation"}>
        <FridayLiveEvaluationBoard data={evaluations.data} loading={evaluations.loading} error={evaluations.error} includeProvisional={includeProvisional} kind={evaluationKind} companies={options?.companies ?? []} companyId={companyId} search={search} onFilters={changeFilters} onSettings={evaluationSettings} onPage={page => evaluationSettings({ page })} onOpen={openActivity} onRetry={() => void evaluations.reload()} />
      </section>
      <section id="friday-panel-table" role="tabpanel" aria-labelledby="friday-tab-table" hidden={view !== "table"}>
      <section id="dashboard-filters" tabIndex={-1} className="control-panel" aria-label="ค้นหาและกรองกิจกรรม"><div className="control-heading"><h3>ค้นหาและกรองกิจกรรม</h3><button className="text-button" type="button" disabled={!hasFilters} onClick={clear}>ล้างตัวกรอง</button></div><FilterFields activeCount={Number(Boolean(status)) + Number(Boolean(companyId))} search={<label className="search-field"><span>ค้นหากิจกรรม บริษัท ศาสตร์ หรือสถานที่</span><input type="search" value={search} maxLength={500} onChange={event => changeFilters({ search: event.target.value })} placeholder="เช่น หัวข้อกิจกรรม บริษัท หรือห้องจัดงาน…" /></label>}><label><span>บริษัท</span><select value={companyId} onChange={event => changeFilters({ companyId: event.target.value })}><option value="">ทุกบริษัท</option>{options?.companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label><span>สถานะ</span><select value={status} onChange={event => changeFilters({ status: event.target.value })}><option value="">ทุกสถานะ</option>{Object.entries(LIVE_FRIDAY_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></FilterFields>
        <ResultAnnouncer message={resultMessage} />
        <FilterSummary summary={resultMessage} filters={[
          ...(search ? [{ label: "ค้นหา", value: search, onClear: () => changeFilters({ search: "" }) }] : []),
          ...(companyId ? [{ label: "บริษัท", value: options?.companies.find(company => company.id === companyId)?.name ?? `บริษัท ${companyId}`, onClear: () => changeFilters({ companyId: "" }) }] : []),
          ...(status ? [{ label: "สถานะ", value: LIVE_FRIDAY_STATUSES[status as keyof typeof LIVE_FRIDAY_STATUSES], onClear: () => changeFilters({ status: "" }) }] : []),
        ]} />
      </section>
      <section id="dashboard-directory" tabIndex={-1} className="panel table-panel" aria-labelledby="friday-live-directory-title" aria-busy={loading}><div className="panel-heading table-heading"><div><p className="section-kicker">กิจกรรมรายเทอม</p><h3 id="friday-live-directory-title">ทะเบียน Friday Activity</h3></div><span className="panel-caption">{data ? `${fridayLiveCount(data.total)} กิจกรรม` : loading ? "กำลังอ่านรายการ" : "อ่านรายการไม่ได้"}</span></div>
        <div className="table-scroll-note">บนมือถือจะแสดงเป็นการ์ด พร้อมสถานะและรายละเอียดกิจกรรม</div>
        <div className="table-wrap"><table><caption className="sr-only">กิจกรรม บริษัท รอบจัด และสถานะ</caption><thead><tr><th scope="col">กิจกรรม / บริษัท</th><th scope="col">รอบจัด / สถานที่</th><th scope="col">รูปแบบ</th><th scope="col">สถานะ</th><th scope="col"><span className="sr-only">รายละเอียด</span></th></tr></thead><tbody>{data?.items.map(activity => <LiveActivityRow key={activity.id} activity={activity} onOpen={() => openActivity(activity.id)} />)}{!data?.items.length && <tr><td colSpan={5}><p className="empty-result" role="status">{loading ? "กำลังอ่านกิจกรรมจากฐานข้อมูลกลาง…" : error ? "ยังแสดงรายการปัจจุบันไม่ได้ กรุณาลองอ่านข้อมูลอีกครั้ง" : data?.total ? "หน้านี้ไม่มีรายการกิจกรรม เลือกกลับหน้าแรกเพื่อดูข้อมูล": hasFilters ? "ไม่พบกิจกรรมที่ตรงกับตัวกรอง" : "ยังไม่มีกิจกรรมในช่วงการศึกษานี้ เริ่มได้ด้วยการสร้างกิจกรรมหรือนำเข้าไฟล์"}</p></td></tr>}</tbody></table></div>
        <div className="mobile-course-list" aria-label="รายการกิจกรรมแบบมือถือ">{data?.items.map(activity => <article className="mobile-course-card" key={activity.id}><div className="mobile-course-card-header"><button className="course-link mobile-course-link" type="button" onClick={() => openActivity(activity.id)}><strong>{activity.title}</strong></button><span className={`status-pill ${activity.status === "completed" ? "tone-green" : activity.status === "cancelled" ? "tone-neutral" : "tone-orange"}`}>{LIVE_FRIDAY_STATUSES[activity.status]}</span></div><div className="mobile-course-meta"><span>{activity.companies.map(company => company.name).join(" · ") || "ยังไม่กำหนดบริษัท"}</span><span>{LIVE_FRIDAY_FORMATS[activity.format]} · {activity.sessions.length} รอบ</span>{activity.sessions.map((session, index) => <span key={session.id ?? index}>{fridayLiveDate(session.sessionDate)} · {session.location || "ยังไม่ระบุสถานที่"}</span>)}</div><button className="row-action" type="button" onClick={() => openActivity(activity.id)} aria-label={`ดูรายละเอียด ${activity.title}`}>รายละเอียด</button></article>)}{!data?.items.length && <p className="empty-result" role="status">{loading ? "กำลังอ่านกิจกรรมจากฐานข้อมูลกลาง…" : error ? "ยังแสดงรายการปัจจุบันไม่ได้ กรุณาลองอ่านข้อมูลอีกครั้ง" : data?.total ? "หน้านี้ไม่มีรายการกิจกรรม เลือกกลับหน้าแรกเพื่อดูข้อมูล": hasFilters ? "ไม่พบกิจกรรมที่ตรงกับตัวกรอง" : "ยังไม่มีกิจกรรมในช่วงการศึกษานี้ เริ่มได้ด้วยการสร้างกิจกรรมหรือนำเข้าไฟล์"}</p>}</div>
        {data && !data.items.length && data.total > 0 && <button type="button" className="secondary-button" onClick={() => changeFilters({ page: 1 })}>กลับหน้าแรกของกิจกรรม</button>}
        {data && <Pager page={data.page} pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))} total={data.total} unit="กิจกรรม" onChange={page => changeFilters({ page })} />}
      </section>
      </section>
    </main>
    {(creating || validId) && options && <FridayLiveDetail key={creating ? "new" : activityId!} id={creating ? null : activityId} period={period} options={options} onClose={closeActivity} beforeWrite={beforeWrite} onMutation={changed} onCreated={id => { setCreating(false); router.replace(activityUrl(id), { scroll: false }); }} />}
  </div>;
}
