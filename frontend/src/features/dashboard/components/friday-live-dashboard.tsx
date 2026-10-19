"use client";

import { useDeferredValue, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FridayActivityRecord } from "@/lib/services/friday-activity";
import { academicPeriodLabel, type AcademicPeriod } from "../lib/academic-period";
import { LIVE_FRIDAY_FORMATS, LIVE_FRIDAY_STATUSES, fridayApiPeriod, fridayLiveCount, fridayLiveDate, fridayLiveTimestamp, fridayUiPeriod } from "../lib/friday-api";
import { useFridayActivities } from "../lib/use-friday-activities";
import { AppNav, DashboardModuleNav } from "./app-nav";
import { FilterFields } from "./filter-fields";
import { PAGE_SIZE, Pager } from "./pager";
import { FridayLiveDetail } from "./friday-live-detail";
import { FridayLiveImport } from "./friday-live-import";
import "./friday-live.css";

function LiveActivityRow({ activity, onOpen }: { activity: FridayActivityRecord; onOpen: () => void }) {
  return <tr><td><button className="course-link" type="button" onClick={onOpen}><strong>{activity.title}</strong><span className="course-code">{activity.domain || "ยังไม่ระบุศาสตร์"}</span></button><small>{activity.companies.map(company => company.name).join(" · ") || "ยังไม่กำหนดบริษัท"}</small></td><td>{activity.sessions.length ? activity.sessions.map((session, index) => <div key={session.id ?? index}><span>{fridayLiveDate(session.sessionDate)}</span><small>{session.startTime ?? "ยังไม่ระบุเวลา"} - {session.endTime ?? "ยังไม่ระบุเวลา"} · {session.location || "ยังไม่ระบุสถานที่"}</small></div>) : "ยังไม่มีรอบจัด"}</td><td>{LIVE_FRIDAY_FORMATS[activity.format]}</td><td><span className={`status-pill ${activity.status === "completed" ? "tone-green" : activity.status === "cancelled" ? "tone-neutral" : "tone-orange"}`}>{LIVE_FRIDAY_STATUSES[activity.status]}</span></td><td><button className="row-action" type="button" onClick={onOpen} aria-label={`ดูรายละเอียด ${activity.title}`}>รายละเอียด</button></td></tr>;
}

function validDatabaseId(value: string | null): value is string {
  return value !== null && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}

