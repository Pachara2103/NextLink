import type { InternshipCompany, InternshipOutcome, InternshipTrack } from '../lib/types';
import { openingKey } from '../lib/internship-history';

// Explicit synthetic outcomes, independent of preference ranks and old intake totals.
// The same student appears in two rounds to exercise unique-person counts.
const fixture = [
  { student: 1, company: 'cloud', opening: 0, round: '1', matched: true, accepted: false, started: false },
  { student: 1, company: 'cloud', opening: 0, round: '2', matched: true, accepted: true, started: true },
  { student: 2, company: 'softmatrix', opening: 0, round: '1', matched: true, accepted: true, started: false },
  { student: 3, company: 'dataforge', opening: 0, round: '1', matched: true, accepted: null, started: null },
  { student: 4, company: 'cloud', opening: 1, round: '2', matched: true, accepted: true, started: true },
  { student: 5, company: 'cyberflow', opening: 0, round: '2', matched: false, accepted: false, started: false },
  { student: 6, company: 'dataforge', opening: 0, round: '2', matched: null, accepted: null, started: null },
];
export function demoInternshipOutcomes(companies: InternshipCompany[], track: InternshipTrack): InternshipOutcome[] {
  return fixture.flatMap((r, i) => {
    const company = companies.find(c => c.id === `internship-company-mock-${r.company}`), position = company?.positions[r.opening];
    if (!company || !position) return [];
    return [{ id: `demo-outcome-${i + 1}`, studentRef: `demo-${track === 'ฝึกงาน' ? 'intern' : 'coop'}-student-${r.student}`, companyId: company.id,
      openingId: position.id ?? openingKey(company.id, r.opening), studyYear: track === 'ฝึกงาน' ? (r.student - 1) % 3 + 1 : 3,
      round: r.round, matched: r.matched, accepted: r.accepted, started: r.started, note: 'สถานะสมมติสำหรับตรวจหน้าจอ ไม่ใช่ผลฝึกงานจริง' }];
  });
}
