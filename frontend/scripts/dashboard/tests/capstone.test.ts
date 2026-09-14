import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CapstoneDataset } from "../../../src/features/dashboard/lib/capstone-types";
import { isCapstoneDataset } from "../../../src/features/dashboard/lib/capstone-validation";
import { EMPTY_FILTERS, applicationCount, capstoneStats, confirmedCount, filterTopics, followUp, interestCount, remainingCount } from "../../../src/features/dashboard/lib/capstone-stats";
import { moveRank, rankingRows, validateRanking } from "../../../src/features/dashboard/lib/capstone-ranking";
import { applyCapstoneDraft, toCapstoneDraft } from "../../../src/features/dashboard/lib/capstone-edit";
const fixture = (): CapstoneDataset => JSON.parse(readFileSync("src/features/dashboard/data/capstone-projects.json", "utf8"));
const at = "2026-09-07T15:00:00.000Z";

test("bundled fixture has valid links, references, ranking pools and nested fields", () => {
  assert.equal(isCapstoneDataset(fixture()), true);
});
test("interest counts people once per topic and across topics/rounds, never sums bars", () => {
  const data = fixture();
  const a = data.topics[0];
  const b = data.topics[1];
  a.selections = [{ studentId: "S001", round: "1" }, { studentId: "S001", round: "1" }, { studentId: "S001", round: "2" }, { studentId: "S002", round: "2" }];
  b.selections = [{ studentId: "S001", round: "1" }, { studentId: "S003", round: "1" }];
  assert.equal(interestCount(a, "1"), 1);
  assert.equal(interestCount(a), 2);
  assert.equal(capstoneStats([a, b]).students, 3);
  assert.equal(capstoneStats([a, b], "1").students, 2);
  assert.equal(applicationCount(a), 3);
});
test("unknown interest and capacity remain distinct from zero", () => {
  const topic = fixture().topics[0];
  topic.interestKnown = false; topic.capacity = null;
  assert.equal(interestCount(topic), null);
  assert.equal(remainingCount(topic), null);
  assert.equal(capstoneStats([topic]).unknownCapacity, 1);
  assert.equal(capstoneStats([topic]).unknownInterest, 1);
  topic.applicationsKnown = false;
  assert.equal(applicationCount(topic), null);
});
test("capacity is not multiplied by rounds and overbooked teams stay visible", () => {
  const data = fixture();
  const topic = data.topics[1];
  assert.equal(confirmedCount(topic), 2);
  assert.equal(remainingCount(topic), 0);
  assert.equal(followUp(topic)?.kind, "BLOCKED");
  assert.equal(capstoneStats([topic]).pending, 1);
  const source = data.topics[0];
  const before = capstoneStats([source]).remaining;
  source.rounds.push("4");
  assert.equal(capstoneStats([source]).remaining, before);
});
test("company ranks application groups only within one project and round", () => {
  const data = fixture();
  const topic = data.topics[0];
  const order = topic.rankings[0].applicationIds;
  assert.equal(validateRanking(topic, "1", order), true);
  assert.equal(validateRanking(topic, "1", [...order, order[0]]), false);
  assert.equal(validateRanking(topic, "2", order), false);
  assert.equal(validateRanking(topic, "1", [data.topics[1].applications[0].id]), false);
  assert.equal(validateRanking(topic, "1", ["S001"]), false);
  const withdrawn = data.topics[2].applications.find(a => a.status === "withdrawn")!;
  assert.equal(validateRanking(data.topics[2], withdrawn.round, [withdrawn.id]), false);
});
test("reordering is immutable, bounded and leaves unranked applicants present", () => {
  const topic = fixture().topics[1];
  const ranking = topic.rankings[0];
  const original = [...ranking.applicationIds];
  const moved = moveRank(original, original[1], -1);
  assert.deepEqual(moved, [original[1], original[0]]);
  assert.deepEqual(ranking.applicationIds, original);
  assert.deepEqual(moveRank(original, original[0], -1), original);
  assert.equal(rankingRows(topic, ranking.round).filter(r => r.rank === null).length, 2);
  ranking.applicationIds = [];
  assert.equal(rankingRows(topic, ranking.round).length, 4);
  assert.ok(rankingRows(topic, ranking.round).every(r => r.rank === null));
});
test("saving a rank never changes assignments, applications or other project rankings", () => {
  const data = fixture();
  const snapshot = structuredClone(data);
  const draft = toCapstoneDraft(data.topics[0], data);
  draft.topic.rankings[0].applicationIds.reverse();
  const next = applyCapstoneDraft(data, draft, at);
  assert.deepEqual(next.topics[0].assignments, snapshot.topics[0].assignments);
  assert.deepEqual(next.topics[0].applications, snapshot.topics[0].applications);
  assert.deepEqual(next.topics.slice(1), snapshot.topics.slice(1));
  assert.deepEqual(data, snapshot);
});
test("shared company-professor changes apply to every topic without changing advisors", () => {
  const data = fixture();
  const draft = toCapstoneDraft(data.topics[0], data);
  draft.relationships = [{ id: "new-rel", companyId: "co1", professorId: "p6", role: "ผู้ร่วมวิจัย", source: "Demo" }];
  const next = applyCapstoneDraft(data, draft, at);
  const matches = filterTopics(next, { ...EMPTY_FILTERS, company: "co1", professor: "p6" });
  assert.equal(matches.length, data.topics.filter(t => t.companyId === "co1").length);
  assert.deepEqual(next.topics.map(t => t.assignments), data.topics.map(t => t.assignments));
  assert.equal(isCapstoneDataset(next), true);
});
test("scope and advisor changes require a reason and record before/after values", () => {
  const data = fixture();
  const draft = toCapstoneDraft(data.topics[0], data);
  draft.topic.scope = "ขอบเขตใหม่";
  assert.throws(() => applyCapstoneDraft(data, draft, at), /reason/);
  draft.reason = "บริษัทปรับขอบเขตต้นแบบ";
  const next = applyCapstoneDraft(data, draft, at);
  const change = next.topics[0].history.at(-1)!;
  assert.equal(change.before, data.topics[0].scope);
  assert.equal(change.after, draft.topic.scope);
  assert.equal(change.reason, draft.reason);
});
test("filters combine and use relationship identities, not advisor inference", () => {
  const data = fixture();
  const filter = { ...EMPTY_FILTERS, year: "2569", round: "1", company: "co1", professor: "p2", query: "CAP-001" };
  assert.deepEqual(filterTopics(data, filter).map(t => t.id), ["CAP-001"]);
  assert.equal(filterTopics(data, { ...filter, professor: "p6" }).length, 0);
});
test("broken stored shapes, references, versions and dangerous document URLs are rejected", () => {
  for (const mutate of [
    (d: CapstoneDataset) => { Object.assign(d, { schemaVersion: 2 }); },
    (d: CapstoneDataset) => { Object.assign(d.topics[0], { assignments: null }); },
    (d: CapstoneDataset) => { d.topics[0].capacity = -1; },
    (d: CapstoneDataset) => { d.topics[0].capacity = 1.5; },
    (d: CapstoneDataset) => { d.topics[0].rankings[0].applicationIds.push("foreign"); },
    (d: CapstoneDataset) => { d.relationships[0].professorId = "missing"; },
    (d: CapstoneDataset) => { d.topics[0].links[0].url = "javascript:alert(1)"; },
    (d: CapstoneDataset) => { d.topics[0].links[0].url = "//unknown.example"; },
    (d: CapstoneDataset) => { d.topics[0].notes[0].at = "invalid-date"; },
  ]) {
    const data = fixture(); mutate(data); assert.equal(isCapstoneDataset(data), false);
  }
});
