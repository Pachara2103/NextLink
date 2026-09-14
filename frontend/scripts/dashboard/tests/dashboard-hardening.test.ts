import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mockDashboardData } from "../../../src/features/dashboard/lib/mock-data";
import type { InternshipCompany, MouCompany } from "../../../src/features/dashboard/lib/types";
import { isDashboardCourse, isInternshipCompany, isMouCompany } from "../../../src/features/dashboard/lib/dataset-validation";
import { restoreDataset, storedDataset } from "../../../src/features/dashboard/lib/local-dataset";
import { allowedValue, QUEUE_VALUES } from "../../../src/features/dashboard/lib/filter-values";
import { assessCourse, electiveSeats, isFollowUp, nextAction } from "../../../src/features/dashboard/lib/elective-stats";
import { buildStats, queueKind, toCount } from "../../../src/features/dashboard/lib/internship-stats";
import { processStatus } from "../../../src/features/dashboard/lib/mou-stats";

const internship: InternshipCompany[] = JSON.parse(readFileSync("src/features/dashboard/data/internship-companies.json", "utf8")).companies;
const mou: MouCompany[] = JSON.parse(readFileSync("src/features/dashboard/data/mou-companies.json", "utf8")).companies;
const courses = mockDashboardData.courses;
const at = "2026-09-07T14:00:00.000Z";

