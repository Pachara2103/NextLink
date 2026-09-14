"use client";
import Link from 'next/link';
import { usePartnershipHistory } from '../lib/use-partnership-history';
import { signedWithoutFriday } from '../lib/partnership-history';
import { companyKey } from '../lib/company-directory';

export function FridayMouFollowUps() {
  const history = usePartnershipHistory();
  const rows = signedWithoutFriday(history.currentMous, history.friday, history.ready && history.warnings.length === 0);
  return <section className="panel insight-panel" aria-labelledby="friday-mou-title">
    <h3 id="friday-mou-title">ลงนาม MOU แล้ว แต่ไม่พบประวัติจัด Friday Activity</h3>
    <p className="panel-caption">อ้างอิงสถานะ MOU เทอม 1/2569 และกิจกรรมที่จัดแล้วในชุดทดลองปี 2566–2569 ทุกเทอม · ไม่เปลี่ยนตามตัวกรองกิจกรรมด้านบน · ยังไม่ใช่ข้อสรุปจากประวัติจริงทั้งหมด</p>
    {rows === null ? <p role="status">{history.ready ? 'ข้อมูลบางส่วนอ่านไม่ได้ จึงยังสรุปรายการนี้ไม่ได้' : 'กำลังตรวจประวัติทุกเทอม…'}</p> : rows.length ? <div className="insight-card-grid">{rows.map(m => <article className="insight-card" key={m.id}><h4>{m.companyThai}</h4><small>{m.documentStatus}</small><Link href={`/dashboard/companies?company=${encodeURIComponent(companyKey('mou', m.id))}`}>ดูผู้ติดต่อและประวัติบริษัท →</Link><p><Link href={`/dashboard/mou?q=${encodeURIComponent(m.companyThai)}`}>ตรวจเอกสาร MOU</Link></p></article>)}</div> : <p>ไม่พบบริษัทที่เข้าเงื่อนไขในชุดข้อมูลที่ตรวจได้</p>}
  </section>;
}
