import type { FridayAnalytics } from "@/lib/services/friday-reporting";
import type { FridayListResponse } from "@/lib/services/friday-activity";
import { LIVE_FRIDAY_FORMATS, LIVE_FRIDAY_STATUSES, fridayLiveCount } from "../lib/friday-api";
import { FridayReportCard, FridayReportState, FridayTableView } from "./friday-report-primitives";

const STATUS_COLORS: Record<string, string> = { draft: "var(--io-c1)", contacting: "var(--io-c2)", invited: "var(--io-c4)", confirmed: "var(--io-c3)", in_progress: "var(--io-c5)", completed: "var(--io-c3)", cancelled: "var(--io-empty)" };
type Summary = FridayListResponse["summary"];

function TrendSpark({ values, label }: { values: (number | null)[]; label: string }) {
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return null;
  const min = Math.min(...known), span = Math.max(...known) - min || 1;
  const path = values.map((value, i) => {
    if (value === null) return "";
    return `${i > 0 && values[i - 1] !== null ? "L" : "M"}${4 + i / Math.max(values.length - 1, 1) * 88},${36 - (value - min) / span * 30}`;
  }).join(" ");
  return <svg className="io-spark" viewBox="0 0 96 40" role="img" aria-label={label}><path d={path} className="io-spark-line" /></svg>;
}

function Kpi({ label, unit, metric, data }: { label: string; unit: string; metric: "total" | "completed" | "companies" | "attended"; data: FridayAnalytics }) {
  const current = data.summary[metric];
  const previous = data.trend.at(-2)?.summary?.[metric];
  const incomplete = metric === "attended" && data.summary.unknownAttendance > 0;
  const previousIncomplete = metric === "attended" && Boolean(data.trend.at(-2)?.summary?.unknownAttendance);
  const delta = !incomplete && !previousIncomplete && previous !== null && previous !== undefined && current !== null && previous > 0 ? Math.round((current - previous) / previous * 100) : null;
  return <article className="io-card io-kpi friday-report-kpi" data-kpi={`friday-${metric}`}>
    <h3 className="io-kpi-label">{label}</h3><div className="io-kpi-value kpi-value"><span>{fridayLiveCount(current)}</span><small>{unit}</small></div>
    <div className="io-kpi-foot"><div className="io-kpi-yoy"><span>{incomplete ? `ขาดจำนวน ${data.summary.unknownAttendance} รอบ` : "เทียบเทอมเดียวกันปีก่อน"}</span><span className={`io-delta ${delta !== null && delta > 0 ? "is-up" : delta !== null && delta < 0 ? "is-down" : ""}`}>{delta === null ? "ยังเทียบไม่ได้" : delta === 0 ? "เท่าเดิม" : `${delta > 0 ? "+" : ""}${delta}%`}</span></div>
      <TrendSpark values={data.trend.map(item => metric === "attended" && item.summary?.unknownAttendance ? null : item.summary?.[metric] ?? null)} label={`${label}ตามปีการศึกษา: ${data.trend.map(item => `${item.academicYear + 543}: ${metric === "attended" && item.summary?.unknownAttendance ? "ยอดยังไม่ครบ" : item.summary?.[metric] ?? "ยังไม่มีข้อมูล"}`).join(", ")}`} />
    </div>
  </article>;
}

