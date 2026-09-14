import test from 'node:test';
import assert from 'node:assert/strict';
import { applicantSummary, applyOutcomeDraft, countOpenings, isInternshipOutcome, outcomeCount, outcomeStageSummary, outcomeStorageKey, outcomeValidator, selectOutcomes, toOutcomeDraft } from '../../../src/features/dashboard/lib/internship-outcomes';
import { enrichInternshipDemo, filterApplications, positionPopularity } from '../../../src/features/dashboard/lib/internship-history';
import { getInternshipDashboardData } from '../../../src/features/dashboard/lib/internship-data';
import type { InternshipApplication, InternshipCompany, InternshipOutcome } from '../../../src/features/dashboard/lib/types';

const company: InternshipCompany = { id: 'c', rowNumber: 1, name: 'Synthetic', shortName: 'Test', industry: 'test', mouStatus: 'ลงนามแล้ว', coordinator: null, note: null, raw: {}, positions: [{ id: 'o1', name: 'Engineer', declaredIntake: 7, accepted: 5 }, { id: 'o2', name: 'Engineer', declaredIntake: 2, accepted: 0 }] };
const outcome: InternshipOutcome = { id: 'result', studentRef: 'student-1', companyId: 'c', openingId: 'o1', studyYear: 1, round: '1', matched: true, accepted: false, started: null, note: '' };
const application: InternshipApplication = { id: 'app', applicantRef: 'student-1', studyYear: 1, round: '1', track: 'ฝึกงาน', department: '', choices: [{ rank: 1, companyId: 'c', position: 'Engineer', openingId: 'o1' }] };

test('unique applicants deduplicate across rounds and choices, never invent IDs for anonymous rows', () => {
  const applications = [application, { ...application, id: 'round2', round: '2' }, { ...application, id: 'anonymous', applicantRef: null }];
  assert.deepEqual(applicantSummary(applications, new Set(['c'])), { people: 1, applications: 3, unidentified: 1 });
  assert.equal(applicantSummary(filterApplications(applications, { studyYear: '1', round: '2' }), new Set(['c'])).applications, 1);
  assert.equal(applicantSummary(applications, new Set(['other'])).people, 0);
  const position = positionPopularity([company], applications)[0];
  assert.equal(position.people, 1); assert.equal(position.picks, 3); assert.equal(position.unidentified, 1);
});
test('opening count includes unfilled openings and distinguishes IDs even with identical titles', () => {
  assert.equal(countOpenings([company]), 2);
  assert.equal(countOpenings([company, company]), 2);
  assert.equal(countOpenings([company, { ...company, id: 'another' }]), 4);
  assert.equal(countOpenings([]), 0);
});
test('stages distinguish false, unknown, unique people and incomplete identities', () => {
  assert.equal(outcomeStageSummary([outcome], 'matched').people, 1);
  assert.equal(outcomeStageSummary([outcome], 'accepted').people, 0);
  assert.equal(outcomeStageSummary([outcome], 'started').people, null);
  assert.equal(outcomeCount(outcomeStageSummary([], 'started')), 'ยังไม่มีข้อมูล');
  assert.equal(outcomeStageSummary([outcome, { ...outcome, id: 'second', round: '2' }], 'matched').people, 1);
  const missing = outcomeStageSummary([outcome, { ...outcome, studentRef: null }, { ...outcome, matched: null }], 'matched');
  assert.deepEqual(missing, { people: 1, unknown: 1, unidentified: 1, records: 3 });
  assert.equal(outcomeCount(missing), '≥ 1');
});
test('outcome scope is based on actual company, cohort and round rather than ranked preference', () => {
  const elsewhere = { ...outcome, companyId: 'actual-company', started: true };
  assert.equal(selectOutcomes([elsewhere], { studyYear: 'all', round: 'all' }, new Set(['c'])).length, 0);
  assert.deepEqual(selectOutcomes([elsewhere], { studyYear: '1', round: '1' }, new Set(['actual-company'])), [elsewhere]);
  assert.equal(selectOutcomes([elsewhere], { studyYear: '1', round: '2' }, new Set(['actual-company'])).length, 0);
  assert.equal(selectOutcomes([{ ...elsewhere, studyYear: null }], { studyYear: 'unknown', round: 'all' }, new Set(['actual-company'])).length, 1);
});
test('edits preserve outcome identity and do not cascade, mutate applications or alter legacy intake', () => {
  const original = structuredClone({ company, application, outcome });
  const draft = { ...toOutcomeDraft(outcome), started: true, companyId: 'injected', studentRef: 'injected' };
  const next = applyOutcomeDraft(outcome, draft);
  assert.equal(next.companyId, 'c'); assert.equal(next.studentRef, 'student-1');
  assert.equal(next.started, true); assert.equal(next.accepted, false); assert.equal(next.matched, true);
  assert.deepEqual({ company, application, outcome }, original);
  assert.throws(() => applyOutcomeDraft(outcome, { ...draft, note: 'x'.repeat(20001) }));
});
test('storage validation rejects invalid identities, stage types and orphan openings', () => {
  const validate = outcomeValidator([company]);
  assert.equal(validate(outcome), true);
  for (const change of [{ started: 'true' }, { companyId: 'other' }, { openingId: 'other' }, { studyYear: 4 }, { studentRef: '' }]) assert.equal(validate({ ...outcome, ...change }), false);
  assert.equal(isInternshipOutcome({ ...outcome, studentRef: null, studyYear: null }), true);
  assert.notEqual(outcomeStorageKey('ฝึกงาน'), outcomeStorageKey('สหกิจศึกษา'));
});
test('demo outcomes exist only in supported periods and explicit applicant identities survive enrichment', async () => {
  const payload = await getInternshipDashboardData('ฝึกงาน');
  assert.ok(payload.outcomes && payload.outcomes.length >= 5);
  assert.ok(payload.outcomes.every(outcomeValidator(payload.companies)));
  const empty = await getInternshipDashboardData('ฝึกงาน', { year: 2500, term: 'summer' });
  assert.equal(empty.outcomes?.length, 0);
  const enriched = enrichInternshipDemo({ ...payload, companies: [company], applications: [application, { ...application, id: 'unknown', applicantRef: null }] }, 1);
  assert.equal(enriched.applications[0].applicantRef, 'student-1'); assert.equal(enriched.applications[1].applicantRef, null);
  assert.ok(applicantSummary(payload.applications, new Set(payload.companies.map(c => c.id))).people < payload.applications.length);
});
