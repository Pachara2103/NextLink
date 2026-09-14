import Link from 'next/link';
import { latestCase, moduleLabels, type DirectoryCompany } from '../lib/company-directory';

/** Reads the shared registry across periods; failed reads must not imply no cases. */
export function LatestCompanyCase({ company, companyId, ready, warning }: { company?: DirectoryCompany; companyId: string; ready: boolean; warning: string | null }) {
  const recent = ready && !warning ? latestCase(company?.cases ?? []) : null;
  return <div className="company-case-preview" data-status={recent?.status ?? 'unknown'}>
    <small>Case ล่าสุดของบริษัท · ทุกปีและทุกงาน</small>
    {warning ? <span>อ่าน Case ไม่ได้ กรุณาตรวจทะเบียนบริษัท</span> : !ready ? <span>กำลังโหลด Case</span> : recent ? <><strong>{recent.title}</strong><small>{recent.occurredOn} (ค.ศ.) · {moduleLabels[recent.module]} · {recent.status === 'open' ? 'ติดตามอยู่' : 'ปิดแล้ว'}</small></> : <span>{company ? 'ยังไม่มี Case ที่บันทึก' : 'ยังไม่พบข้อมูลบริษัทในทะเบียนร่วม'}</span>}
    <Link className="text-button" href={'/dashboard/companies?company=' + encodeURIComponent(companyId)}>ดูประวัติและบันทึก Case →</Link>
  </div>;
}