function StatusDonut({ data, onFilter }: { data: FridayAnalytics; onFilter: (filter: { status: string }) => void }) {
  const values = data.statusCounts.filter(item => item.count > 0);
  const radius = 64, circumference = 2 * Math.PI * radius;
  return <FridayReportCard id="friday-status" title="สถานะกิจกรรม" className="io-span-1">
    {data.summary.total ? <><div className="io-donut-wrap"><svg className="io-donut" viewBox="0 0 180 180" role="img" aria-label={`เสร็จสิ้น ${data.summary.completed} จาก ${data.summary.total} กิจกรรม`}><g transform="rotate(-90 90 90)">{values.map((item, index) => {
      const length = item.count / data.summary.total * circumference;
      const offset = values.slice(0, index).reduce((sum, previous) => sum + previous.count, 0) / data.summary.total * circumference;
      const segment = <circle key={item.key} className="io-donut-seg" style={{ stroke: STATUS_COLORS[item.key] }} cx="90" cy="90" r={radius} strokeDasharray={`${Math.max(length - (values.length > 1 ? 3 : 0), 0)} ${circumference}`} strokeDashoffset={-offset}><title>{LIVE_FRIDAY_STATUSES[item.key as keyof typeof LIVE_FRIDAY_STATUSES]}: {item.count} กิจกรรม</title></circle>;
      return segment;
    })}</g><text x="90" y="86" className="io-donut-value">{fridayLiveCount(data.summary.completed)}</text><text x="90" y="108" className="io-donut-caption">จัดเสร็จจาก {fridayLiveCount(data.summary.total)}</text></svg></div>
      <ul className="friday-status-legend">{values.map(item => <li key={item.key}><button type="button" onClick={() => onFilter({ status: item.key })}><span className="io-swatch" style={{ background: STATUS_COLORS[item.key] }} aria-hidden="true" /><span>{LIVE_FRIDAY_STATUSES[item.key as keyof typeof LIVE_FRIDAY_STATUSES]}</span><strong>{fridayLiveCount(item.count)}</strong></button></li>)}</ul><p className="io-note">กดสถานะเพื่อดูรายการกิจกรรม</p></> : <p className="io-empty">ยังไม่มีกิจกรรมในขอบเขตนี้</p>}
  </FridayReportCard>;
}

function MonthChart({ data }: { data: FridayAnalytics }) {
  const max = Math.max(1, ...data.months.flatMap(item => [item.held, item.planned]));
  const monthLabel = (month: string) => new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(`${month}-15T12:00:00+07:00`));
  return <FridayReportCard id="friday-months" title="รอบจัดกิจกรรมรายเดือน" className="io-span-3">
    <ul className="io-legend"><li><span className="io-swatch" style={{ background: "var(--io-c1)" }} />จัดแล้ว</li><li><span className="io-swatch" style={{ background: "var(--io-c2)" }} />วางแผน</li></ul>
    {data.months.length ? <div className="friday-month-scroll"><div className="friday-month-chart" role="img" aria-label={`จำนวนรอบรายเดือน: ${data.months.map(item => `${monthLabel(item.month)} จัดแล้ว ${item.held} วางแผน ${item.planned}`).join(", ")}`}>{data.months.map(item => <div className="friday-month-column" key={item.month}><div className="friday-month-bars">{(["held", "planned"] as const).map((key, index) => <div key={key} className="friday-month-bar" style={{ height: `${item[key] / max * 100}%`, background: `var(--io-c${index + 1})` }}><span>{fridayLiveCount(item[key])}</span></div>)}</div><span className="io-cols-label">{monthLabel(item.month)}</span></div>)}</div></div> : <p className="io-empty">ยังไม่มีรอบที่ระบุวันที่ในขอบเขตนี้</p>}
    <p className="io-note">นับเป็นรอบจัด · ไม่รวมรอบหรือกิจกรรมยกเลิก{data.undatedSessions ? ` · ยังไม่ระบุวันที่ ${data.undatedSessions} รอบ` : ""}</p>
    <FridayTableView caption="จำนวนรอบกิจกรรมรายเดือน"><thead><tr><th scope="col">เดือน</th><th scope="col">จัดแล้ว</th><th scope="col">วางแผน</th></tr></thead><tbody>{data.months.map(item => <tr key={item.month}><th scope="row">{monthLabel(item.month)}</th><td>{fridayLiveCount(item.held)}</td><td>{fridayLiveCount(item.planned)}</td></tr>)}</tbody></FridayTableView>
  </FridayReportCard>;
}

