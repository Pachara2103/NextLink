"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Card, Legend, Select, Sparkline, TableView } from "@/features/dashboard/components/internship-overview";
import { formatNumber } from "@/features/dashboard/lib/format";
import {
  BENEFITS, byCompany, COMPANIES, DIMENSIONS, EVALUATION_YEARS, evaluationYear, FILE_YEAR, GROWTH, OVERALL, shortCompany, summarize, WORK_TYPES, yearlyTrend,
  type CompanyEvaluation, type EvaluationSummary,
} from "@/features/dashboard/lib/internship-evaluation";

/*
 * ฝึกงาน › ผลการประเมิน: what students said about each company after the
 * internship (exit survey, 1–5). Same card board as the overview tab.
 */

const fmt = (v: number | null, digits = 2) => v === null ? "–" : v.toFixed(digits);
const MIN_OPTIONS = [{ value: "1", label: "ผู้ตอบ ≥ 1 คน" }, { value: "3", label: "ผู้ตอบ ≥ 3 คน" }, { value: "5", label: "ผู้ตอบ ≥ 5 คน" }] as const;
type MinOption = typeof MIN_OPTIONS[number]["value"];
type SortKey = "high" | "low" | "responses" | "change" | "name";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "high", label: "คะแนนสูงสุด" }, { value: "low", label: "คะแนนต่ำสุด" }, { value: "responses", label: "ผู้ตอบมากสุด" }, { value: "change", label: "ลดลงมากสุดจากปีก่อน" }, { value: "name", label: "ชื่อบริษัท" },
];

/** Score as a light→dark tint of the primary hue; text flips to white on dark cells. */
function heat(score: number | null) {
  if (score === null) return {};
  // Most answers sit between 3 and 5, so the ramp spends its range there.
  const t = Math.min(Math.max((score - 2.5) / 2.5, 0), 1);
  return { background: `color-mix(in srgb, var(--io-c1) ${Math.round(6 + t * 74)}%, var(--surface))`, color: t > 0.6 ? "#fff" : "var(--ink)" };
}

