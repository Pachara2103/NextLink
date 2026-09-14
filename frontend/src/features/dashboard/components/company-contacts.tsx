"use client";
import Link from 'next/link';
import { companyKey, moduleLabels, latestCase, type BusinessModule } from '../lib/company-directory';
import { useCompanyDirectory } from '../lib/use-company-directory';

export function CompanyContacts({ module, sourceId }: { module: BusinessModule; sourceId: string }) {
  const directory = useCompanyDirectory();
  const id = companyKey(module, sourceId), company = directory.items.find(c => c.id === id);
  const recent = latestCase(company?.cases.filter(c => c.module === module) ?? []);
  const contacts = company?.contacts.filter(c => c.modules.includes(module) || c.modules.includes('general')) ?? [];
  return <section className="detail-section insight-panel" aria-label="ผู้ประสานงานบริษัท">
    <div className="section-heading-row"><h3>ผู้ประสานงานและบทบาท</h3><Link className="text-button" href={`/dashboard/companies?company=${encodeURIComponent(id)}`}>ผู้ติดต่อและประวัติบริษัท →</Link></div>
    <p className="panel-caption">ทะเบียนผู้ติดต่อร่วมในชุดทดลอง · แสดงผู้รับผิดชอบ{moduleLabels[module]}และผู้ประสานงานทั่วไป</p>
    {directory.warning && <p role="alert">{directory.warning}</p>}
    <div className="insight-card-grid">{contacts.map(c => <article key={c.id} className="insight-card"><strong>{c.name}</strong><small>{c.role} · {c.status}</small><p>โทร: {c.phone || 'ยังไม่ระบุ'}<br />อีเมล: {c.email || 'ยังไม่ระบุ'}<br />LINE: {c.lineId || 'ยังไม่ระบุ'}</p><small>{c.modules.map(m => m === 'general' ? 'ทั่วไป' : moduleLabels[m]).join(' · ')}</small></article>)}</div>
    {contacts.length === 0 && <p>ยังไม่มีผู้ประสานงานที่ระบุสำหรับงานนี้</p>}
    {recent && <p>Case ล่าสุด: <strong>{recent.title}</strong> · {recent.occurredOn} · {recent.status === "open" ? "ติดตามอยู่" : "ปิดแล้ว"}</p>}
  </section>;
}
