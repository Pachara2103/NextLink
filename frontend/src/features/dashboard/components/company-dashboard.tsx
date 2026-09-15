"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppNav, DashboardModuleNav } from './app-nav';
import { StorageRecoveryPanel } from './storage-recovery';
import { LocalDataStatus } from './local-data-status';
import { CompanyRecord } from './company-record';
import { useCompanyDirectory } from '../lib/use-company-directory';
import { usePartnershipHistory } from '../lib/use-partnership-history';
import { companyEvents } from '../lib/partnership-history';
import { moduleLabels, latestCase } from '../lib/company-directory';

export function CompanyDashboard() {
  const directory = useCompanyDirectory(), history = usePartnershipHistory(), params = useSearchParams();
  const selectedId = params.get('company');
  const [query, setQuery] = useState('');
  const selected = directory.items.find(c => c.id === selectedId);
  const rows = directory.items.filter(c => [c.name, ...c.aliases, ...c.contacts.map(p => p.name)].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="app-shell company-dashboard" data-ready={directory.ready && history.ready}>
    <header className="topbar"><AppNav title="ทะเบียนบริษัท" /><Link className="secondary-button" href="/dashboard">กลับภาพรวม</Link></header><DashboardModuleNav />
    <main id="main-content" tabIndex={-1} className="page-content">
      <section className="intro-row"><div><p className="section-kicker">ข้อมูลบริษัทที่ใช้ร่วมกัน</p><h2>บริษัท ผู้ประสานงาน และประวัติความร่วมมือ</h2><p className="intro-copy">ข้อมูลตัวอย่าง · บันทึกในเบราว์เซอร์แยกตามบัญชี · แก้ผู้ติดต่อที่นี่แล้วแสดงร่วมทุกโมดูลที่จับคู่ไว้</p></div></section>
      <LocalDataStatus editedAt={directory.editedAt} warning={directory.warning} hasOverrides={directory.hasOverrides} timezone="Asia/Bangkok" onReset={() => { if (window.confirm("คืนค่าทะเบียนบริษัทตั้งต้น รวมผู้ติดต่อและ Case ทุกปีในเบราว์เซอร์นี้หรือไม่?")) void directory.reset(); }} />
      <StorageRecoveryPanel key={directory.recovery?.raw} recovery={directory.recovery} onRecover={directory.recover} />
      {directory.warning && <p role="alert" className="cap-warning">{directory.warning}</p>}
      {history.warnings.length > 0 && <p role="alert" className="cap-warning">อ่านข้อมูลบางโมดูลไม่ได้ จึงแสดงเฉพาะประวัติที่อ่านได้ กรุณาตรวจข้อมูลที่บันทึกในหน้าโมดูลนั้น</p>}
      {selected ? <><Link className="text-button" href="/dashboard/companies">← บริษัททั้งหมด</Link><CompanyRecord key={selected.id} company={selected} events={companyEvents(history.events, selected.id)} ready={directory.ready && !directory.warning} onSave={(id, next) => directory.update(rows => rows.map(c => c.id === id ? next : c))} /></> : <section className="panel insight-panel">
        {selectedId && <p role="status">ไม่พบบริษัทที่เลือกในทะเบียนตัวอย่าง</p>}
        <label>ค้นหาบริษัทหรือผู้ประสานงาน<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <p className="panel-caption">{rows.length} บริษัท · ใช้การจับคู่รหัสที่ระบุไว้ในชุดตัวอย่าง</p>
        <div className="insight-card-grid">{rows.map(c => { const events = companyEvents(history.events, c.id), recent = latestCase(c.cases); return <article className="insight-card" key={c.id}><h3><Link href={`/dashboard/companies?company=${encodeURIComponent(c.id)}`}>{c.name}</Link></h3><p>{[...new Set(events.map(e => e.module))].map(m => moduleLabels[m]).join(' · ') || 'ยังไม่มีประวัติ'}</p><small>{c.contacts.length} ผู้ประสานงาน · {c.cases.filter(n => n.status === 'open').length} Case ที่ติดตาม</small><p>Case ล่าสุด: {recent?.title ?? 'ยังไม่มีบันทึก'}</p></article>; })}</div>
        {!rows.length && <p>ไม่พบบริษัท ลองค้นด้วยชื่ออื่น</p>}
      </section>}
    </main>
  </div>;
}
