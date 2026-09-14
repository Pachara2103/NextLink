import { mockDashboardData } from './mock-data';
import mouData from '../data/mou-companies.json';
import capstoneData from '../data/capstone-projects.json';
import { fridayActivities } from '../data/friday-activities';
import rawInternship from '../data/internship-companies.json';
import intakes from '../data/internship-track-intakes.json';
import { selectInternshipTrack } from './internship-tracks';
import { internshipPeriodSource, selectCapstonePeriod, selectElectivePeriod, selectMouPeriod } from './academic-data';
import { enrichInternshipDemo } from './internship-history';
import { periodStorageKey, academicPeriodKey, matchesAcademicPeriod, withAcademicPeriod, type AcademicPeriod } from './academic-period';
import { isDashboardCourse, isInternshipCompany, isMouCompany } from './dataset-validation';
import { isFridayActivity, fridayStorageKey, selectFridayPeriod, type FridayActivity } from './friday-activity';
import { capstoneStorageRows, capstoneFromRows, isCapstoneStorageRow } from './capstone-storage-rows';
import { companyKey, type BusinessModule } from './company-directory';
import type { RowValidator } from './local-dataset';
import type { CapstoneDataset } from './capstone-types';
import type { MouPayload, MouCompany, InternshipPayload } from './types';

export type PartnershipEvent = { id: string; companyId: string; module: BusinessModule; year: number; term: string; title: string; detail: string; href: string };
export type SnapshotReader = <T extends { id: string }>(key: string, seed: T[], validator: RowValidator<T>) => T[];
export const partnershipPeriods: AcademicPeriod[] = [2569, 2568, 2567, 2566].flatMap(year => (['1', '2', 'summer'] as const).map(term => ({ year, term })));
export function partnershipSnapshot(read: SnapshotReader = (_key, seed) => seed) {
  const events: PartnershipEvent[] = [], friday: FridayActivity[] = [];
  let currentMous: MouCompany[] = [];
  for (const period of partnershipPeriods) {
    const key = (base: string) => periodStorageKey(base, period);
    const add = (module: BusinessModule, sourceId: string, id: string, title: string, detail: string, route: string, query: string) => events.push({ id: `${module}:${academicPeriodKey(period)}:${id}`, companyId: companyKey(module, sourceId), module, year: period.year, term: period.term, title, detail, href: withAcademicPeriod(`${route}?q=${encodeURIComponent(query)}`, period) });
    const courses = read(key('nextlink.elective.courses.v1'), selectElectivePeriod(mockDashboardData, period).courses, isDashboardCourse);
    for (const c of courses) add('elective', mockDashboardData.courses.find(original => original.id === c.id)?.provider ?? c.provider, c.id, c.title, `${c.courseCode} · ${c.instructor} · ${c.sessions.map(s => `${s.dayOfWeek} ${s.startTime}–${s.endTime} ${s.location}`).join(', ')}`, '/dashboard/electives', c.courseCode);
    const mous = read(key('nextlink.mou.companies.v1'), selectMouPeriod({ ...mouData, isMock: true, source: 'mock' } as MouPayload, period).companies, isMouCompany);
    if (period.year === 2569 && period.term === '1') currentMous = mous;
    for (const m of mous) add('mou', m.id, m.id, m.documentStatus, `${m.companyThai} · ${m.note ?? ''}`, '/dashboard/mou', m.companyThai);
    const selection = internshipPeriodSource({ ...rawInternship, isMock: true, source: 'mock' } as Omit<InternshipPayload, 'track'>, intakes.tracks, period);
    for (const track of ['ฝึกงาน', 'สหกิจศึกษา'] as const) {
      const businessModule = track === 'ฝึกงาน' ? 'internship' : 'cooperative';
      const source = enrichInternshipDemo(selectInternshipTrack(selection.source as Omit<InternshipPayload, 'track'>, selection.intakes, track));
      const companies = read(key(track === 'ฝึกงาน' ? 'nextlink.internship.companies.v2' : 'nextlink.cooperative.companies.v1'), source.companies, isInternshipCompany);
      for (const c of companies) add(businessModule, c.id, c.id, `${track}: ${c.positions.map(p => p.name).join(', ')}`, `แจ้งรับ ${c.positions.reduce((n, p) => n + p.declaredIntake, 0)} · รับจริง ${c.positions.reduce((n, p) => n + p.accepted, 0)} · ${c.note ?? ''}`, `/dashboard/${businessModule}`, c.shortName);
    }
    const capSeed = selectCapstonePeriod(capstoneData as CapstoneDataset, period);
    const capRows = read(`nextlink.capstone.v2.${academicPeriodKey(period)}`, capstoneStorageRows(capSeed), isCapstoneStorageRow);
    if (capRows.length) for (const t of capstoneFromRows(capRows).topics) if (t.companyId) add('capstone', t.companyId, t.id, t.title, `${t.assignments.length} ทีมยืนยัน · ${t.milestones.length} Milestone · ${t.notes.length} บันทึก`, '/dashboard/capstone', t.title);
    const acts = read(key(fridayStorageKey), selectFridayPeriod(fridayActivities, period), isFridayActivity); friday.push(...acts);
    for (const a of acts) add('friday', a.companyId, a.id, a.title, `${a.date ?? 'ยังไม่กำหนดวัน'} · ${a.status} · ${a.attended === null ? 'ยังไม่ทราบจำนวนมาจริง' : `${a.attended} คน-ครั้ง`}`, '/dashboard/friday-activities', a.title);
  }
  return { events: events.sort((a, b) => b.year - a.year || b.term.localeCompare(a.term) || a.id.localeCompare(b.id)), friday, currentMous };
}
export function companyEvents(events: PartnershipEvent[], companyId: string, period?: AcademicPeriod) {
  return events.filter(e => e.companyId === companyId && (!period || matchesAcademicPeriod(e.year, e.term, period)));
}
export function signedWithoutFriday(mous: MouCompany[], activities: FridayActivity[], complete: boolean) {
  if (!complete) return null;
  const hosted = new Set(activities.filter(a => a.status === 'completed').map(a => companyKey('friday', a.companyId)));
  return mous.filter(m => ['ลงนามแล้ว', 'ลงนามกับมหาวิทยาลัย', 'ลงนามแล้ว (บ.ในเครือ)'].includes(m.documentStatus) && !hosted.has(companyKey('mou', m.id)));
}