export function FridayLiveDashboard({ period }: { period: AcademicPeriod }) {
  const router = useRouter();
  const params = useSearchParams();
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
  const deferredSearch = useDeferredValue(search.trim());
  const dataset = useFridayActivities({ ...fridayApiPeriod(period), search: deferredSearch, status, companyId, page, pageSize: PAGE_SIZE });
  const { data, options, error, optionsError, loading } = dataset;
  const years = [...new Set([period.year, new Date().getFullYear() + 543, ...(options?.periods.map(item => fridayUiPeriod(item).year) ?? [])])].sort((a, b) => b - a);
  const hasFilters = Boolean(search || status || companyId);
  function activityUrl(id: string | null, filters = { search, status, companyId, page }) {
    const query = new URLSearchParams({ year: String(period.year), term: period.term });
    if (id) query.set("activityId", id);
    if (filters.search) query.set("q", filters.search);
    if (filters.status) query.set("status", filters.status);
    if (filters.companyId) query.set("companyId", filters.companyId);
    if (filters.page > 1) query.set("page", String(filters.page));
    return `/dashboard/friday-activities?${query}`;
  }
  function openActivity(id: string) { router.push(activityUrl(id), { scroll: false }); }
  function closeActivity() { setCreating(false); if (activityId !== null) router.replace(activityUrl(null), { scroll: false }); }
  function changePeriod(next: AcademicPeriod) { router.push(`/dashboard/friday-activities?${new URLSearchParams({ year: String(next.year), term: next.term })}`, { scroll: false }); }
  function changed() { dataset.beforeWrite(); void dataset.reload(); void dataset.loadOptions(); }
  function changeFilters(changes: Partial<{ search: string; status: string; companyId: string; page: number }>) {
    // Native history updates useSearchParams without a server navigation for
    // each keystroke, and do not create a history entry per character.
    window.history.replaceState(null, "", activityUrl(activityId, { search, status, companyId, page: 1, ...changes }));
  }
  function clear() { changeFilters({ search: "", status: "", companyId: "" }); }
  const summary = data?.summary;
  return <div className="app-shell friday-dashboard friday-live-dashboard" data-ready={Boolean(data) && !loading} data-source="postgresql">
    <header className="topbar"><AppNav title="Friday Activity" /><div className="header-tools"><div className="header-meta"><span>ทะเบียนกิจกรรมจากฐานข้อมูลกลาง</span><span role="status">{loading ? "กำลังอ่านข้อมูล…" : error ? "อ่านข้อมูลไม่สำเร็จ" : data ? `ข้อมูลแก้ไขล่าสุด ${fridayLiveTimestamp(data.lastUpdated)}` : "ยังไม่ได้รับข้อมูล"}</span></div><section className="academic-period-panel" aria-label="ช่วงการศึกษาที่แสดง"><div className="academic-period-fields"><label><span>ปีการศึกษา</span><select aria-label="เลือกปีการศึกษา" value={period.year} onChange={event => changePeriod({ ...period, year: Number(event.target.value) })}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label><label><span>ภาคการศึกษา</span><select aria-label="เลือกภาคการศึกษา" value={period.term} onChange={event => changePeriod({ ...period, term: event.target.value as AcademicPeriod["term"] })}><option value="1">เทอม 1</option><option value="2">เทอม 2</option><option value="summer">ภาคฤดูร้อน</option></select></label></div></section></div></header>
    <DashboardModuleNav />
    <main id="main-content" tabIndex={-1} className="page-content">
      <section className="intro-row"><div><p className="section-kicker">เรียนรู้ร่วมกับบริษัท</p><h2>ทะเบียน Friday Activity</h2><p className="intro-copy">สร้างกิจกรรม จัดรอบ ติดตามการติดต่อและผลการจัดงานร่วมกัน</p></div><span className="scope-chip">{academicPeriodLabel(period)}</span></section>
      <div className="friday-live-actions"><button className="primary-button" type="button" disabled={!options || Boolean(optionsError)} onClick={() => setCreating(true)}>สร้างกิจกรรม</button><button className="secondary-button" type="button" disabled={!options || Boolean(optionsError)} onClick={() => setImportOpen(true)}>นำเข้า Excel / CSV</button><button className="secondary-button" type="button" disabled={loading} onClick={() => { void dataset.reload(); void dataset.loadOptions(); }}>โหลดข้อมูลใหม่</button></div>
      {activityId !== null && !validId && <div role="alert" className="friday-live-alert">รหัสกิจกรรมในลิงก์ไม่ถูกต้อง <button type="button" className="text-button" onClick={closeActivity}>กลับสู่รายการ</button></div>}
      {error && <div className="friday-live-alert" role="alert"><strong>อ่านรายการกิจกรรมไม่สำเร็จ</strong><p>{error}</p>{data && <p>รายการด้านล่างเป็นข้อมูลที่อ่านสำเร็จครั้งก่อน กรุณาโหลดใหม่เพื่อตรวจข้อมูลปัจจุบัน</p>}<button className="secondary-button" type="button" onClick={() => void dataset.reload()}>ลองอ่านรายการอีกครั้ง</button></div>}
      {optionsError && <div className="friday-live-alert" role="alert"><p>อ่านทะเบียนบริษัท ผู้ติดต่อ และเจ้าหน้าที่ไม่สำเร็จ: {optionsError}</p><button className="secondary-button" type="button" onClick={() => void dataset.loadOptions()}>ลองอ่านทะเบียนอีกครั้ง</button></div>}
      {importOpen && options && <FridayLiveImport companies={options.companies} onClose={() => setImportOpen(false)} onCommitted={changed} />}
      <section className="kpi-grid" aria-label="ตัวชี้วัดกิจกรรมจากฐานข้อมูลกลาง" aria-busy={loading}>
        <article className="kpi-card blue"><span className="kpi-label">กิจกรรมทั้งหมด</span><div className="kpi-value">{summary ? fridayLiveCount(summary.total) : "—"}</div><p className="kpi-note">ตามเทอมและตัวกรอง</p></article>
        <article className="kpi-card green"><span className="kpi-label">เสร็จสิ้น</span><div className="kpi-value">{summary ? fridayLiveCount(summary.completed) : "—"}</div><p className="kpi-note">ตามสถานะที่เจ้าหน้าที่บันทึก</p></article>
        <article className="kpi-card orange"><span className="kpi-label">บริษัทที่ร่วมกิจกรรม</span><div className="kpi-value">{summary ? fridayLiveCount(summary.companies) : "—"}</div><p className="kpi-note">ไม่ซ้ำบริษัท · ไม่รวมกิจกรรมยกเลิก</p></article>
        <article className="kpi-card purple"><span className="kpi-label">ผู้เข้าร่วมจริง</span><div className="kpi-value">{summary ? fridayLiveCount(summary.attended) : "—"}</div><p className="kpi-note">คน-ครั้งจากรอบที่จัดแล้ว{summary?.unknownAttendance ? ` · ขาดจำนวน ${summary.unknownAttendance} รอบ` : ""}</p></article>
      </section>
      <section className="control-panel" aria-label="ค้นหาและกรองกิจกรรม"><div className="control-heading"><h3>ค้นหาและกรองกิจกรรม</h3><button className="text-button" type="button" disabled={!hasFilters} onClick={clear}>ล้างตัวกรอง</button></div><FilterFields activeCount={Number(Boolean(status)) + Number(Boolean(companyId))} search={<label className="search-field"><span>ค้นหากิจกรรม บริษัท ศาสตร์ หรือสถานที่</span><input type="search" value={search} maxLength={500} onChange={event => changeFilters({ search: event.target.value })} placeholder="พิมพ์คำค้นหา…" /></label>}><label><span>บริษัท</span><select value={companyId} onChange={event => changeFilters({ companyId: event.target.value })}><option value="">ทุกบริษัท</option>{options?.companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label><span>สถานะ</span><select value={status} onChange={event => changeFilters({ status: event.target.value })}><option value="">ทุกสถานะ</option>{Object.entries(LIVE_FRIDAY_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></FilterFields></section>
      <section id="dashboard-directory" tabIndex={-1} className="panel table-panel" aria-labelledby="friday-live-directory-title" aria-busy={loading}><div className="panel-heading"><div><p className="section-kicker">กิจกรรมรายเทอม</p><h3 id="friday-live-directory-title">รายการ Friday Activity</h3></div><span className="count-chip">{data ? `${data.total} กิจกรรม` : loading ? "กำลังอ่านรายการ" : "อ่านรายการไม่ได้"}</span></div>
        <div className="table-wrap"><table><caption className="sr-only">กิจกรรม บริษัท รอบจัด และสถานะ</caption><thead><tr><th scope="col">กิจกรรม / บริษัท</th><th scope="col">รอบจัด / สถานที่</th><th scope="col">รูปแบบ</th><th scope="col">สถานะ</th><th scope="col"><span className="sr-only">รายละเอียด</span></th></tr></thead><tbody>{data?.items.map(activity => <LiveActivityRow key={activity.id} activity={activity} onOpen={() => openActivity(activity.id)} />)}{!data?.items.length && <tr><td colSpan={5}><p className="empty-result" role="status">{loading ? "กำลังอ่านกิจกรรมจากฐานข้อมูลกลาง…" : error ? "ยังแสดงรายการปัจจุบันไม่ได้ กรุณาลองอ่านข้อมูลอีกครั้ง" : hasFilters ? "ไม่พบกิจกรรมที่ตรงกับตัวกรอง" : "ยังไม่มีกิจกรรมในช่วงการศึกษานี้ เริ่มได้ด้วยการสร้างกิจกรรมหรือนำเข้าไฟล์"}</p></td></tr>}</tbody></table></div>
        <div className="mobile-course-list" aria-label="รายการกิจกรรมแบบมือถือ">{data?.items.map(activity => <article className="mobile-course-card" key={activity.id}><div className="mobile-course-card-header"><button className="course-link mobile-course-link" type="button" onClick={() => openActivity(activity.id)}><strong>{activity.title}</strong></button><span className="status-pill tone-neutral">{LIVE_FRIDAY_STATUSES[activity.status]}</span></div><div className="mobile-course-meta"><span>{activity.companies.map(company => company.name).join(" · ") || "ยังไม่กำหนดบริษัท"}</span><span>{LIVE_FRIDAY_FORMATS[activity.format]} · {activity.sessions.length} รอบ</span>{activity.sessions.map((session, index) => <span key={session.id ?? index}>{fridayLiveDate(session.sessionDate)} · {session.location || "ยังไม่ระบุสถานที่"}</span>)}</div><button className="row-action" type="button" onClick={() => openActivity(activity.id)} aria-label={`ดูรายละเอียด ${activity.title}`}>รายละเอียด</button></article>)}{!data?.items.length && <p className="empty-result" role="status">{loading ? "กำลังอ่านกิจกรรมจากฐานข้อมูลกลาง…" : error ? "ยังแสดงรายการปัจจุบันไม่ได้ กรุณาลองอ่านข้อมูลอีกครั้ง" : hasFilters ? "ไม่พบกิจกรรมที่ตรงกับตัวกรอง" : "ยังไม่มีกิจกรรมในช่วงการศึกษานี้ เริ่มได้ด้วยการสร้างกิจกรรมหรือนำเข้าไฟล์"}</p>}</div>
        {data && <Pager page={data.page} pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))} total={data.total} unit="กิจกรรม" onChange={page => changeFilters({ page })} />}
      </section>
    </main>
    {(creating || validId) && options && <FridayLiveDetail key={creating ? "new" : activityId!} id={creating ? null : activityId} period={period} options={options} onClose={closeActivity} beforeWrite={dataset.beforeWrite} onMutation={changed} onCreated={id => { setCreating(false); router.replace(activityUrl(id), { scroll: false }); }} />}
  </div>;
}
