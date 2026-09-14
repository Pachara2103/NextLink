import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStats, applicationRanks } from '../../../src/features/dashboard/lib/internship-stats';
import { demoIntakeScopes, enrichInternshipDemo, scopeCompanies, positionPopularity, filterApplications, evaluationSummary } from '../../../src/features/dashboard/lib/internship-history';
import { getInternshipDashboardData } from '../../../src/features/dashboard/lib/internship-data';
import type { InternshipCompany, InternshipApplication } from '../../../src/features/dashboard/lib/types';
const company: InternshipCompany = { id: 'c', rowNumber: 1, name: 'Synthetic', shortName: 'Test', industry: 'test', mouStatus: 'ลงนามแล้ว', coordinator: null, note: null, raw: {}, positions: [{ id: 'o1', name: 'Engineer', declaredIntake: 7, accepted: 5 }, { id: 'o2', name: 'Engineer', declaredIntake: 2, accepted: 1 }] };
test('historical ranks 1-10 all contribute to demand; first choices remain separate', () => {
  const a: InternshipApplication = { id: 'a', track: 'ฝึกงาน', department: '', choices: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, companyId: 'c', position: 'Engineer' })) };
  const result = buildStats([company], [a])[0];
  assert.equal(result.totalPicks, 10); assert.equal(result.firstPicks, 1); assert.equal(applicationRanks([a]).at(-1), 10);
});
test('identical position titles stay separate by opening ID and ambiguous rows are not guessed', () => {
  const a: InternshipApplication = { id: 'a', track: 'ฝึกงาน', department: '', choices: [{ rank: 1, companyId: 'c', position: 'Engineer', openingId: 'o2' }, { rank: 2, companyId: 'c', position: 'Engineer' }] };
  const rows = positionPopularity([company], [a]); assert.equal(rows.find(r => r.id === 'o1')!.picks, 0); assert.equal(rows.find(r => r.id === 'o2')!.picks, 1);
});
test('synthetic scope partitions preserve all intake totals without counting a seat twice', () => {
  const rows = [1, 2, 3].flatMap(y => ['1', '2'].map(round => scopeCompanies([company], { studyYear: String(y), round }, 'ฝึกงาน')[0]));
  assert.equal(rows.reduce((n, c) => n + c.positions.reduce((s, p) => s + p.declaredIntake, 0), 0), 9);
  assert.equal(rows.reduce((n, c) => n + c.positions.reduce((s, p) => s + p.accepted, 0), 0), 6);
});
test('historical demo contains ten ranks and scope filters do not manufacture unknown cohorts', async () => {
  const p = await getInternshipDashboardData('ฝึกงาน', { year: 2566, term: 'summer' });
  assert.equal(applicationRanks(p.applications).at(-1), 10);
  const subset = filterApplications(p.applications, { studyYear: '1', round: '1' }); assert.ok(subset.length); assert.ok(subset.every(a => a.studyYear === 1 && a.round === '1'));
  assert.equal(filterApplications(p.applications, { studyYear: 'unknown', round: 'all' }).length, 0);
});
test('empty evaluations never become zero and scores use their own scale', () => {
  assert.equal(evaluationSummary([]).mean, null);
  assert.equal(evaluationSummary([{ id: 'e', companyId: 'c', academicYear: 2569, term: '1', track: 'ฝึกงาน', studyYear: 1, round: '1', score: 8, scale: 10, comment: '' }]).mean, 4);
});

test('large intake values partition in a fixed number of buckets and retain totals', () => {
  const buckets = demoIntakeScopes(1000000000, 'ฝึกงาน', 1);
  assert.equal(buckets.length, 6); assert.equal(buckets.reduce((n, b) => n + b.count, 0), 1000000000);
  assert.deepEqual(demoIntakeScopes(2, 'ฝึกงาน', 1).map(b => b.count), [0, 1, 1, 0, 0, 0]);
});
test('demo enrichment preserves explicit opening identities when titles are identical', async () => {
  const payload = await getInternshipDashboardData('ฝึกงาน');
  const enriched = enrichInternshipDemo({ ...payload, companies: [company], applications: [{ id: 'a', department: '', track: 'ฝึกงาน', choices: [{ rank: 1, companyId: 'c', position: 'Engineer', openingId: 'o2' }] }] }, 1);
  assert.equal(enriched.companies[0].positions[1].id, 'o2');
  assert.equal(enriched.applications[0].choices[0].openingId, 'o2');
});
