import { useEffect, useRef } from "react";
import type { FridayEvaluations, EvaluationReport } from "@/lib/services/friday-reporting";
import { fridayLiveCount, fridayLiveTimestamp } from "../lib/friday-api";
import { Pager } from "./pager";
import { FridayReportCard, FridayReportState } from "./friday-report-primitives";

const KIND_LABELS = { student: "ผลประเมินนิสิต", company: "ความคิดเห็นบริษัท", reported: "คะแนนจากตารางกิจกรรม", unmatched: "ความคิดเห็นรอจับคู่" };
const MAPPING_LABELS = { confirmed: "จับคู่แล้ว", provisional: "จับคู่ชั่วคราว", conflict: "การจับคู่ขัดแย้ง", invalid: "ต้องตรวจรูปแบบข้อมูล", unmatched: "รอจับคู่กิจกรรม" };
const score = (value: number | null) => value === null ? "—" : value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Report({ report, onOpen }: { report: EvaluationReport; onOpen: (id: string) => void }) {
  return <article className="friday-evaluation-report" data-evaluation-kind={report.kind}>
    <div className="friday-evaluation-report-heading"><div><p className="panel-caption">{KIND_LABELS[report.kind]}</p><h4>{report.title}</h4><p className="panel-caption">{report.companies.map(company => company.name).join(" · ") || "ยังไม่กำหนดบริษัท"}</p></div><span className={`status-pill ${report.mapping === "confirmed" ? "tone-green" : "tone-orange"}`}>{MAPPING_LABELS[report.mapping]}</span></div>
    {report.excludedReason && <p className="friday-evaluation-warning">{report.excludedReason}</p>}
    {report.responseCount !== null && <p><strong>{fridayLiveCount(report.responseCount)}</strong> คำตอบ · {report.counted ? "รวมในสถิติที่เลือกแล้ว" : "ยังไม่รวมในสถิติ"}</p>}
    {report.reportedScore !== null && <p>คะแนนที่รายงานในตาราง <strong>{score(report.reportedScore)} / 5</strong><small className="friday-evaluation-caption">แสดงแยกจากค่าเฉลี่ยที่คำนวณจากคำตอบนิสิต</small></p>}
    {report.feedback && <p className="friday-followup-text">{report.feedback}</p>}
    <details><summary>รายละเอียดคะแนนและแหล่งข้อมูล</summary>
      {report.dimensions.length > 0 && <div className="io-table-scroll"><table className="friday-report-table"><thead><tr><th scope="col">ด้านที่ประเมิน</th><th scope="col">คะแนน / 5</th><th scope="col">คำตอบ</th></tr></thead><tbody>{report.dimensions.map(dimension => <tr key={dimension.key}><th scope="row">{dimension.label}</th><td>{score(dimension.mean)}</td><td>{fridayLiveCount(dimension.count)}</td></tr>)}</tbody></table></div>}
      <p className="friday-evaluation-source">{report.reference || "ยังไม่มีแหล่งข้อมูลที่ตรวจสอบได้"}</p><p className="panel-caption">บันทึกแก้ไขล่าสุด {fridayLiveTimestamp(report.updatedAt)}</p>
    </details>
    {report.activityId && <button type="button" className="text-button" onClick={() => onOpen(report.activityId!)}>เปิดกิจกรรมและบันทึกต้นทาง</button>}
  </article>;
}

