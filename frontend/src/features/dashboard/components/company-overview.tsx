"use client";
import Link from 'next/link';
import { useCompanyDirectory } from '../lib/use-company-directory';
import { usePartnershipHistory } from '../lib/use-partnership-history';
import { latestCase } from '../lib/company-directory';

export function CompanyOverview() {
  const directory = useCompanyDirectory(), history = usePartnershipHistory();
  return <section className="panel insight-panel" aria-labelledby="company-overview-title">
    <div className="panel-heading"><div><h2 id="company-overview-title">ประวัติความร่วมมือของบริษัท</h2><p className="panel-caption">รวมข้อมูลข้ามโมดูลและข้ามเทอม · ข้อมูลตัวอย่างในเบราว์เซอร์นี้</p></div><Link className="secondary-button" href="/dashboard/companies">ดูทะเบียนบริษัททั้งหมด →</Link></div>
    {(history.warnings.length > 0 || directory.warning) && <p role="alert">มีข้อมูลบางส่วนอ่านไม่ได้ ประวัติอาจไม่ครบ</p>}
    <div className="insight-card-grid">{directory.items.slice(0, 3).map(c => {
      const events = history.events.filter(e => e.companyId === c.id), recent = latestCase(c.cases);
      return <article className="insight-card" key={c.id}><h3><Link href={`/dashboard/companies?company=${encodeURIComponent(c.id)}`}>{c.name}</Link></h3><p>{new Set(events.map(e => e.module)).size} โมดูล · {c.contacts.length} ผู้ติดต่อ</p><small>Case ล่าสุด: {recent ? `${recent.title} · ปี ${recent.academicYear}` : 'ยังไม่มีบันทึก'}</small></article>;
    })}</div>
  </section>;
}