function ScoreDelta({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (now === null || before === null || before === undefined) return <span className="io-delta">–</span>;
  const d = now - before;
  const tone = d > 0.05 ? "is-up" : d < -0.05 ? "is-down" : "";
  return <span className={`io-delta ${tone}`}><span aria-hidden="true">{d > 0.05 ? "▲" : d < -0.05 ? "▼" : "■"}</span> {Math.abs(d).toFixed(2)}<span className="sr-only">{d >= 0 ? " เพิ่มขึ้น" : " ลดลง"}</span></span>;
}

function EvalKpi({ label, value, unit, delta, deltaLabel, spark, sparkLabel }: { label: string; value: string; unit?: string; delta: ReactNode; deltaLabel: string; spark: number[]; sparkLabel: string }) {
  return <article className="io-card io-kpi">
    <h3 className="io-kpi-label">{label}</h3>
    <div className="io-kpi-value">{value}{unit && <small>{unit}</small>}</div>
    <div className="io-kpi-foot">
      <div className="io-kpi-yoy"><span>{deltaLabel}</span>{delta}</div>
      {spark.length > 1 && <Sparkline values={spark} label={sparkLabel} />}
    </div>
  </article>;
}

function PctDelta({ now, before }: { now: number; before: number | undefined }) {
  if (!before) return <span className="io-delta">–</span>;
  const pct = Math.round((now - before) / before * 100);
  return <span className={`io-delta ${pct > 0 ? "is-up" : pct < 0 ? "is-down" : ""}`}><span aria-hidden="true">{pct > 0 ? "▲" : pct < 0 ? "▼" : "■"}</span> {Math.abs(pct)}%</span>;
}

/* ---------- Cards ---------- */

function DimensionBars({ now, before, compact = false }: { now: EvaluationSummary; before?: EvaluationSummary | null; compact?: boolean }) {
  return <div className={`ie-dims ${compact ? "is-compact" : ""}`}>
    {DIMENSIONS.map((d, i) => {
      const v = now.dimensions[i], p = before?.dimensions[i] ?? null;
      return <div className={`ie-dim ${i === OVERALL ? "is-overall" : ""}`} key={d.key}>
        <span className="ie-dim-label">{d.label}</span>
        <span className="ie-dim-track" data-tip={`${d.label}: ${fmt(v)}${p !== null ? ` · ปีก่อน ${fmt(p)}` : ""}`}>
          <i style={{ width: `${v === null ? 0 : (v / 5) * 100}%` }} />
          {p !== null && <b className="ie-dim-prev" style={{ left: `${(p / 5) * 100}%` }} aria-hidden="true" />}
        </span>
        <span className="ie-dim-value">{fmt(v)}</span>
        {before !== undefined && <ScoreDelta now={v} before={p} />}
      </div>;
    })}
  </div>;
}

function Distribution({ summary }: { summary: EvaluationSummary }) {
  const total = summary.distribution.reduce((s, n) => s + n, 0) || 1;
  const max = Math.max(...summary.distribution, 1);
  return <div className="ie-dist" role="figure" aria-label={`การกระจายคะแนนความพึงพอใจโดยรวม: ${summary.distribution.map((n, i) => `${i + 1} คะแนน ${n} คน`).join(", ")}`}>
    {summary.distribution.map((n, i) => <div className="ie-dist-col" key={i}>
      <span className="ie-dist-pct">{Math.round(n / total * 100)}%</span>
      <span className="ie-dist-bar-wrap"><span className={`ie-dist-bar is-${i + 1}`} style={{ height: `${(n / max) * 100}%` }} data-tip={`${i + 1} คะแนน: ${n} คน`} /></span>
      <span className="ie-dist-label">{i + 1}</span>
    </div>)}
  </div>;
}

function Benefits({ summary }: { summary: EvaluationSummary }) {
  return <div className="ie-benefits">
    <div className="ie-allowance"><span>เบี้ยเลี้ยงต่อวัน (ค่ากลาง)</span><strong>{summary.allowanceMedian === null ? "–" : `${formatNumber(summary.allowanceMedian)} บาท`}</strong></div>
    {BENEFITS.map((label, i) => {
      const b = summary.benefits[i], pct = b.known ? Math.round(b.yes / b.known * 100) : 0;
      return <div className="ie-benefit" key={label}>
        <span>{label}</span>
        <span className="io-meter"><i style={{ width: `${pct}%` }} /></span>
        <b>{b.known ? `${pct}%` : "–"}</b>
      </div>;
    })}
  </div>;
}

function Growth({ summary }: { summary: EvaluationSummary }) {
  return <div className="ie-growth">
    <Legend items={[{ key: "b", label: "ก่อนฝึกงาน", className: "io-c-empty-strong" }, { key: "a", label: "หลังฝึกงาน", className: "io-c-rank-1" }]} />
    {GROWTH.map((g, i) => {
      const { before, after } = summary.growth[i];
      return <div className="ie-growth-row" key={g.label}>
        <span className="ie-dim-label">{g.label}</span>
        <span className="ie-dumbbell" data-tip={`${g.label}: ก่อน ${fmt(before)} → หลัง ${fmt(after)}`}>
          {i === GROWTH.length - 1 && [1, 2, 3, 4, 5].map(t => <em key={t} style={{ left: `${((t - 1) / 4) * 100}%` }}>{t}</em>)}
          {before !== null && after !== null && <i className="ie-dumbbell-line" style={{ left: `${((before - 1) / 4) * 100}%`, width: `${((after - before) / 4) * 100}%` }} />}
          {before !== null && <b className="ie-dot is-before" style={{ left: `${((before - 1) / 4) * 100}%` }} />}
          {after !== null && <b className="ie-dot is-after" style={{ left: `${((after - 1) / 4) * 100}%` }} />}
        </span>
        <span className="ie-growth-value">{fmt(before)} → <strong>{fmt(after)}</strong></span>
      </div>;
    })}
  </div>;
}

function TrendChart({ year }: { year: number }) {
  const [company, setCompany] = useState("all");
  const companyIndex = company === "all" ? null : Number(company);
  const trend = yearlyTrend(year, companyIndex);
  const points = trend.filter(t => t.summary.overall !== null);
  const w = 520, h = 210, padX = 44, padY = 24;
  const x = (i: number) => padX + (trend.length > 1 ? (i / (trend.length - 1)) * (w - padX * 2) : (w - padX * 2) / 2);
  const y = (v: number) => padY + (1 - (v - 1) / 4) * (h - padY * 2);
  const path = trend.map((t, i) => t.summary.overall === null ? null : `${x(i).toFixed(1)},${y(t.summary.overall).toFixed(1)}`).filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p}`).join(" ");
  const options = [{ value: "all", label: "ทุกบริษัท" }, ...COMPANIES.map((name, i) => ({ value: String(i), label: shortCompany(name) })).sort((a, b) => a.label.localeCompare(b.label, "th"))];
  return <Card id="ie-trend" title="ความพึงพอใจโดยรวมย้อนหลัง" className="io-span-2"
    tools={<Select label="เลือกบริษัทของกราฟย้อนหลัง" value={company} options={options} onChange={setCompany} />}>
    <p className="io-sub">{companyIndex === null ? "เฉลี่ยทุกบริษัท" : COMPANIES[companyIndex]} · คะแนนเต็ม 5</p>
    {points.length ? <svg className="ie-line" viewBox={`0 0 ${w} ${h + 26}`} role="img" aria-label={`คะแนนเฉลี่ยรายปี: ${trend.map(t => `${t.year} ${fmt(t.summary.overall)}`).join(", ")}`}>
      {[1, 2, 3, 4, 5].map(v => <g key={v}><line x1={padX} x2={w - padX / 2} y1={y(v)} y2={y(v)} className="ie-grid" /><text x={padX - 10} y={y(v) + 4} className="ie-axis" textAnchor="end">{v}</text></g>)}
      <path d={path} className="ie-line-path" />
      {trend.map((t, i) => <g key={t.year}>
        <text x={x(i)} y={h + 18} className="ie-axis" textAnchor="middle">{t.year}</text>
        {t.summary.overall !== null && <g className="ie-point">
          <circle cx={x(i)} cy={y(t.summary.overall)} r="5" className={t.year === year ? "is-current" : ""}><title>{`ปี ${t.year}: ${fmt(t.summary.overall)} จาก ${t.summary.responses} คน`}</title></circle>
          <text x={x(i)} y={y(t.summary.overall) - 12} className="ie-point-label" textAnchor="middle">{fmt(t.summary.overall)}</text>
        </g>}
      </g>)}
    </svg> : <p className="io-empty">บริษัทนี้ยังไม่มีผลประเมินในช่วงปีนี้</p>}
    <TableView><table className="io-table"><thead><tr><th scope="col">ปี</th><th scope="col">ผู้ตอบ</th><th scope="col">โดยรวม</th><th scope="col">พอใจ (4–5)</th></tr></thead>
      <tbody>{trend.map(t => <tr key={t.year}><th scope="row">{t.year}{t.synthetic ? " *" : ""}</th><td>{formatNumber(t.summary.responses)}</td><td>{fmt(t.summary.overall)}</td><td>{t.summary.satisfiedPct === null ? "–" : `${t.summary.satisfiedPct}%`}</td></tr>)}</tbody></table>
      <p className="io-note">* ปีที่จำลองจากข้อมูลปี {FILE_YEAR}</p></TableView>
  </Card>;
}

function CompanyList({ title, rows, onPick }: { title: string; rows: CompanyEvaluation[]; onPick: (index: number) => void }) {
  return <Card id={`ie-list-${title}`} title={title} className="io-span-2">
    <p className="io-sub">เฉพาะบริษัทที่มีผู้ตอบตั้งแต่ 3 คน · กดชื่อเพื่อดูรายละเอียดในตาราง</p>
    {rows.length ? <ol className="ie-company-list">{rows.map((r, i) => <li key={r.index}>
      <span className="io-rank-no">{i + 1}</span>
      <button type="button" className="ie-company-link" onClick={() => onPick(r.index)} title={r.name}>{shortCompany(r.name)}<small>{r.summary.responses} คน</small></button>
      <span className="ie-mini-bar"><i style={{ width: `${((r.summary.overall ?? 0) / 5) * 100}%` }} /></span>
      <span className="ie-score-pill" style={heat(r.summary.overall)}>{fmt(r.summary.overall)}</span>
    </li>)}</ol> : <p className="io-empty">ยังไม่มีบริษัทที่มีผู้ตอบพอ</p>}
  </Card>;
}

function CompanyDetail({ company, year, previous }: { company: CompanyEvaluation; year: number; previous: EvaluationSummary | null }) {
  const trend = yearlyTrend(year, company.index);
  const s = company.summary;
  const topWork = WORK_TYPES.map((label, i) => ({ label, share: s.work[i] })).filter(w => w.share > 0).sort((a, b) => b.share - a.share).slice(0, 4);
  return <div className="ie-detail">
    <section><h4>คะแนนรายด้าน {previous && <small>(▏= ปีก่อน)</small>}</h4><DimensionBars now={s} before={previous ?? undefined} compact /></section>
    <section><h4>การกระจายคะแนนโดยรวม</h4><Distribution summary={s} />
      <h4>ย้อนหลัง</h4>
      <ul className="ie-history">{trend.map(t => <li key={t.year} className={t.year === year ? "is-current" : ""}><span>{t.year}</span><b>{fmt(t.summary.overall)}</b><small>{t.summary.responses ? `${t.summary.responses} คน` : "ไม่มี"}</small></li>)}</ul>
    </section>
    <section><h4>สวัสดิการ</h4><Benefits summary={s} />
      <h4>ลักษณะงานที่ได้ทำ</h4>
      <ul className="ie-work">{topWork.map(w => <li key={w.label}><span>{w.label}</span><span className="io-meter is-small"><i style={{ width: `${w.share * 100}%` }} /></span><b>{Math.round(w.share * 100)}%</b></li>)}</ul>
    </section>
  </div>;
}

function CompanyTable({ year, rows, previous, focus, setFocus }: { year: number; rows: CompanyEvaluation[]; previous: Map<number, EvaluationSummary>; focus: number | null; setFocus: (i: number | null) => void }) {
  const [query, setQuery] = useState("");
  const [min, setMin] = useState<MinOption>("3");
  const [sort, setSort] = useState<SortKey>("high");
  const [limit, setLimit] = useState(15);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(r => r.summary.responses >= Number(min) && (!q || r.name.toLowerCase().includes(q)));
    const score = (r: CompanyEvaluation) => r.summary.overall ?? 0;
    const change = (r: CompanyEvaluation) => { const p = previous.get(r.index)?.overall; return p == null || r.summary.overall === null ? Infinity : r.summary.overall - p; };
    if (sort === "high") list.sort((a, b) => score(b) - score(a) || b.summary.responses - a.summary.responses);
    else if (sort === "low") list.sort((a, b) => score(a) - score(b) || b.summary.responses - a.summary.responses);
    else if (sort === "responses") list.sort((a, b) => b.summary.responses - a.summary.responses || score(b) - score(a));
    else if (sort === "change") list.sort((a, b) => change(a) - change(b));
    else list.sort((a, b) => shortCompany(a.name).localeCompare(shortCompany(b.name), "th"));
    return list;
  }, [rows, query, min, sort, previous]);
  // A company picked from the top/bottom lists is always visible, whatever the page size.
  const focusIndex = focus === null ? -1 : shown.findIndex(r => r.index === focus);
  const visible = shown.slice(0, Math.max(limit, focusIndex + 1));

  return <Card id="ie-table" title="คะแนนประเมินรายบริษัท" className="io-span-4"
    legend={<p className="io-sub ie-table-sub">คะแนนเฉลี่ยจากนิสิต (เต็ม 5) · สีเข้ม = คะแนนสูง · กดแถวเพื่อดูรายละเอียดและข้อมูลย้อนหลัง</p>}
    tools={<>
      <label className="io-select ie-search"><span className="sr-only">ค้นหาบริษัท</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาบริษัท…" /></label>
      <Select label="จำนวนผู้ตอบขั้นต่ำ" value={min} options={[...MIN_OPTIONS]} onChange={setMin} />
      <Select label="เรียงตาม" value={sort} options={SORT_OPTIONS} onChange={setSort} />
    </>}>
    <div className="ie-table-wrap">
      <table className="io-table ie-table">
        <thead><tr>
          <th scope="col">บริษัท</th><th scope="col">ผู้ตอบ</th><th scope="col" className="ie-col-overall">ความพึงพอใจโดยรวม</th>
          {DIMENSIONS.slice(0, OVERALL).map(d => <th scope="col" key={d.key} className="ie-col-heat">{d.short}</th>)}
          <th scope="col">เทียบปีก่อน</th><th scope="col">ย้อนหลัง</th>
        </tr></thead>
        <tbody>{visible.map(r => {
          const open = focus === r.index, prev = previous.get(r.index) ?? null;
          const spark = yearlyTrend(year, r.index).flatMap(t => t.summary.overall === null ? [] : [t.summary.overall]);
          return <Fragment key={r.index}>
            <tr className={`ie-row ${open ? "is-open" : ""}`} id={`ie-company-${r.index}`}>
              <th scope="row"><button type="button" className="ie-company-link" aria-expanded={open} onClick={() => setFocus(open ? null : r.index)}>
                <span className="io-chevron" aria-hidden="true" />{shortCompany(r.name)}{r.summary.responses < 3 && <span className="io-badge ie-badge-muted">ข้อมูลน้อย</span>}
              </button></th>
              <td>{formatNumber(r.summary.responses)}</td>
              <td className="ie-col-overall"><span className="ie-overall-cell"><span className="ie-mini-bar"><i style={{ width: `${((r.summary.overall ?? 0) / 5) * 100}%` }} /></span><strong>{fmt(r.summary.overall)}</strong></span></td>
              {DIMENSIONS.slice(0, OVERALL).map((d, i) => <td key={d.key} className="ie-col-heat"><span className="ie-heat" style={heat(r.summary.dimensions[i])}>{fmt(r.summary.dimensions[i], 1)}</span></td>)}
              <td><ScoreDelta now={r.summary.overall} before={prev?.overall} /></td>
              <td>{spark.length > 1 ? <Sparkline values={spark} label={`ย้อนหลัง ${spark.map(v => v.toFixed(2)).join(", ")}`} /> : <span className="io-delta">–</span>}</td>
            </tr>
            {open && <tr className="ie-detail-row"><td colSpan={DIMENSIONS.length + 4}><CompanyDetail company={r} year={year} previous={prev} /></td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    {!shown.length && <p className="io-empty">ไม่พบบริษัทตามเงื่อนไข</p>}
    {shown.length > visible.length && <button type="button" className="ie-more" onClick={() => setLimit(n => n + 20)}>แสดงเพิ่ม ({shown.length - visible.length} บริษัท)</button>}
  </Card>;
}

/* ---------- Page ---------- */

export function InternshipEvaluationBoard({ academicYear }: { academicYear: number }) {
  const [focus, setFocus] = useState<number | null>(null);
  const current = evaluationYear(academicYear);
  const prevYear = evaluationYear(academicYear - 1);
  const summary = useMemo(() => current ? summarize(current.responses) : null, [current]);
  const prevSummary = useMemo(() => prevYear ? summarize(prevYear.responses) : null, [prevYear]);
  const companies = useMemo(() => current ? byCompany(current.responses) : [], [current]);
  const previous = useMemo(() => new Map(prevYear ? byCompany(prevYear.responses).map(c => [c.index, c.summary]) : []), [prevYear]);

  if (!current || !summary) return <div className="io-overview">
    <p className="academic-period-empty" role="status">ยังไม่มีผลประเมินของปีการศึกษา {academicYear} · มีข้อมูลปี {EVALUATION_YEARS.join(", ")}</p>
  </div>;

  const trend = yearlyTrend(academicYear, null);
  const eligible = companies.filter(c => c.summary.responses >= 3 && c.summary.overall !== null);
  const top = [...eligible].sort((a, b) => b.summary.overall! - a.summary.overall! || b.summary.responses - a.summary.responses).slice(0, 5);
  const bottom = [...eligible].sort((a, b) => a.summary.overall! - b.summary.overall! || b.summary.responses - a.summary.responses).slice(0, 5);
  const pick = (index: number) => {
    setFocus(index);
    requestAnimationFrame(() => document.getElementById(`ie-company-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return <div className="io-overview">
    <p className="io-scope-note">
      ปีการศึกษา {academicYear} · แบบประเมินที่นิสิตตอบหลังจบฝึกงาน (Exit Survey) ·{" "}
      {current.synthetic ? `ข้อมูลจำลองจากไฟล์ตัวอย่างปี ${FILE_YEAR} เพื่อทดลองดูย้อนหลัง` : "ข้อมูลจากไฟล์ ผลการประเมิน_example.xlsx (ตัดชื่อและรหัสนิสิตออกแล้ว)"}
    </p>
    <div className="io-board">
      <EvalKpi label="ผู้ตอบแบบประเมิน" value={formatNumber(summary.responses)} unit="คน" deltaLabel={prevSummary ? `เทียบปี ${academicYear - 1}` : "ไม่มีปีก่อนให้เทียบ"}
        delta={<PctDelta now={summary.responses} before={prevSummary?.responses} />} spark={trend.map(t => t.summary.responses)} sparkLabel="จำนวนผู้ตอบรายปี" />
      <EvalKpi label="ความพึงพอใจโดยรวม" value={fmt(summary.overall)} unit="/ 5" deltaLabel={prevSummary ? `เทียบปี ${academicYear - 1}` : "ไม่มีปีก่อนให้เทียบ"}
        delta={<ScoreDelta now={summary.overall} before={prevSummary?.overall} />} spark={trend.flatMap(t => t.summary.overall === null ? [] : [t.summary.overall])} sparkLabel="ความพึงพอใจโดยรวมรายปี" />
      <EvalKpi label="นิสิตที่พึงพอใจ (4–5 คะแนน)" value={summary.satisfiedPct === null ? "–" : `${summary.satisfiedPct}`} unit="%" deltaLabel={prevSummary ? `ปี ${academicYear - 1}: ${prevSummary.satisfiedPct ?? "–"}%` : "ไม่มีปีก่อนให้เทียบ"}
        delta={null} spark={trend.flatMap(t => t.summary.satisfiedPct === null ? [] : [t.summary.satisfiedPct])} sparkLabel="สัดส่วนที่พึงพอใจรายปี" />
      <EvalKpi label="บริษัทที่ได้รับการประเมิน" value={formatNumber(companies.length)} unit="แห่ง" deltaLabel={prevYear ? `เทียบปี ${academicYear - 1}` : "ไม่มีปีก่อนให้เทียบ"}
        delta={<PctDelta now={companies.length} before={prevYear ? byCompany(prevYear.responses).length : undefined} />} spark={trend.map(t => EVALUATION_YEARS.includes(t.year) ? byCompany(evaluationYear(t.year)!.responses).length : 0)} sparkLabel="จำนวนบริษัทรายปี" />

      <Card id="ie-dims" title="คะแนนเฉลี่ยรายด้าน" className="io-span-2"
        legend={<Legend items={[{ key: "now", label: `ปี ${academicYear}`, className: "io-c-rank-1" }, ...(prevSummary ? [{ key: "prev", label: `ปี ${academicYear - 1} (ขีด)`, className: "io-c-prev" }] : [])]} />}>
        <DimensionBars now={summary} before={prevSummary} />
      </Card>
      <Card id="ie-dist" title="การกระจายคะแนนโดยรวม" className="io-span-1">
        <p className="io-sub">นิสิตให้คะแนนความพึงพอใจต่อบริษัทกี่คะแนน</p>
        <Distribution summary={summary} />
      </Card>
      <Card id="ie-benefits" title="สวัสดิการที่นิสิตได้รับ" className="io-span-1">
        <p className="io-sub">% ของนิสิตที่ตอบว่าได้รับ</p>
        <Benefits summary={summary} />
      </Card>

      <CompanyList title="บริษัทที่นิสิตพึงพอใจมากที่สุด" rows={top} onPick={pick} />
      <CompanyList title="บริษัทที่ควรติดตาม (คะแนนต่ำสุด)" rows={bottom} onPick={pick} />

      <Card id="ie-growth" title="พัฒนาการของนิสิต ก่อน → หลังฝึกงาน" className="io-span-2">
        <p className="io-sub">นิสิตประเมินตัวเอง (เต็ม 5) · เฉลี่ยทุกบริษัท</p>
        <Growth summary={summary} />
      </Card>
      <TrendChart year={academicYear} />

      <CompanyTable year={academicYear} rows={companies} previous={previous} focus={focus} setFocus={setFocus} />
    </div>
  </div>;
}
