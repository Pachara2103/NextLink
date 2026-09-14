import assert from "node:assert/strict";
import test from "node:test";
import { fridayActivities } from "../../../src/features/dashboard/data/friday-activities";
import { applyFridayDraft, fridayCompanySummary, fridayFollowUps, fridaySummary, isFridayActivity, selectFridayPeriod, studentRatingSummary, toFridayDraft, type FridayActivity } from "../../../src/features/dashboard/lib/friday-activity";

const base = fridayActivities[0];
test("Friday fixtures are valid, have unique session IDs and never substitute another term", () => {
  assert.ok(fridayActivities.every(isFridayActivity));
  assert.equal(new Set(fridayActivities.map(item => item.id)).size, fridayActivities.length);
  assert.equal(selectFridayPeriod(fridayActivities, { year: 2569, term: "1" }).length, 7);
  assert.equal(selectFridayPeriod(fridayActivities, { year: 2566, term: "1" }).length, 1);
  assert.deepEqual(selectFridayPeriod(fridayActivities, { year: 2569, term: "summer" }), []);
});

test("attendance and unique companies count only completed sessions; repeated titles remain sessions", () => {
  const items: FridayActivity[] = [
    { ...base, id: "a", attended: 43, capacity: 40, booked: 44 },
    { ...base, id: "b", attended: null },
    { ...base, id: "c", status: "scheduled", companyId: "another", attended: 900 },
    { ...base, id: "d", status: "cancelled", companyId: "cancelled", attended: 800 },
  ];
  const result = fridaySummary(items);
  assert.equal(result.total, 4);
  assert.equal(result.completed, 2);
  assert.equal(result.companies, 1);
  assert.equal(result.attended, 43);
  assert.equal(result.unknownAttendance, 1);
  assert.equal(fridayCompanySummary(items).find(item => item.id === base.companyId)?.completed, 2);
  assert.equal(isFridayActivity(items[0]), true, "attendance above capacity must be preserved");
});

test("unknown attendance differs from an explicit zero and empty scope", () => {
  assert.equal(fridaySummary([{ ...base, attended: null }]).attended, null);
  assert.equal(fridaySummary([{ ...base, attended: 0 }]).attended, 0);
  assert.equal(fridaySummary([]).attended, null);
});

test("student means weight each answered question, excluding nulls, source score and cancelled sessions", () => {
  const response = (id: string, value: number | null) => ({ id, ratings: { content: value, speaker: value, application: value, overall: value }, suggestedTopic: "", suggestion: "" });
  const items = [
    { ...base, reportedScore: 1, studentEvaluations: [response("a", 1)] },
    { ...base, id: "b", studentEvaluations: [response("b1", 5), response("b2", 5), response("b3", 5), response("blank", null)] },
    { ...base, id: "cancelled", status: "cancelled" as const, studentEvaluations: [response("c", 1)] },
  ];
  for (const dimension of studentRatingSummary(items)) { assert.equal(dimension.mean, 4); assert.equal(dimension.count, 4); }
  assert.equal(fridaySummary(items).studentResponses, 5);
  assert.equal(studentRatingSummary([{ ...base, studentEvaluations: [] }])[0].mean, null);
});

test("follow-ups distinguish scheduling gaps, missing evaluations and cancelled sessions", () => {
  assert.equal(fridayFollowUps({ ...base, attended: 0 }).length, 0);
  assert.deepEqual(fridayFollowUps({ ...base, attended: null, studentEvaluations: [], companyEvaluations: [] }), ["บันทึกจำนวนมาจริง", "ติดตามผลประเมินนิสิต", "ติดตามผลประเมินบริษัท"]);
  assert.deepEqual(fridayFollowUps({ ...base, status: "scheduled", date: null }), ["ยืนยันวัน เวลา และสถานที่"]);
  assert.deepEqual(fridayFollowUps({ ...base, status: "cancelled", attended: null, studentEvaluations: [] }), []);
});

test("malformed saved records, invalid dates/counts, unknown enums and unsafe URLs are rejected", () => {
  const invalid = [
    { capacity: -1 }, { booked: 1.5 }, { attended: Number.NaN }, { reportedScore: 7 },
    { date: "2026-02-30" }, { startTime: "16:00", endTime: "13:00" }, { startTime: "25:00" },
    { status: "__proto__" }, { term: "3" }, { companyId: "" },
    { publicationUrl: "javascript:alert(1)" }, { publicationUrl: "//example.com" },
    { publicationUrl: "https://user:secret@example.com" },
    { studentEvaluations: [base.studentEvaluations[0], base.studentEvaluations[0]] },
    { studentEvaluations: [{ ...base.studentEvaluations[0], ratings: { content: 0, speaker: 1, application: 1, overall: 1 } }] },
  ];
  invalid.forEach(patch => assert.equal(isFridayActivity({ ...base, ...patch }), false, JSON.stringify(patch)));
  assert.ok(isFridayActivity({ ...base, publicationUrl: "https://example.com/activity" }));
});

test("editing operational fields preserves company/period and both sources of evaluation", () => {
  const maliciousDraft = { ...toFridayDraft(base), title: "  Updated activity  ", attended: 0, companyId: "replace", academicYear: 2500, reportedScore: 1, studentEvaluations: [], companyEvaluations: [] };
  const saved = applyFridayDraft(base, maliciousDraft);
  assert.equal(saved.title, "Updated activity");
  assert.equal(saved.attended, 0);
  assert.equal(saved.companyId, base.companyId);
  assert.equal(saved.academicYear, base.academicYear);
  assert.equal(saved.reportedScore, base.reportedScore);
  assert.deepEqual(saved.studentEvaluations, base.studentEvaluations);
  assert.deepEqual(saved.companyEvaluations, base.companyEvaluations);
  assert.throws(() => applyFridayDraft(base, { ...toFridayDraft(base), title: "  " }));
});
