"use client";
import { useState } from 'react';
import { demoInternshipEvaluations, evaluationSummary, type InternshipScope } from '../lib/internship-history';
import type { AcademicPeriod } from '../lib/academic-period';
import type { InternshipCompany, InternshipTrack } from '../lib/types';

export function InternshipEvaluations({ companies, period, track, scope }: { companies: InternshipCompany[]; period: AcademicPeriod; track: InternshipTrack; scope: InternshipScope }) {
  const [comparison, setComparison] = useState('current');
  const year = comparison === 'current' ? period.year : period.year - 1;
  const rows = demoInternshipEvaluations(companies, year, period.term, track).filter(r => (scope.studyYear === 'all' || String(r.studyYear) === scope.studyYear) && (scope.round === 'all' || r.round === scope.round));
  const summary = evaluationSummary(rows);
  return <section className="panel insight-panel" aria-labelledby="intern-evaluation-title">
    <div className="panel-heading"><div><p className="section-kicker">นิสิตประเมินบริษัทหลังจบ{track}</p><h3 id="intern-evaluation-title">ความพึงพอใจย้อนหลัง</h3></div><label><span>ปีของผลประเมิน</span><select value={comparison} onChange={e => setComparison(e.target.value)}><option value="current">{period.year}</option><option value="previous">{period.year - 1}</option></select></label></div>
    <p className="panel-caption">ปี {year} · เทอม {period.term} · ตามตัวกรองบริษัท ชั้นปีและรอบ · ชุดตัวอย่างสำหรับทดลองอ่านผลย้อนหลัง</p>
    <p><strong>{summary.mean === null ? 'ยังไม่มีคะแนน' : `${summary.mean.toFixed(2)} / 5`}</strong> · {summary.scored} คำตอบที่มีคะแนน จาก {summary.responses} คำตอบ</p>
    <div className="insight-card-grid">{companies.map(c => {
      const responses = rows.filter(r => r.companyId === c.id), s = evaluationSummary(responses);
      return <article className="insight-card" key={c.id}><h4>{c.shortName}</h4><strong>{s.mean === null ? 'ยังไม่มีคะแนน' : `${s.mean.toFixed(2)} / 5`}</strong><small>{s.scored} คำตอบที่มีคะแนน</small><details><summary>อ่านข้อเสนอแนะ ({responses.length})</summary>{responses.map(r => <p key={r.id}>ปี {r.studyYear} · รอบ {r.round}: {r.comment}</p>)}</details></article>;
    })}</div>
    {!rows.length && <p className="empty-state">ยังไม่มีผลประเมินในขอบเขตนี้</p>}
    <p className="panel-caption">คะแนนนี้เป็นนิสิตประเมินบริษัท แยกจากเกรดและคะแนนที่พี่เลี้ยงประเมินนิสิต คำตอบว่างไม่คิดเป็นศูนย์</p>
  </section>;
}
