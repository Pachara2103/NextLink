"use client";

import { FridayMouFollowUps } from "./friday-mou-followups";
import { lazy, useDeferredValue, useState } from "react";
import { AppNav, DashboardModuleNav } from "./app-nav";
import { AcademicPeriodEmptyState, AcademicPeriodSelector } from "./academic-period-selector";
import { DeferredRecordDialog } from "./deferred-record-dialog";
import { EmptyResult } from "./empty-result";
import { FilterFields } from "./filter-fields";
import { FilterSummary } from "./filter-summary";
import { FridayStudentRatings } from "./friday-evaluations";
import { LocalDataStatus, StorageWarning } from "./local-data-status";
import { PAGE_SIZE, Pager } from "./pager";
import { PageSections } from "./page-sections";
import { ResultAnnouncer } from "./result-announcer";
import { StatusToast, useStatusToast } from "./status-toast";
import { StorageRecoveryPanel } from "./storage-recovery";
import { academicPeriodLabel } from "../lib/academic-period";
import { applyFridayDraft, FRIDAY_FORMAT, FRIDAY_STATUS, formatFridayDate, fridayCompanySummary, fridayCount, fridayFollowUps, fridayScore, fridayStorageKey, fridaySummary, fridayYears, isFridayActivity, type FridayActivity, type FridayDraft } from "../lib/friday-activity";
import { focusDashboardSection } from "../lib/section-navigation";
import { useAcademicPeriod } from "../lib/use-academic-period";
import { useDashboardDataset } from "../lib/use-dashboard-dataset";
import { useRecordDialog } from "../lib/use-record-dialog";
import { useUrlFilters } from "../lib/use-url-filters";

const FridayDialog = lazy(() => import("./friday-detail-dialog").then(module => ({ default: module.FridayDetailDialog })));
const statusTone = { completed: "tone-green", scheduled: "tone-orange", cancelled: "tone-neutral" } as const;

