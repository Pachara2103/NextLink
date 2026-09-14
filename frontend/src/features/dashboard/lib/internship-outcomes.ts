import type { InternshipApplication, InternshipCompany, InternshipOutcome, InternshipTrack } from './types';
import type { InternshipScope } from './internship-history';
import { openingKey } from './internship-history';
import { isRecord } from './local-dataset';

export const OUTCOME_STAGES = [
  { key: 'matched', label: 'จับคู่แล้ว' }, { key: 'accepted', label: 'นิสิตตอบรับแล้ว' }, { key: 'started', label: 'เข้าฝึกจริงแล้ว' },
] as const;
export const outcomeStorageKey = (track: InternshipTrack) => `nextlink.${track === 'ฝึกงาน' ? 'internship' : 'cooperative'}.outcomes.v1`;
export function isInternshipOutcome(value: unknown): value is InternshipOutcome {
  const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 500;
  return isRecord(value) && ['id', 'companyId', 'openingId', 'round'].every(k => text(value[k]))
    && (value.studentRef === null || text(value.studentRef))
    && (value.studyYear === null || [1, 2, 3].includes(value.studyYear as number))
    && OUTCOME_STAGES.every(({ key }) => value[key] === null || typeof value[key] === 'boolean')
    && typeof value.note === 'string' && value.note.length <= 20000;
}
export const outcomeValidator = (companies: InternshipCompany[]) => (value: unknown): value is InternshipOutcome => isInternshipOutcome(value)
  && companies.some(c => c.id === value.companyId && c.positions.some((p, i) => (p.id ?? openingKey(c.id, i)) === value.openingId));
export type OutcomeDraft = Pick<InternshipOutcome, 'matched' | 'accepted' | 'started' | 'note'>;
export const toOutcomeDraft = ({ matched, accepted, started, note }: InternshipOutcome): OutcomeDraft => ({ matched, accepted, started, note });
export function applyOutcomeDraft(row: InternshipOutcome, draft: OutcomeDraft): InternshipOutcome {
  const next = { ...row, ...toOutcomeDraft(draft as InternshipOutcome) };
  if (!isInternshipOutcome(next)) throw new Error('ตรวจสถานะและหมายเหตุให้ถูกต้อง');
  // Preserve independent evidence: changing one stage never manufactures another stage.
  return next;
}
export function selectOutcomes(rows: InternshipOutcome[], scope: InternshipScope, companyIds: Set<string>) {
  return rows.filter(r => companyIds.has(r.companyId) && (scope.studyYear === 'all' || String(r.studyYear ?? 'unknown') === scope.studyYear) && (scope.round === 'all' || r.round === scope.round));
}
export function applicantSummary(applications: InternshipApplication[], companyIds: Set<string>) {
  const rows = applications.filter(a => a.choices.some(c => companyIds.has(c.companyId)));
  const known = new Set(rows.flatMap(a => a.applicantRef ? [a.applicantRef] : []));
  return { people: known.size, applications: rows.length, unidentified: rows.filter(a => !a.applicantRef).length };
}
export function countOpenings(companies: InternshipCompany[]) {
  return new Set(companies.flatMap(c => c.positions.map((p, i) => JSON.stringify([c.id, p.id ?? openingKey(c.id, i)])))).size;
}
export function outcomeStageSummary(rows: InternshipOutcome[], stage: typeof OUTCOME_STAGES[number]['key']) {
  const known = new Set(rows.flatMap(r => r[stage] === true && r.studentRef ? [r.studentRef] : []));
  const unidentified = rows.filter(r => r[stage] === true && !r.studentRef).length;
  const unknown = rows.filter(r => r[stage] === null).length;
  const observed = rows.some(r => r[stage] !== null);
  return { people: observed ? known.size : null, unknown, unidentified, records: rows.length };
}
export function outcomeCount(summary: ReturnType<typeof outcomeStageSummary>) {
  if (summary.people === null) return 'ยังไม่มีข้อมูล';
  return `${summary.unknown || summary.unidentified ? '≥ ' : ''}${summary.people.toLocaleString('th-TH')}`;
}