export function FridayLiveEvaluationBoard({ data, loading, error, includeProvisional, kind, companies, companyId, search, onFilters, onSettings, onPage, onOpen, onRetry }: {
  data: FridayEvaluations | null; loading: boolean; error: string | null; includeProvisional: boolean; kind: string;
  companies: { id: string; name: string }[]; companyId: string; search: string;
  onFilters: (filters: { companyId?: string; search?: string }) => void;
  onSettings: (settings: { includeProvisional?: boolean; kind?: string }) => void;
  onPage: (page: number) => void; onOpen: (id: string) => void; onRetry: () => void;
}) {
  const focusPage = useRef<number | null>(null);
  useEffect(() => {
    if (!data || focusPage.current !== data.page) return;
    focusPage.current = null;
    const reports = document.getElementById("friday-evaluation-reports");
    reports?.focus({ preventScroll: true });
    reports?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [data]);
  function changePage(page: number) { focusPage.current = page; onPage(page); }
  const summary = data?.summary;
  const overall = summary?.dimensions.find(item => item.key === "overall");
  const pending = summary ? summary.provisionalReports + summary.invalidReports + summary.unmatchedReports : null;
  return <div className="friday-report" data-report="evaluation" data-ready={Boolean(data) && !loading} aria-busy={loading}>
    <div className="friday-evaluation-controls"><label><span>บริษัทในผลประเมิน</span><select value={companyId} onChange={event => onFilters({ companyId: event.target.value })}><option value="">ทุกบริษัท</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label><span>ค้นหากิจกรรมในผลประเมิน</span><input type="search" maxLength={500} value={search} onChange={event => onFilters({ search: event.target.value })} placeholder="ชื่อกิจกรรม บริษัท หรือศาสตร์" /></label></div>
    <FridayReportState loading={loading} error={error} onRetry={onRetry} />
    {data && summary && <>
      <p className="io-scope-note">ผลประเมินจากบันทึกนำเข้าในฐานข้อมูลกลาง · รวมเฉพาะกิจกรรมเสร็จสิ้นที่ผ่านการตรวจรูปแบบและการจับคู่{error ? " · แสดงฉบับที่อ่านสำเร็จครั้งก่อน" : ""}</p>
      <label className="friday-provisional-toggle"><input type="checkbox" checked={includeProvisional} onChange={event => onSettings({ includeProvisional: event.target.checked })} /><span>รวมผลประเมินที่จับคู่ชั่วคราวสำหรับทดสอบ ({fridayLiveCount(summary.provisionalReports)} รายการ)</span></label>
      {includeProvisional && <p className="friday-evaluation-warning" role="status">สถิตินี้รวมข้อมูลจับคู่ชั่วคราว ใช้ทดสอบระบบและต้องยืนยันการจับคู่ก่อนนำไปรายงาน</p>}
      {(summary.invalidReports > 0 || summary.unmatchedReports > 0 || summary.duplicateReports > 0) && <p className="friday-evaluation-warning">รอตรวจรูปแบบหรือการจับคู่ {fridayLiveCount(summary.invalidReports)} รายการ · รอผูกกิจกรรม {fridayLiveCount(summary.unmatchedReports)} รายการ · ตัดแหล่งข้อมูลซ้ำ {fridayLiveCount(summary.duplicateReports)} รายการออกจากการนับ</p>}
      <div className="io-board friday-report-board">
        <article className="io-card io-kpi" data-kpi="friday-student-responses"><h3 className="io-kpi-label">คำตอบประเมินนิสิต</h3><div className="io-kpi-value">{fridayLiveCount(summary.studentResponses)}<small>คำตอบ</small></div><p className="io-sub">จาก {fridayLiveCount(summary.studentActivities)} กิจกรรม · ไม่ใช่จำนวนนิสิตไม่ซ้ำ</p></article>
        <article className="io-card io-kpi" data-kpi="friday-student-score"><h3 className="io-kpi-label">ความพึงพอใจโดยรวม</h3><div className="io-kpi-value">{score(overall?.mean ?? null)}<small>/ 5</small></div><p className="io-sub">{overall?.count ? `คำนวณจาก ${fridayLiveCount(overall.count)} คำตอบ` : "ยังไม่มีคะแนนที่นำมาคำนวณได้"}</p></article>
        <article className="io-card io-kpi"><h3 className="io-kpi-label">ความคิดเห็นบริษัท</h3><div className="io-kpi-value">{fridayLiveCount(summary.companyResponses)}<small>คำตอบ</small></div><p className="io-sub">จาก {fridayLiveCount(summary.companyActivities)} กิจกรรม · ข้อมูลเชิงข้อความ</p></article>
        <article className="io-card io-kpi"><h3 className="io-kpi-label">รายการรอตรวจสอบ</h3><div className="io-kpi-value">{fridayLiveCount(pending)}<small>รายการ</small></div><p className="io-sub">จับคู่ชั่วคราว รูปแบบไม่ครบ หรือยังไม่ผูกกิจกรรม</p></article>
        <FridayReportCard id="friday-dimensions" title="ผลประเมินนิสิต 4 ด้าน" className="io-span-2"><div className="friday-format-list">{summary.dimensions.map(dimension => <div key={dimension.key}><div><span>{dimension.label}</span><strong>{score(dimension.mean)} / 5</strong></div><div className="friday-score-track"><span style={{ width: `${dimension.mean === null ? 0 : dimension.mean / 5 * 100}%` }} /></div><small>{fridayLiveCount(dimension.count)} คำตอบที่มีคะแนน</small></div>)}</div><p className="io-note">ใช้ผลรวมคะแนน ÷ จำนวนคำตอบในแต่ละด้าน</p></FridayReportCard>
        <FridayReportCard id="friday-score-distribution" title="การกระจายความพึงพอใจโดยรวม" className="io-span-2">{overall?.count ? <div className="friday-score-distribution">{overall.distribution.map(item => <div key={item.score}><span>{item.score} คะแนน</span><span className="friday-score-track"><span style={{ width: `${item.count / overall.count * 100}%` }} /></span><strong>{fridayLiveCount(item.count)}</strong></div>)}</div> : <p className="io-empty">ยังไม่มีคำตอบที่นำมาสรุปการกระจายคะแนนได้</p>}<p className="io-note">จำนวนคำตอบตามคะแนน 1–5 · ไม่รวมคะแนนสรุปจากตารางกิจกรรม</p></FridayReportCard>
        <FridayReportCard id="friday-evaluation-reports" title="รายงานและความคิดเห็นรายกิจกรรม" className="friday-span-all" tools={<label className="io-select"><span className="sr-only">ชนิดรายงานผลประเมิน</span><select value={kind} onChange={event => onSettings({ kind: event.target.value })}><option value="">ทุกชนิดรายงาน</option>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}>
          <p className="io-sub">{fridayLiveCount(data.total)} รายงานตามชนิดที่เลือก · การเลือกชนิดรายงานไม่เปลี่ยนยอดสรุปด้านบน</p>
          <div className="friday-evaluation-reports">{data.items.map(report => <Report key={report.id} report={report} onOpen={onOpen} />)}</div>
          {!data.items.length && <p className="io-empty">{data.total ? "หน้านี้ไม่มีรายงาน เลือกกลับหน้าแรกเพื่อดูข้อมูล" : "ยังไม่มีผลประเมินชนิดนี้ที่ตรงกับช่วงการศึกษาและตัวกรอง"}</p>}
          {!data.items.length && data.total > 0 && <button type="button" className="secondary-button" onClick={() => changePage(1)}>กลับหน้าแรกของผลประเมิน</button>}
          <Pager page={data.page} pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))} total={data.total} unit="รายงานผลประเมิน" targetId="friday-evaluation-reports" onChange={changePage} />
        </FridayReportCard>
      </div>
    </>}
  </div>;
}
