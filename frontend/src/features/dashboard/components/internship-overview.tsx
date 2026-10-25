"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatNumber } from "@/features/dashboard/lib/format";
import {
  buildInternshipOverview, companyRankCounts, niceScale, OVERVIEW_RANKS, overviewKpis, placementsByCompany, positionPicks, seatsByCompany, STUDY_YEARS,
  type InternshipOverviewData, type OverviewRank, type StudyYear, type StudyYearFilter,
} from "@/features/dashboard/lib/internship-overview";

/*
 * ฝึกงาน › ภาพรวม. A card grid in the style of a BI dashboard: KPI tiles with a
 * four-year sparkline, then one card per question. Every chart is plain
 * HTML/SVG with a hover tooltip, a legend for 2+ series and a table fallback.
 */

const TOP_N = 10;
const TREND_YEARS = 4;
const YEAR_OPTIONS: { value: StudyYearFilter; label: string }[] = [
  { value: "all", label: "ทุกชั้นปี" }, { value: "1", label: "ปี 1" }, { value: "2", label: "ปี 2" }, { value: "3", label: "ปี 3" },
];
const RANK_OPTIONS: { value: "all" | `${OverviewRank}`; label: string }[] = [
  { value: "all", label: "ทั้งหมด" }, ...OVERVIEW_RANKS.map(r => ({ value: `${r}` as `${OverviewRank}`, label: `อันดับ ${r}` })),
];

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (next: T) => void }) {
  return <label className="io-select"><span className="sr-only">{label}</span>
    <select value={value} onChange={e => onChange(e.target.value as T)} aria-label={label}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </label>;
}
const YearSelect = ({ value, onChange, label }: { value: StudyYearFilter; onChange: (v: StudyYearFilter) => void; label: string }) =>
  <Select label={label} value={value} options={YEAR_OPTIONS} onChange={onChange} />;

export function Card({ id, title, legend, tools, className = "", children }: { id: string; title: string; legend?: ReactNode; tools?: ReactNode; className?: string; children: ReactNode }) {
  return <article className={`io-card ${className}`} aria-labelledby={`${id}-title`}>
    <header className="io-card-head">
      <div className="io-card-title"><h3 id={`${id}-title`}>{title}</h3>{legend}</div>
      {tools && <div className="io-card-tools">{tools}</div>}
    </header>
    {children}
  </article>;
}

export function Legend({ items }: { items: { key: string; label: ReactNode; className: string }[] }) {
  return <ul className="io-legend">{items.map(i => <li key={i.key}><span className={`io-swatch ${i.className}`} aria-hidden="true" />{i.label}</li>)}</ul>;
}

export function TableView({ children }: { children: ReactNode }) {
  return <details className="io-table-view"><summary>ดูเป็นตาราง</summary><div className="io-table-scroll">{children}</div></details>;
}

/* ---------- KPI tiles ---------- */

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 96, h = 40, pad = 4;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return <svg className="io-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
    <path d={area} className="io-spark-area" />
    <path d={line} className="io-spark-line" />
    <circle cx={lx} cy={ly} r="3.5" className="io-spark-dot" />
  </svg>;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="io-delta">—</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const tone = pct > 0 ? "is-up" : pct < 0 ? "is-down" : "";
  return <span className={`io-delta ${tone}`}><span aria-hidden="true">{pct > 0 ? "▲" : pct < 0 ? "▼" : "■"}</span> {Math.abs(pct)}%<span className="sr-only">{pct >= 0 ? " เพิ่มขึ้น" : " ลดลง"}</span></span>;
}

function KpiTile({ label, unit, values, years }: { label: string; unit: string; values: number[]; years: number[] }) {
  const current = values[values.length - 1], previous = values[values.length - 2];
  return <article className="io-card io-kpi">
    <h3 className="io-kpi-label">{label}</h3>
    <div className="io-kpi-value">{formatNumber(current)}<small>{unit}</small></div>
    <div className="io-kpi-foot">
      <div className="io-kpi-yoy"><span>เทียบปี {years[years.length - 2]}</span><Delta current={current} previous={previous} /></div>
      <Sparkline values={values} label={`${label} ปี ${years[0]}–${years[years.length - 1]}: ${values.join(", ")}`} />
    </div>
  </article>;
}

/* ---------- Match donut ---------- */