export function FridayDashboard({ activities }: { activities: FridayActivity[] }) {
  const dataset = useDashboardDataset(fridayStorageKey, activities, isFridayActivity);
  const { items } = dataset;
  const period = useAcademicPeriod();
  const dialog = useRecordDialog(items);
  const notice = useStatusToast();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [format, setFormat] = useState("all");
  const [status, setStatus] = useState("all");
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);
  const [sort, setSort] = useState("date");
  const [page, setPage] = useState(1);
  const search = useDeferredValue(query).trim().toLocaleLowerCase("th");
  const companies = fridayCompanySummary(items);
  const filtered = items.filter(item => (!search || [item.title, item.companyName, item.domain, item.location, item.description, item.notes].join(" ").toLocaleLowerCase("th").includes(search))
    && (company === "all" || item.companyId === company) && (format === "all" || item.format === format)
    && (status === "all" || item.status === status) && (!onlyFollowUps || fridayFollowUps(item).length > 0));
  const summary = fridaySummary(filtered);
  const overall = summary.ratings.find(rating => rating.key === "overall")!;
  const followUps = filtered.filter(item => fridayFollowUps(item).length > 0);
  const ordered = [...filtered].sort((a, b) => sort === "company" ? a.companyName.localeCompare(b.companyName, "th") || a.sequence - b.sequence : (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.sequence - b.sequence);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount);
  const paged = ordered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const scope = JSON.stringify([query, company, format, status, onlyFollowUps, sort]);
  const [previousScope, setPreviousScope] = useState(scope);
  if (scope !== previousScope) { setPreviousScope(scope); setPage(1); }
  const hasFilters = Boolean(query.trim()) || company !== "all" || format !== "all" || status !== "all" || onlyFollowUps;
  const completed = filtered.filter(item => item.status === "completed");
  const companyFeedback = completed.filter(item => item.companyEvaluations.length > 0);
  const companyRows = fridayCompanySummary(filtered);
  const resetFilters = () => { setQuery(""); setCompany("all"); setFormat("all"); setStatus("all"); setOnlyFollowUps(false); setSort("date"); };
  useUrlFilters({ q: query.trim(), company: company === "all" ? "" : company, format: format === "all" ? "" : format, status: status === "all" ? "" : status, followups: onlyFollowUps ? "1" : "", sort: sort === "date" ? "" : sort }, found => {
    if (found.q) setQuery(found.q);
    if (found.company) setCompany(found.company);
    if (found.format && Object.hasOwn(FRIDAY_FORMAT, found.format)) setFormat(found.format);
    if (found.status && Object.hasOwn(FRIDAY_STATUS, found.status)) setStatus(found.status);
    if (found.followups === "1") setOnlyFollowUps(true);
    if (found.sort === "company") setSort("company");
  });
  const saveActivity = async (id: string, draft: FridayDraft) => {
    const saved = await dataset.update(current => current.map(item => item.id === id ? applyFridayDraft(item, draft) : item));
    notice.show(saved ? "บันทึกกิจกรรมแล้ว" : "บันทึกไม่ได้ การแก้ไขยังอยู่ในแบบฟอร์ม", saved ? dataset.undo : undefined);
    return saved;
  };
  const resetData = async () => {
    if (!window.confirm("คืนค่าข้อมูลตั้งต้นและลบการแก้ไข Friday Activity ของเทอมนี้ในเบราว์เซอร์นี้หรือไม่?")) return;
    notice.show(await dataset.reset() ? "คืนค่าข้อมูลตั้งต้นแล้ว" : "คืนค่าไม่ได้ ข้อมูลเดิมยังอยู่");
  };
  const empty = <EmptyResult message="ไม่พบกิจกรรมที่ตรงกับตัวกรอง" hasFilters={hasFilters} onClear={resetFilters} />;

  return <div className="app-shell friday-dashboard" data-ready={dataset.ready}>
    <header className="topbar"><AppNav title="Friday Activity" /><div className="header-tools">
      <div className="header-meta"><span>ข้อมูลตัวอย่าง · กิจกรรมและผลประเมิน</span><LocalDataStatus source="mock" editedAt={dataset.editedAt} warning={dataset.warning} hasOverrides={dataset.hasOverrides} timezone="Asia/Bangkok" onReset={resetData} /></div>
      <AcademicPeriodSelector availableYears={fridayYears} />
    </div></header>
    <DashboardModuleNav />
    <main id="main-content" tabIndex={-1} className="page-content">
      <AcademicPeriodEmptyState hasData={items.length > 0} />
      <StorageWarning message={dataset.warning} /><StorageRecoveryPanel key={dataset.recovery?.raw} recovery={dataset.recovery} onRecover={dataset.recover} />
      <section className="intro-row"><div><p className="section-kicker">เรียนรู้ร่วมกับบริษัท</p><h2>ภาพรวม Friday Activity</h2><p className="intro-copy">ติดตามกิจกรรม บริษัทที่เข้าร่วม และเสียงสะท้อนจากนิสิตกับบริษัทในแต่ละเทอม</p></div><span className="scope-chip">{academicPeriodLabel(period)}</span></section>
      <PageSections friday />
      <section className="kpi-grid" aria-label="ตัวชี้วัดหลัก">
        <article className="kpi-card orange"><div className="kpi-topline"><span className="kpi-label">ต้องติดตาม</span><span className="kpi-context">ตามตัวกรอง</span></div><div className="kpi-value">{followUps.length}</div><button type="button" className="text-button friday-kpi-link" onClick={() => focusDashboardSection("action-queue")}>ดูรายการที่ต้องทำต่อ →</button></article>
        <article className="kpi-card blue"><div className="kpi-topline"><span className="kpi-label">กิจกรรมทั้งหมด</span><span className="kpi-context">ตามตัวกรอง</span></div><div className="kpi-value">{summary.total}</div><div className="kpi-note">จัดแล้ว {summary.completed} · รอจัด {filtered.filter(item => item.status === "scheduled").length} · ยกเลิก {filtered.filter(item => item.status === "cancelled").length}</div></article>
        <article className="kpi-card green"><div className="kpi-topline"><span className="kpi-label">บริษัทที่มาจัดแล้ว</span><span className="kpi-context">ไม่ซ้ำบริษัท</span></div><div className="kpi-value">{summary.companies}</div><div className="kpi-note">เฉพาะกิจกรรมที่จัดแล้วตามตัวกรอง</div></article>
        <article className="kpi-card purple"><div className="kpi-topline"><span className="kpi-label">ผู้เข้าร่วมจริง</span><span className="kpi-context">คน-ครั้ง</span></div><div className={`kpi-value${summary.attended === null ? " compact" : ""}`}>{summary.attended === null ? "—" : fridayCount(summary.attended)}</div><div className="kpi-note">{summary.attended === null ? "ยังไม่มีจำนวนมาจริง" : "รวมจำนวนมาจริงจากกิจกรรมที่จัดแล้ว"}{summary.unknownAttendance > 0 ? ` · ยังขาด ${summary.unknownAttendance} กิจกรรม` : ""}</div></article>
        <article className="kpi-card green"><div className="kpi-topline"><span className="kpi-label">ความพึงพอใจนิสิต</span><span className="kpi-context">เต็ม 5</span></div><div className="kpi-value">{overall.mean === null ? "—" : fridayScore(overall.mean)}</div><div className="kpi-note">{overall.count ? `ด้านภาพรวม · ${overall.count} คำตอบที่มีคะแนน` : "ยังไม่มีคะแนนจากแบบประเมิน"}</div></article>
      </section>

      <section id="dashboard-filters" tabIndex={-1} className="control-panel" aria-label="ตัวกรองข้อมูล">
        <div className="control-heading"><h3>ค้นหาและกรองกิจกรรม</h3><button className="text-button" type="button" onClick={resetFilters} disabled={!hasFilters}>ล้างตัวกรอง</button></div>
        <FilterFields activeCount={[company, format, status].filter(value => value !== "all").length} search={<label className="search-field"><span>ค้นหากิจกรรม บริษัท ศาสตร์ หรือสถานที่</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="เช่น Cloud, Workshop, ตึกร้อยปี…" /></label>}>
          <label><span>บริษัท</span><select value={company} onChange={event => setCompany(event.target.value)}><option value="all">ทุกบริษัท</option>{company !== "all" && !companies.some(item => item.id === company) && <option value={company}>ไม่พบบริษัทที่เลือก</option>}{companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>รูปแบบกิจกรรม</span><select value={format} onChange={event => setFormat(event.target.value)}><option value="all">ทุกรูปแบบ</option>{Object.entries(FRIDAY_FORMAT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>สถานะกิจกรรม</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">ทุกสถานะ</option>{Object.entries(FRIDAY_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </FilterFields>
        <label className="friday-followup-toggle"><input type="checkbox" checked={onlyFollowUps} onChange={event => setOnlyFollowUps(event.target.checked)} />เฉพาะกิจกรรมที่ต้องติดตาม</label>
        <ResultAnnouncer message={`พบ ${filtered.length} กิจกรรมตามตัวกรองปัจจุบัน`} />
        <FilterSummary summary={`แสดง ${filtered.length} จาก ${items.length} กิจกรรมในเทอมนี้`} filters={[
          ...(query.trim() ? [{ label: "ค้นหา", value: query.trim(), onClear: () => setQuery("") }] : []),
          ...(company !== "all" ? [{ label: "บริษัท", value: companies.find(item => item.id === company)?.name ?? "ไม่พบบริษัทที่เลือก", onClear: () => setCompany("all") }] : []),
          ...(format !== "all" ? [{ label: "รูปแบบ", value: FRIDAY_FORMAT[format as keyof typeof FRIDAY_FORMAT], onClear: () => setFormat("all") }] : []),
          ...(status !== "all" ? [{ label: "สถานะ", value: FRIDAY_STATUS[status as keyof typeof FRIDAY_STATUS], onClear: () => setStatus("all") }] : []),
          ...(onlyFollowUps ? [{ label: "ต้องติดตาม", onClear: () => setOnlyFollowUps(false) }] : []),
        ]} />
      </section>

      <section id="action-queue" tabIndex={-1} className="panel follow-up-panel" aria-labelledby="friday-followups-title">
        <div className="panel-heading"><div><p className="section-kicker">งานที่ต้องดำเนินการต่อ</p><h3 id="friday-followups-title">ติดตามรายละเอียดและผลหลังจบกิจกรรม</h3></div><span className="count-chip">{followUps.length} กิจกรรม</span></div>
        <div className="follow-up-list">{followUps.length ? followUps.map(item => <button className="follow-up-item" key={item.id} type="button" onClick={event => dialog.open(item.id, event.currentTarget)}><span className="follow-up-icon" aria-hidden="true">!</span><span className="follow-up-copy"><strong>{item.title}</strong><small>{fridayFollowUps(item).join(" · ")}</small></span><span className="chevron" aria-hidden="true">›</span></button>) : <EmptyResult message="ไม่มีรายการต้องติดตามตามตัวกรองปัจจุบัน" hasFilters={hasFilters} onClear={resetFilters} />}</div>
      </section>

      <section id="dashboard-directory" tabIndex={-1} className="panel table-panel" aria-labelledby="friday-directory-title">
        <div className="panel-heading table-heading"><div><p className="section-kicker">กิจกรรมรายเทอม</p><h3 id="friday-directory-title">รายการ Friday Activity</h3></div><label className="table-sort"><span>เรียงตาม</span><select aria-label="เรียงรายการกิจกรรม" value={sort} onChange={event => setSort(event.target.value)}><option value="date">วันที่จัดกิจกรรม</option><option value="company">บริษัท</option></select></label></div>
        <p className="panel-caption friday-table-note">จำนวนรับ / จอง / มาจริงแยกกัน · — หมายถึงยังไม่มีข้อมูล</p>
        <div className="table-wrap"><table>
          <caption className="sr-only">กิจกรรม บริษัท วันเวลา จำนวนคน และสถานะ</caption>
          <thead><tr><th scope="col">กิจกรรม / บริษัท</th><th scope="col">วัน เวลา / สถานที่</th><th scope="col">รูปแบบ</th><th scope="col">รับ</th><th scope="col">จอง</th><th scope="col">มาจริง</th><th scope="col">สถานะ / ผลประเมิน</th><th scope="col"><span className="sr-only">รายละเอียด</span></th></tr></thead>
          <tbody>{paged.length ? paged.map(item => <tr key={item.id}>
            <td><button type="button" className="course-link" onClick={event => dialog.open(item.id, event.currentTarget)}><span className="course-code">ครั้งที่ {item.sequence} · {item.domain}</span><strong>{item.title}</strong></button><small>{item.companyName}</small></td>
            <td><span>{formatFridayDate(item.date)}</span><small>{item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : "ยังไม่ระบุเวลาครบ"}</small><small>{item.location || "ยังไม่ระบุสถานที่"}</small></td>
            <td>{FRIDAY_FORMAT[item.format]}</td>
            {(["capacity", "booked", "attended"] as const).map(key => <td key={key}><span aria-label={item[key] === null ? "ยังไม่มีข้อมูล" : undefined}>{item[key] === null ? "—" : fridayCount(item[key])}</span></td>)}
            <td><span className={`status-pill ${statusTone[item.status]}`}>{FRIDAY_STATUS[item.status]}</span><small>นิสิต {item.studentEvaluations.length} · บริษัท {item.companyEvaluations.length} แบบประเมิน</small></td>
            <td><button className="row-action" type="button" onClick={event => dialog.open(item.id, event.currentTarget)} aria-label={`ดูรายละเอียด ${item.title}`}>รายละเอียด</button></td>
          </tr>) : <tr><td colSpan={8}>{empty}</td></tr>}</tbody>
        </table></div>
        <div className="mobile-course-list" aria-label="รายการกิจกรรมแบบมือถือ">{paged.length ? paged.map(item => <article className="mobile-course-card" key={item.id}>
          <div className="mobile-course-card-header"><button className="course-link mobile-course-link" type="button" onClick={event => dialog.open(item.id, event.currentTarget)}><span className="course-code">ครั้งที่ {item.sequence} · {FRIDAY_FORMAT[item.format]}</span><strong>{item.title}</strong></button><span className={`status-pill ${statusTone[item.status]}`}>{FRIDAY_STATUS[item.status]}</span></div>
          <div className="mobile-course-meta"><span>{item.companyName}</span><span>{formatFridayDate(item.date)} · {item.startTime || "ยังไม่ระบุเวลา"}{item.endTime ? `–${item.endTime}` : ""}</span><span>{item.location || "ยังไม่ระบุสถานที่"}</span></div>
          <div className="friday-attendance-grid">{([ ["capacity", "รับ"], ["booked", "จอง"], ["attended", "มาจริง"] ] as const).map(([key, label]) => <div key={key}><span>{label}</span><strong>{item[key] === null ? "—" : fridayCount(item[key])}</strong></div>)}</div>
          <p className="panel-caption">แบบประเมิน: นิสิต {item.studentEvaluations.length} · บริษัท {item.companyEvaluations.length}</p>
          <button className="row-action" type="button" onClick={event => dialog.open(item.id, event.currentTarget)} aria-label={`ดูรายละเอียด ${item.title}`}>รายละเอียด →</button>
        </article>) : empty}</div>
        <Pager page={activePage} pageCount={pageCount} total={ordered.length} unit="กิจกรรม" onChange={setPage} />
      </section>

      <FridayMouFollowUps />
      <section id="friday-companies" tabIndex={-1} className="panel friday-section" aria-labelledby="friday-companies-title">
        <div className="panel-heading"><div><p className="section-kicker">ความร่วมมือในแต่ละเทอม</p><h3 id="friday-companies-title">บริษัทในเทอมนี้</h3></div><span className="panel-caption">ตามตัวกรอง · กดชื่อบริษัทเพื่อดูรายการ</span></div>
        <div className="friday-company-list">{companyRows.length ? companyRows.map(item => <button className="friday-company-row" type="button" key={item.id} aria-pressed={company === item.id} onClick={() => { setCompany(company === item.id ? "all" : item.id); focusDashboardSection("dashboard-directory"); }}><strong>{item.name}</strong><span><b>{item.completed}</b> จัดแล้ว · {item.scheduled} รอจัด · {item.cancelled} ยกเลิก</span><span aria-hidden="true">→</span></button>) : empty}</div>
      </section>

      <section id="dashboard-analysis" tabIndex={-1} className="analytics-grid friday-analysis" aria-label="ผลประเมินกิจกรรม">
        <article className="panel"><div className="panel-heading"><div><p className="section-kicker">เสียงสะท้อนจากนิสิต</p><h3>ผลประเมินนิสิต 4 ด้าน</h3></div><span className="panel-caption">{summary.studentResponses} แบบประเมิน</span></div>
          <p className="panel-caption">กิจกรรมที่จัดแล้วตามตัวกรอง · มีคำตอบ {completed.filter(item => item.studentEvaluations.length > 0).length} จาก {completed.length} กิจกรรม</p>
          <FridayStudentRatings activities={filtered} />
          <p className="friday-method-note">เฉลี่ยจากคำตอบที่มีคะแนนของแต่ละด้าน ค่าว่างไม่คิดเป็น 0 และไม่นำคะแนนสรุปจากตารางมารวม</p>
        </article>
        <article className="panel"><div className="panel-heading"><div><p className="section-kicker">เสียงสะท้อนจากบริษัท</p><h3>ผลประเมินบริษัท</h3></div><span className="panel-caption">{summary.companyResponses} แบบประเมิน</span></div>
          <p className="panel-caption">มีคำตอบ {companyFeedback.length} จาก {completed.length} กิจกรรมที่จัดแล้ว · ความคิดเห็นเรื่องกิจกรรม หัวข้อเพิ่มเติม และการพัฒนาหลักสูตร</p>
          <div className="friday-feedback-list">{companyFeedback.length ? companyFeedback.map(item => <div className="friday-feedback" key={item.id}><strong>{item.companyName}</strong><small>{item.title} · {formatFridayDate(item.date)}</small><p className="friday-feedback-excerpt">{item.companyEvaluations[0].experience || "มีความคิดเห็นในด้านอื่น ดูรายละเอียดเพิ่มเติม"}</p><button className="text-button" type="button" onClick={event => dialog.open(item.id, event.currentTarget)}>อ่านความคิดเห็นครบ 3 ด้าน →</button></div>) : <EmptyResult message="ยังไม่มีผลประเมินบริษัทสำหรับกิจกรรมที่เลือก" hasFilters={hasFilters} onClear={resetFilters} />}</div>
        </article>
      </section>
    </main>
    {dialog.selected && <DeferredRecordDialog key={dialog.selected.id} dialogRef={dialog.dialogRef} onClose={dialog.close}><FridayDialog activity={dialog.selected} dialogRef={dialog.dialogRef} onClose={dialog.close} onSave={saveActivity} /></DeferredRecordDialog>}
    <StatusToast toast={notice.toast} onDismiss={notice.dismiss} onHold={notice.holdTimer} onResume={notice.resumeTimer} />
  </div>;
}
