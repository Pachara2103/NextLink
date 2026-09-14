import type { InternshipApplication, InternshipCompany, InternshipPayload, InternshipTrack } from './types';

export type InternshipScope = { studyYear: string; round: string };
export const allInternshipScope: InternshipScope = { studyYear: 'all', round: 'all' };
export const openingKey = (companyId: string, index: number) => `${companyId}:opening:${index + 1}`;

/** Explicit synthetic cohorts. This is not an importer or an inference about source students. */
export function enrichInternshipDemo(payload: InternshipPayload, maxRanks = 5): InternshipPayload {
  const companies = payload.companies.map(c => ({ ...c, positions: c.positions.map((p, i) => ({ ...p, id: openingKey(c.id, i) })) }));
  const expanded = payload.applications.map(a => {
    const choices = [...a.choices];
    const available = companies.flatMap(c => c.positions.map(p => ({ companyId: c.id, position: p.name, openingId: p.id })));
    for (const candidate of available) {
      if (choices.length >= maxRanks) break;
      if (!choices.some(c => c.companyId === candidate.companyId && c.position === candidate.position)) choices.push({ ...candidate, rank: choices.length + 1 });
    }
    return { ...a, choices };
  });
  const applications = expanded.map((a, i) => ({ ...a, applicantRef: a.id,
    studyYear: a.studyYear ?? (payload.track === 'สหกิจศึกษา' ? 3 : i % 3 + 1), round: a.round ?? String(Math.floor(i / 3) % 2 + 1),
    choices: a.choices.map(choice => ({ ...choice, openingId: companies.find(c => c.id === choice.companyId)?.positions.find(p => p.name === choice.position)?.id })),
  }));
  return { ...payload, companies, applications };
}
export function filterApplications(applications: InternshipApplication[], scope: InternshipScope) {
  return applications.filter(a => (scope.studyYear === 'all' || String(a.studyYear ?? 'unknown') === scope.studyYear) && (scope.round === 'all' || (a.round ?? 'unknown') === scope.round));
}
export function demoIntakeScopes(count: number, track: InternshipTrack, offset = 0) {
  const groups = track === 'สหกิจศึกษา' ? [3] : [1, 2, 3];
  const cells = groups.flatMap(studyYear => ['1', '2'].map(round => ({ studyYear, round, count: 0 })));
  for (let i = 0; i < count; i++) cells[(i + offset) % cells.length].count++;
  return cells;
}
export function scopeCompanies(companies: InternshipCompany[], scope: InternshipScope, track: InternshipTrack) {
  const total = (n: number, i: number) => demoIntakeScopes(n, track, i).filter(c => (scope.studyYear === 'all' || String(c.studyYear) === scope.studyYear) && (scope.round === 'all' || c.round === scope.round)).reduce((sum, c) => sum + c.count, 0);
  return companies.map(c => ({ ...c, positions: c.positions.map((p, i) => ({ ...p, id: p.id ?? openingKey(c.id, i), declaredIntake: total(p.declaredIntake, i), accepted: total(p.accepted, i) })) }));
}
export function positionPopularity(companies: InternshipCompany[], applications: InternshipApplication[]) {
  const rows = companies.flatMap(c => c.positions.map((p, i) => ({ id: p.id ?? openingKey(c.id, i), companyId: c.id, company: c.shortName, title: p.name, picks: 0, first: 0, people: new Set<string>() })));
  for (const a of applications) for (const choice of a.choices) {
    const candidates = rows.filter(p => p.companyId === choice.companyId && (choice.openingId ? p.id === choice.openingId : p.title === choice.position));
    if (candidates.length !== 1) continue; // Ambiguous titles must be mapped, never merged by guessing.
    const row = candidates[0]; row.picks++; if (choice.rank === 1) row.first++; row.people.add(a.applicantRef ?? a.id);
  }
  return rows.map(({ people, ...r }) => ({ ...r, people: people.size })).sort((a, b) => b.picks - a.picks || b.first - a.first || a.id.localeCompare(b.id));
}

export type InternshipEvaluation = { id: string; companyId: string; academicYear: number; term: string; track: InternshipTrack; studyYear: number; round: string; score: number | null; scale: number; comment: string };
export function demoInternshipEvaluations(companies: InternshipCompany[], academicYear: number, term: string, track: InternshipTrack): InternshipEvaluation[] {
  return companies.flatMap((company, index) => [0, 1, 2].map(i => ({ id: `${company.id}:${academicYear}:${term}:${track}:${i}`, companyId: company.id, academicYear, term, track,
    studyYear: track === 'สหกิจศึกษา' ? 3 : i + 1, round: String(i % 2 + 1), score: index % 5 === 4 ? null : 3 + (index + i) % 3, scale: 5,
    comment: i === 0 ? 'ได้รับโจทย์และคำแนะนำจากพี่เลี้ยงอย่างต่อเนื่อง (ความคิดเห็นจำลอง)' : 'อยากมีช่วงสรุปสิ่งที่เรียนรู้ร่วมกับทีมมากขึ้น (ความคิดเห็นจำลอง)',
  })));
}
export function evaluationSummary(rows: InternshipEvaluation[]) {
  const valid = rows.filter(r => r.score !== null && Number.isFinite(r.score) && r.scale > 0 && r.score! >= 0 && r.score! <= r.scale);
  return { responses: rows.length, scored: valid.length, mean: valid.length ? valid.reduce((sum, r) => sum + r.score! / r.scale * 5, 0) / valid.length : null };
}