export function FridayLiveOverview({ data, loading, error, onRetry, onFilter }: { data: FridayAnalytics | null; loading: boolean; error: string | null; onRetry: () => void; onFilter: (filter: { status?: string; companyId?: string }) => void }) {
  const formatsTotal = data?.formatCounts.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const companyMax = Math.max(1, ...(data?.companies.map(item => item.count) ?? []));
  return <div className="friday-report" data-report="overview" data-ready={Boolean(data) && !loading} aria-busy={loading}>
    <FridayReportState loading={loading} error={error} onRetry={onRetry} />
    {data && <><p className="sr-only" role="status">สรุปทุกหน้าของกิจกรรมตามช่วงการศึกษาและตัวกรองที่เลือก · {loading ? "กำลังอ่านฉบับล่าสุด" : error ? "แสดงฉบับที่อ่านสำเร็จครั้งก่อน" : "ข้อมูลจากฐานข้อมูลกลาง"}</p>
      <div className="io-board friday-report-board">
        <Kpi label="กิจกรรมทั้งหมด" unit="กิจกรรม" metric="total" data={data} /><Kpi label="จัดเสร็จแล้ว" unit="กิจกรรม" metric="completed" data={data} /><Kpi label="บริษัทที่ร่วมกิจกรรม" unit="แห่ง" metric="companies" data={data} /><Kpi label="ผู้เข้าร่วมจริง" unit="คน-ครั้ง" metric="attended" data={data} />
        <MonthChart data={data} /><StatusDonut data={data} onFilter={onFilter} />
        <FridayReportCard id="friday-companies" title="บริษัทที่ร่วมจัดกิจกรรมแล้ว (Top 10)" className="io-span-2">
          {data.companies.length ? <ol className="friday-company-bars">{data.companies.map(item => <li key={item.id}><button type="button" onClick={() => onFilter({ companyId: item.id })}><span className="friday-company-name">{item.name}</span><span className="friday-company-meter"><i style={{ width: `${item.count / companyMax * 100}%` }} /></span><strong>{fridayLiveCount(item.count)}</strong></button></li>)}</ol> : <p className="io-empty">ยังไม่มีบริษัทในรอบที่จัดแล้ว</p>}
          <p className="io-note">นับกิจกรรมที่มีรอบจัดแล้ว · กิจกรรมร่วมหลายบริษัทนับให้แต่ละบริษัท · กดบริษัทเพื่อดูรายการ</p>
        </FridayReportCard>
        <FridayReportCard id="friday-formats" title="รูปแบบกิจกรรม" className="io-span-2">
          {formatsTotal ? <div className="friday-format-list">{data.formatCounts.map((item, index) => <div key={item.key}><div><span>{LIVE_FRIDAY_FORMATS[item.key as keyof typeof LIVE_FRIDAY_FORMATS]}</span><strong>{fridayLiveCount(item.count)} กิจกรรม</strong></div><div className="friday-score-track"><span style={{ width: `${item.count / formatsTotal * 100}%`, background: `var(--io-c${index % 5 + 1})` }} /></div></div>)}</div> : <p className="io-empty">ยังไม่มีกิจกรรมที่นำมาสรุปรูปแบบได้</p>}
          <p className="io-note">รวม {fridayLiveCount(formatsTotal)} กิจกรรม · ไม่รวมกิจกรรมยกเลิก</p>
        </FridayReportCard>
        <FridayReportCard id="friday-history-trend" title="เปรียบเทียบเทอมเดียวกันย้อนหลัง" className="friday-span-all">
          <div className="io-table-scroll"><table className="friday-report-table"><caption className="sr-only">สถิติ Friday ตามปีการศึกษาในเทอมเดียวกันและตัวกรองเดียวกัน</caption><thead><tr><th scope="col">ปีการศึกษา</th><th scope="col">กิจกรรม</th><th scope="col">เสร็จสิ้น</th><th scope="col">บริษัท</th><th scope="col">คน-ครั้ง</th></tr></thead><tbody>{data.trend.map(item => <tr key={item.academicYear}><th scope="row">{item.academicYear + 543}</th>{(["total", "completed", "companies", "attended"] as (keyof Pick<Summary, "total" | "completed" | "companies" | "attended">)[]).map(key => <td key={key}>{item.summary ? fridayLiveCount(item.summary[key]) : "ยังไม่มีข้อมูล"}</td>)}</tr>)}</tbody></table></div>
          <p className="io-note">ช่องที่ยังไม่มีข้อมูลไม่ถูกนับเป็นศูนย์ · จำนวนผู้เข้าร่วมรวมเฉพาะยอดที่บันทึกในรอบจัดแล้ว</p>
        </FridayReportCard>
      </div></>}
  </div>;
}
