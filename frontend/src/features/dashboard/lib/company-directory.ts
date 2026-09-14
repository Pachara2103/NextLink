import mou from '../data/mou-companies.json';
import internship from '../data/internship-companies.json';
import elective from '../data/elective-courses.json';
import capstone from '../data/capstone-projects.json';
import { fridayActivities } from '../data/friday-activities';

export type BusinessModule = 'mou' | 'elective' | 'internship' | 'cooperative' | 'capstone' | 'friday';
export const moduleLabels: Record<BusinessModule, string> = { mou: 'MOU', elective: 'วิชาเลือก', internship: 'ฝึกงาน', cooperative: 'สหกิจ', capstone: 'Capstone', friday: 'Friday Activity' };
export type CompanyContact = { id: string; name: string; role: string; phone: string; email: string; lineId: string; modules: (BusinessModule | 'general')[]; status: 'active' | 'resigned' | 'transferred' | 'inactive' };
export type CompanyCase = { id: string; title: string; detail: string; module: BusinessModule; academicYear: number; term: string; occurredOn: string; recordedAt: string; author: string; status: 'open' | 'closed' };
export type DirectoryCompany = { id: string; name: string; aliases: string[]; contacts: CompanyContact[]; cases: CompanyCase[] };

// Explicit links between synthetic fixtures only. Never infer real company identity from similar names.
const demoLinks: Record<string, string> = {
  'mou:mou-mock-01': 'partner-cloud', 'capstone:co1': 'partner-cloud', 'internship:internship-company-mock-cloud': 'partner-cloud', 'cooperative:internship-company-mock-cloud': 'partner-cloud', 'friday:demo-company-cloud': 'partner-cloud',
  'mou:mou-mock-02': 'partner-data', 'capstone:co2': 'partner-data', 'internship:internship-company-mock-dataforge': 'partner-data', 'cooperative:internship-company-mock-dataforge': 'partner-data', 'friday:demo-company-data': 'partner-data',
  'mou:mou-mock-03': 'partner-security', 'capstone:co3': 'partner-security', 'internship:internship-company-mock-cyberflow': 'partner-security', 'cooperative:internship-company-mock-cyberflow': 'partner-security', 'friday:demo-company-security': 'partner-security',
};
export const companyKey = (module: BusinessModule, sourceId: string) => demoLinks[`${module}:${sourceId}`] ?? `${module === 'cooperative' ? 'internship' : module}:${sourceId}`;
const sources = [
  ...mou.companies.map(c => ({ id: companyKey('mou', c.id), name: c.companyThai, alias: c.companyEnglish })),
  ...internship.companies.map(c => ({ id: companyKey('internship', c.id), name: c.name, alias: c.shortName })),
  ...capstone.companies.map(c => ({ id: companyKey('capstone', c.id), name: c.name, alias: c.englishName })),
  ...elective.courses.map(c => ({ id: companyKey('elective', c.provider), name: c.provider, alias: c.provider })),
  ...fridayActivities.map(c => ({ id: companyKey('friday', c.companyId), name: c.companyName, alias: c.companyName })),
];
const registry = new Map<string, { id: string; name: string; aliases: string[] }>();
for (const row of sources) {
  const previous = registry.get(row.id);
  registry.set(row.id, { id: row.id, name: previous?.name ?? row.name, aliases: [...new Set([...(previous?.aliases ?? []), row.name, row.alias])] });
}
export const directorySeed: DirectoryCompany[] = [...registry.values()].map((c, i) => ({ ...c,
  contacts: [
    { id: `${c.id}:contact:1`, name: `ผู้ประสานงานตัวอย่าง ${i + 1}-01`, role: 'ผู้ประสานงานหลัก / HR', phone: '02-000-0000', email: `coordinator${i + 1}@example.invalid`, lineId: `demo_contact_${i + 1}`, modules: ['mou', 'friday', 'general'], status: 'active' },
    { id: `${c.id}:contact:2`, name: `ผู้ประสานงานตัวอย่าง ${i + 1}-02`, role: 'Senior Tech', phone: '', email: `technical${i + 1}@example.invalid`, lineId: '', modules: ['elective', 'internship', 'cooperative', 'capstone'], status: 'active' },
  ],
  cases: i < 3 ? [
    { id: `${c.id}:case:old`, title: 'ปรับขั้นตอนแจ้งข้อมูลผู้ดูแล (ตัวอย่าง)', detail: 'เจ้าหน้าที่และบริษัทตกลงช่องทางประสานงานแล้ว', module: 'internship', academicYear: 2568, term: '2', occurredOn: '2026-02-12', recordedAt: '2026-02-15T08:00:00Z', author: 'เจ้าหน้าที่ตัวอย่าง', status: 'closed' },
    { id: `${c.id}:case:new`, title: 'ติดตามกำหนดโอนเบี้ยเลี้ยง (ตัวอย่าง)', detail: 'รอผู้ประสานงานยืนยันวันที่ เป็นเหตุการณ์สมมติสำหรับทดลองติดตามงาน', module: 'internship', academicYear: 2569, term: '1', occurredOn: '2026-08-12', recordedAt: '2026-09-01T08:00:00Z', author: 'เจ้าหน้าที่ตัวอย่าง', status: 'open' },
  ] : [],
}));
export const directoryStorageKey = 'company-directory.v1';
export const latestCase = (cases: CompanyCase[]) => [...cases].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.recordedAt.localeCompare(a.recordedAt))[0] ?? null;
const text = (x: unknown): x is string => typeof x === 'string' && x.length <= 20000;
const date = (x: unknown): x is string => text(x) && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
export function isDirectoryCompany(x: unknown): x is DirectoryCompany {
  if (!object(x) || !text(x.id) || !x.id || !text(x.name) || !x.name.trim() || !Array.isArray(x.aliases) || !x.aliases.every(text) || !Array.isArray(x.contacts) || !Array.isArray(x.cases) || x.contacts.length > 100 || x.cases.length > 2000) return false;
  if (!x.contacts.every(c => object(c) && ['id', 'name', 'role', 'phone', 'email', 'lineId'].every(k => text(c[k])) && String(c.name).trim() && ['active', 'resigned', 'transferred', 'inactive'].includes(String(c.status)) && Array.isArray(c.modules) && c.modules.every(m => m === 'general' || Object.hasOwn(moduleLabels, m)))) return false;
  if (!x.cases.every(c => object(c) && ['id', 'title', 'detail', 'author', 'recordedAt'].every(k => text(c[k])) && String(c.title).trim() && Number.isFinite(Date.parse(String(c.recordedAt))) && date(c.occurredOn) && Number.isInteger(c.academicYear) && Number(c.academicYear) >= 2400 && Number(c.academicYear) <= 3000 && ['1', '2', 'summer'].includes(String(c.term)) && Object.hasOwn(moduleLabels, String(c.module)) && ['open', 'closed'].includes(String(c.status)))) return false;
  return [x.contacts, x.cases].every(rows => rows.every(r => r.id) && new Set(rows.map(r => r.id)).size === rows.length);
}