test("all bundled legacy-page rows satisfy their runtime schemas", () => {
  assert.ok(courses.every(isDashboardCourse));
  assert.ok(internship.every(isInternshipCompany));
  assert.ok(mou.every(isMouCompany));
});
test("bad nested data and invalid dates cannot replace bundled rows", () => {
  for (const items of [[{ id: internship[0].id, positions: null }], [{ ...internship[0], coordinator: {} }]]) {
    assert.throws(() => restoreDataset({ items, editedAt: at }, internship, isInternshipCompany));
  }
  assert.equal(isDashboardCourse({ ...courses[0], workflow: null }), false);
  assert.equal(isDashboardCourse({ ...courses[0], status: { course: "เปิดแล้ว" } }), false);
  assert.equal(isMouCompany({ ...mou[0], shortNames: null }), false);
  assert.throws(() => restoreDataset({ items: [internship[0]], editedAt: "bad" }, internship, isInternshipCompany));
});
test("invalid enums, counts and executable links are rejected", () => {
  assert.equal(isDashboardCourse({ ...courses[0], workflow: [{ ...courses[0].workflow[0], status: "invalid" }] }), false);
  for (const accepted of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(isInternshipCompany({ ...internship[0], positions: [{ ...internship[0].positions[0], accepted }] }), false);
  }
  assert.equal(isMouCompany({ ...mou[0], reviewStatus: "done-ish" }), false);
  assert.equal(isDashboardCourse({ ...courses[0], documents: [{ type: "SYLLABUS", filename: "doc", status: "APPROVED", externalUrl: "javascript:alert(1)" }] }), false);
});
test("legacy partial rows retain valid edits and new fields without mutating fixtures", () => {
  const old = { id: mou[0].id, note: "saved note" };
  const restored = restoreDataset([old], mou, isMouCompany);
  assert.equal(restored.items[0].note, "saved note");
  assert.equal(restored.items[0].reviewStatus, mou[0].reviewStatus);
  assert.equal(restored.hasOverrides, true);
  assert.notEqual(mou[0].note, "saved note");
});
test("storage rejects unknown versions and duplicate IDs; empty overrides are valid", () => {
  assert.throws(() => restoreDataset({ schemaVersion: 99, items: [], editedAt: at }, mou, isMouCompany));
  assert.throws(() => restoreDataset({ items: [mou[0], mou[0]], editedAt: at }, mou, isMouCompany));
  assert.deepEqual(restoreDataset({ items: [], editedAt: at }, mou, isMouCompany).items, mou);
  const changed = mou.map((c, i) => i === 1 ? { ...c, note: "edit" } : c);
  const saved = storedDataset(changed, mou, at);
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.items.length, 1);
  assert.deepEqual(restoreDataset(saved, mou, isMouCompany).items, changed);
});
test("unknown filter enum values fall back without becoming unsafe object keys", () => {
  for (const value of [undefined, "obsolete", "__proto__", "constructor", "all"]) assert.equal(allowedValue(value, QUEUE_VALUES), undefined);
  assert.equal(allowedValue("WAITING", QUEUE_VALUES), "WAITING");
});
test("headcounts preserve exponent values and reject invalid integers", () => {
  for (const [input, expected] of [["", 0], [" ", 0], ["0", 0], ["24", 24], ["1e2", 100]] as const) assert.equal(toCount(input), expected);
  for (const input of ["-1", "1.5", "NaN", "Infinity", "1e30", "100x"]) assert.throws(() => toCount(input));
});
test("pending MOU review text does not count as completed", () => {
  const pending = mou.find(c => c.legalReviewResult === "รอผลตรวจจากบริษัท")!;
  assert.equal(processStatus(pending).find(s => s.label === "ตรวจแก้")?.done, false);
  for (const reviewStatus of ["approved", "not_required"] as const) {
    assert.equal(processStatus({ ...pending, reviewStatus, legalReviewResult: null }).find(s => s.label === "ตรวจแก้")?.done, true);
  }
});
test("a surplus in one position cannot hide another unfilled position", () => {
  const company = { ...internship[0], mouStatus: "ลงนามแล้ว", positions: [
    { name: "A", declaredIntake: 2, accepted: 4 }, { name: "B", declaredIntake: 2, accepted: 0 },
  ] };
  const [stats] = buildStats([company], []);
  assert.equal(stats.accepted, stats.declared);
  assert.equal(stats.shortfall, 2); assert.equal(stats.surplus, 2);
  assert.equal(stats.intake, "mixed"); assert.equal(queueKind(stats), "BLOCKED");
  company.positions[1].accepted = 1;
  assert.equal(queueKind(buildStats([company], [])[0]), "WAITING");
});
test("demand remains scoped to supplied applications while totals keep rank identity", () => {
  const [stats] = buildStats([internship[0]], [{ id: "test", track: "ฝึกงาน", department: "CP", choices: [{ companyId: internship[0].id, position: "A", rank: 2 }] }]);
  assert.equal(stats.totalPicks, 1); assert.equal(stats.firstPicks, 0); assert.equal(stats.picksByRank[2], 1);
});
test("remaining seats sum per-course vacancies and report overbooking separately", () => {
  assert.deepEqual(electiveSeats([{ capacity: 10, enrolled: 15 }, { capacity: 20, enrolled: 10 }]), { remaining: 10, overbooked: 5 });
  assert.deepEqual(electiveSeats([]), { remaining: 0, overbooked: 0 });
});
test("course status and next action agree even when workflow is already complete", () => {
  const course = structuredClone(courses[0]);
  course.workflow = course.workflow.map(task => ({ ...task, status: "DONE" }));
  course.status = { course: "เปิดแล้ว", documents: "รอเอกสารผู้สอน", invitation: "ลงนามแล้ว", mcv: "เปิดแล้ว" };
  assert.equal(assessCourse(course).key, "WAITING");
  assert.equal(isFollowUp(course), true); assert.equal(nextAction(course), "รอเอกสารผู้สอน");
  course.status.documents = "เอกสารครบ";
  assert.equal(assessCourse(course).key, "READY");
  assert.equal(isFollowUp(course), false); assert.equal(nextAction(course), "ทุกขั้นตอนเสร็จแล้ว");
  course.workflow[0].status = "BLOCKED";
  assert.equal(assessCourse(course).key, "BLOCKED"); assert.match(nextAction(course), /ติดปัญหา/);
});