function MatchDonut({ data }: { data: InternshipOverviewData }) {
  const kpi = overviewKpis(data);
  const byYear = STUDY_YEARS.map(y => ({ year: y, matched: data.students.filter(s => s.studyYear === y && s.placement).length, total: data.students.filter(s => s.studyYear === y).length }));
  const segments = [...byYear.map(b => ({ key: `y${b.year}`, label: `ปี ${b.year}`, value: b.matched, className: `io-c-year-${b.year}` })),
    { key: "none", label: "ยังไม่ได้", value: kpi.students - kpi.matched, className: "io-c-empty" }];
  const r = 64, c = 2 * Math.PI * r, gap = 3;
  let offset = 0;
  return <Card id="io-match" title="ผล Match ของนิสิต" className="io-span-1 io-match">
    <div className="io-donut-wrap">
      <svg className="io-donut" viewBox="0 0 180 180" role="img" aria-label={`Match แล้ว ${kpi.matched} จาก ${kpi.students} คน`}>
        <g transform="rotate(-90 90 90)">
          {segments.map(s => {
            const len = (s.value / Math.max(kpi.students, 1)) * c;
            const el = len > 0 ? <circle key={s.key} className={`io-donut-seg ${s.className}`} cx="90" cy="90" r={r} strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`} strokeDashoffset={-offset}><title>{`${s.label}: ${s.value} คน`}</title></circle> : null;
            offset += len; return el;
          })}
        </g>
        <text x="90" y="86" className="io-donut-value">{formatNumber(kpi.matched)}</text>
        <text x="90" y="108" className="io-donut-caption">จาก {formatNumber(kpi.students)} คน</text>
      </svg>
    </div>
    <ul className="io-donut-legend">
      {segments.map(s => <li key={s.key}><span className={`io-swatch ${s.className}`} aria-hidden="true" /><span>{s.key === "none" ? "ยังไม่ได้งาน" : `Match · ${s.label}`}</span><strong>{formatNumber(s.value)}</strong></li>)}
    </ul>
    <p className="io-note">Match แล้ว {kpi.matchRate}% ของนิสิตทั้งหมด</p>
  </Card>;
}

/* ---------- Grouped rank columns ---------- */

function GroupedRankChart({ data }: { data: InternshipOverviewData }) {
  const [studyYear, setStudyYear] = useState<StudyYearFilter>("all");
  const [rank, setRank] = useState<"all" | `${OverviewRank}`>("all");
  const shownRanks: OverviewRank[] = rank === "all" ? [...OVERVIEW_RANKS] : [Number(rank) as OverviewRank];
  const rows = useMemo(() => {
    const value = (r: ReturnType<typeof companyRankCounts>[number]) => rank === "all" ? r.total : r.byRank[Number(rank) as OverviewRank];
    return companyRankCounts(data, studyYear).filter(r => value(r) > 0)
      .sort((a, b) => value(b) - value(a) || b.byRank[1] - a.byRank[1] || a.company.shortName.localeCompare(b.company.shortName)).slice(0, TOP_N);
  }, [data, studyYear, rank]);
  const scale = niceScale(Math.max(...rows.flatMap(r => shownRanks.map(k => r.byRank[k])), 1));

  return <Card id="io-rank" title={`บริษัทที่ถูกเลือกมากที่สุดในแต่ละอันดับ (Top ${TOP_N})`} className="io-span-3"
    legend={<Legend items={shownRanks.map(r => ({ key: `${r}`, label: `อันดับ ${r}`, className: `io-c-rank-${r}` }))} />}
    tools={<><Select label="เลือกอันดับ" value={rank} options={RANK_OPTIONS} onChange={setRank} /><YearSelect label="กรองชั้นปีของกราฟอันดับ" value={studyYear} onChange={setStudyYear} /></>}>
    {rows.length ? <div className="io-cols" role="figure" aria-label={`กราฟแท่งจำนวนครั้งที่ ${rows.length} บริษัทถูกเลือก แยกตามอันดับ`}>
      <div className="io-cols-axis" aria-hidden="true">{[...scale.ticks].reverse().map(t => <span key={t}>{formatNumber(t)}</span>)}</div>
      <div className="io-cols-plot">
        <div className="io-cols-grid" aria-hidden="true">{scale.ticks.map(t => <span key={t} style={{ bottom: `${(t / scale.max) * 100}%` }} />)}</div>
        {rows.map(row => <div className="io-cols-group" key={row.company.id}>
          <div className="io-cols-bars" data-count={shownRanks.length}>
            {shownRanks.map(r => <span key={r} className={`io-cols-bar io-c-rank-${r}`} style={{ height: `${(row.byRank[r] / scale.max) * 100}%` }} data-tip={`${row.company.shortName} · อันดับ ${r}: ${formatNumber(row.byRank[r])} คน`}>
              {shownRanks.length === 1 && <em>{formatNumber(row.byRank[r])}</em>}
            </span>)}
          </div>
          <span className="io-cols-label" title={row.company.name}>{row.company.shortName.replace(/^Mock /, "")}</span>
        </div>)}
      </div>
    </div> : <p className="io-empty">ไม่มีการเลือกในขอบเขตนี้</p>}
    <TableView><table className="io-table"><thead><tr><th scope="col">บริษัท</th>{OVERVIEW_RANKS.map(r => <th scope="col" key={r}>อันดับ {r}</th>)}<th scope="col">รวม</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.company.id}><th scope="row">{row.company.shortName}</th>{OVERVIEW_RANKS.map(r => <td key={r}>{formatNumber(row.byRank[r])}</td>)}<td><strong>{formatNumber(row.total)}</strong></td></tr>)}</tbody></table></TableView>
  </Card>;
}

/* ---------- Top companies (horizontal bars) ---------- */

function TopCompanies({ data }: { data: InternshipOverviewData }) {
  const [studyYear, setStudyYear] = useState<StudyYearFilter>("all");
  const rows = companyRankCounts(data, studyYear).filter(r => r.total > 0).sort((a, b) => b.total - a.total || b.byRank[1] - a.byRank[1]).slice(0, TOP_N);
  const scale = niceScale(Math.max(...rows.map(r => r.total), 1));
  return <Card id="io-companies" title={`บริษัทที่ถูกเลือกมากที่สุด (Top ${TOP_N})`} className="io-span-2"
    tools={<YearSelect label="กรองชั้นปีของบริษัทที่ถูกเลือกมากที่สุด" value={studyYear} onChange={setStudyYear} />}>
    <p className="io-sub">รวมทุกอันดับที่นิสิตเลือก</p>
    {rows.length ? <div className="io-hbars">
      {rows.map(r => <div className="io-hbar" key={r.company.id} data-tip={`${r.company.shortName}: ${r.total} ครั้ง · อันดับ 1 ${r.byRank[1]} ครั้ง`}>
        <span className="io-hbar-label" title={r.company.name}>{r.company.shortName}</span>
        <span className="io-hbar-track"><i style={{ width: `${(r.total / scale.max) * 100}%` }} /><b>{formatNumber(r.total)}</b></span>
      </div>)}
      <div className="io-hbar-axis" aria-hidden="true"><span />{<span className="io-hbar-ticks">{scale.ticks.map(t => <em key={t} style={{ left: `${(t / scale.max) * 100}%` }}>{formatNumber(t)}</em>)}</span>}</div>
    </div> : <p className="io-empty">ไม่มีการเลือกในขอบเขตนี้</p>}
  </Card>;
}

/* ---------- Top positions (ranking with podium) ---------- */

const initials = (text: string) => text.replace(/^Mock /, "").split(/[\s/&-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

function TopPositions({ data }: { data: InternshipOverviewData }) {
  const [studyYear, setStudyYear] = useState<StudyYearFilter>("all");
  const rows = positionPicks(data, studyYear).filter(r => r.picks > 0).sort((a, b) => b.picks - a.picks || b.first - a.first).slice(0, TOP_N);
  const podium = rows.slice(0, 3), rest = rows.slice(3);
  const order = [1, 0, 2].filter(i => podium[i]);
  return <Card id="io-positions" title={`ตำแหน่งที่ถูกเลือกมากที่สุด (Top ${TOP_N})`} className="io-span-2"
    tools={<YearSelect label="กรองชั้นปีของตำแหน่งที่ถูกเลือกมากที่สุด" value={studyYear} onChange={setStudyYear} />}>
    {rows.length ? <>
      <ol className="io-podium">{order.map(i => { const r = podium[i]; return <li key={r.opening.id} className={`is-${i + 1}`} value={i + 1}>
        <span className="io-avatar" aria-hidden="true">{initials(r.opening.title)}<i>{i + 1}</i></span>
        <strong>{r.opening.title}</strong><small>{r.company.shortName}</small><b>{formatNumber(r.picks)}</b>
      </li>; })}</ol>
      <ol className="io-rank-list" start={4}>{rest.map((r, i) => <li key={r.opening.id}>
        <span className="io-rank-no">{i + 4}</span>
        <span className="io-rank-name"><strong>{r.opening.title}</strong><small>{r.company.shortName}</small></span>
        <b>{formatNumber(r.picks)}</b>
      </li>)}</ol>
    </> : <p className="io-empty">ไม่มีการเลือกในขอบเขตนี้</p>}
  </Card>;
}

/* ---------- Seats vs accepted (gauge + table) ---------- */

function Gauge({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(value / max, 1) : 0;
  const r = 70, len = Math.PI * r;
  return <svg className="io-gauge" viewBox="0 0 180 104" role="img" aria-label={`รับจริง ${value} จาก ${max} ที่นั่ง (${Math.round(pct * 100)}%)`}>
    <path d="M20 94 A70 70 0 0 1 160 94" className="io-gauge-track" />
    <path d="M20 94 A70 70 0 0 1 160 94" className="io-gauge-fill" strokeDasharray={`${pct * len} ${len}`} />
    <text x="90" y="80" className="io-donut-value">{Math.round(pct * 100)}%</text>
    <text x="90" y="100" className="io-donut-caption">รับจริง / ที่นั่ง</text>
  </svg>;
}

function SeatsVsAccepted({ data }: { data: InternshipOverviewData }) {
  const [mode, setMode] = useState<"all" | "empty">("all");
  const all = seatsByCompany(data).sort((a, b) => b.seats - a.seats || b.filled - a.filled);
  const emptyTotal = all.reduce((n, r) => n + r.emptyOpenings, 0);
  const rows = mode === "empty" ? all.filter(r => r.emptyOpenings > 0) : all;
  const seats = all.reduce((n, r) => n + r.seats, 0), filled = all.reduce((n, r) => n + r.filled, 0);
  return <Card id="io-seats" title="ที่นั่งที่เปิดรับ และนิสิตที่รับจริง" className="io-span-2"
    tools={<Select label="เลือกบริษัทที่แสดง" value={mode} onChange={setMode} options={[{ value: "all", label: "ทุกบริษัท" }, { value: "empty", label: `มีตำแหน่งที่ไม่มีคนได้ (${emptyTotal})` }]} />}>
    <div className="io-seat-summary">
      <Gauge value={filled} max={seats} />
      <dl className="io-seat-stats">
        <div><dt>ที่นั่งทั้งหมด</dt><dd>{formatNumber(seats)}</dd></div>
        <div><dt>รับจริง</dt><dd>{formatNumber(filled)}</dd></div>
        <div><dt>ตำแหน่งที่ไม่มีคนได้</dt><dd className="is-alert">{formatNumber(emptyTotal)}</dd></div>
      </dl>
    </div>
    <div className="io-seat-table" role="table" aria-label="ที่นั่งและจำนวนที่รับจริงรายบริษัท">
      <div className="io-seat-row is-head" role="row"><span role="columnheader">บริษัท</span><span role="columnheader">สัดส่วนที่รับ</span><span role="columnheader">รับ / ที่นั่ง</span></div>
      <div className="io-seat-body">
        {rows.map(r => <details key={r.company.id} className="io-seat-company" open={mode === "empty"}>
          <summary className="io-seat-row" role="row">
            <span role="cell" className="io-seat-name"><span className="io-chevron" aria-hidden="true" />{r.company.shortName}{r.emptyOpenings > 0 && <span className="io-badge">ไม่มีคนได้ {r.emptyOpenings}</span>}</span>
            <span role="cell" className="io-meter"><i style={{ width: `${r.seats ? Math.min(r.filled / r.seats, 1) * 100 : 0}%` }} /></span>
            <span role="cell" className="io-seat-count">{formatNumber(r.filled)} / {formatNumber(r.seats)}</span>
          </summary>
          {r.openings.map(o => <div key={o.opening.id} className={`io-seat-row is-opening ${o.filled === 0 ? "is-empty" : ""}`} role="row">
            <span role="cell" className="io-seat-name">{o.opening.title}<small>ถูกเลือก {formatNumber(o.picks)} ครั้ง</small>{o.filled === 0 && <span className="io-badge">ไม่มีคนได้</span>}</span>
            <span role="cell" className="io-meter is-small"><i style={{ width: `${o.opening.seats ? Math.min(o.filled / o.opening.seats, 1) * 100 : 0}%` }} /></span>
            <span role="cell" className="io-seat-count">{formatNumber(o.filled)} / {formatNumber(o.opening.seats)}</span>
          </div>)}
        </details>)}
        {!rows.length && <p className="io-empty">ทุกตำแหน่งมีผู้ได้รับเลือกแล้ว</p>}
      </div>
    </div>
  </Card>;
}

/* ---------- Placements by study year (stacked bars) ---------- */

function PlacementsByYear({ data }: { data: InternshipOverviewData }) {
  const [studyYear, setStudyYear] = useState<StudyYearFilter>("all");
  const years: StudyYear[] = studyYear === "all" ? STUDY_YEARS : STUDY_YEARS.filter(y => String(y) === studyYear);
  const rows = placementsByCompany(data).map(r => ({ ...r, shown: years.reduce((n, y) => n + r.byYear[y], 0) })).filter(r => r.shown > 0).sort((a, b) => b.shown - a.shown || b.total - a.total);
  const scale = niceScale(Math.max(...rows.map(r => r.shown), 1));
  const totals = STUDY_YEARS.map(y => placementsByCompany(data).reduce((n, r) => n + r.byYear[y], 0));
  return <Card id="io-placements" title="จำนวนนิสิตที่แต่ละบริษัทรับไป" className="io-span-2"
    legend={<Legend items={years.map(y => ({ key: `${y}`, label: `ปี ${y} · ${formatNumber(totals[y - 1])} คน`, className: `io-c-year-${y}` }))} />}
    tools={<YearSelect label="กรองชั้นปีของจำนวนนิสิตที่บริษัทรับ" value={studyYear} onChange={setStudyYear} />}>
    <div className="io-stack-list">
      {rows.map(r => <div className="io-stack-row" key={r.company.id}>
        <span className="io-hbar-label" title={r.company.name}>{r.company.shortName}</span>
        <span className="io-stack-track">
          <span className="io-stack" style={{ width: `${(r.shown / scale.max) * 100}%` }}>
            {years.map(y => r.byYear[y] ? <i key={y} className={`io-c-year-${y}`} style={{ flexGrow: r.byYear[y] }} data-tip={`${r.company.shortName} · ปี ${y}: ${r.byYear[y]} คน`} /> : null)}
          </span>
          <b>{formatNumber(r.shown)}</b>
        </span>
      </div>)}
      {!rows.length && <p className="io-empty">ยังไม่มีนิสิตที่ได้รับในขอบเขตนี้</p>}
    </div>
    <TableView><table className="io-table"><thead><tr><th scope="col">บริษัท</th>{STUDY_YEARS.map(y => <th scope="col" key={y}>ปี {y}</th>)}<th scope="col">รวม</th></tr></thead>
      <tbody>{placementsByCompany(data).filter(r => r.total > 0).sort((a, b) => b.total - a.total).map(r => <tr key={r.company.id}><th scope="row">{r.company.shortName}</th>{STUDY_YEARS.map(y => <td key={y}>{formatNumber(r.byYear[y])}</td>)}<td><strong>{formatNumber(r.total)}</strong></td></tr>)}</tbody></table></TableView>
  </Card>;
}

/* ---------- Page ---------- */

export function InternshipOverview({ academicYear }: { academicYear: number }) {
  const data = buildInternshipOverview(academicYear);
  const years = Array.from({ length: TREND_YEARS }, (_, i) => academicYear - (TREND_YEARS - 1) + i);
  const trend = years.map(y => overviewKpis(buildInternshipOverview(y)));
  const series = (key: "students" | "companies" | "openings" | "seats") => trend.map(t => t[key]);
  return <div className="io-overview">
    <p className="io-scope-note">ปีการศึกษา {academicYear} · ข้อมูลจำลองสำหรับออกแบบหน้า Dashboard (ยังไม่เชื่อมข้อมูลจริง)</p>
    <div className="io-board">
      <KpiTile label="นิสิตทั้งหมด" unit="คน" values={series("students")} years={years} />
      <KpiTile label="บริษัทที่เปิดรับ" unit="แห่ง" values={series("companies")} years={years} />
      <KpiTile label="ตำแหน่งงานที่เปิดรับ" unit="ตำแหน่ง" values={series("openings")} years={years} />
      <KpiTile label="ที่นั่งทั้งหมด" unit="ที่นั่ง" values={series("seats")} years={years} />
      <GroupedRankChart data={data} />
      <MatchDonut data={data} />
      <TopCompanies data={data} />
      <TopPositions data={data} />
      <SeatsVsAccepted data={data} />
      <PlacementsByYear data={data} />
    </div>
  </div>;
}
