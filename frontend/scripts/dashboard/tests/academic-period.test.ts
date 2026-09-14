import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACADEMIC_TERMS, DEFAULT_ACADEMIC_PERIOD, matchesAcademicPeriod, parseAcademicPeriod, periodStorageKey, withAcademicPeriod } from "../../../src/features/dashboard/lib/academic-period";
import { internshipPeriodSource, selectCapstonePeriod, selectElectivePeriod, selectMouPeriod } from "../../../src/features/dashboard/lib/academic-data";
import { restoreCapstoneSnapshot } from "../../../src/features/dashboard/lib/capstone-storage";
import { mockDashboardData } from "../../../src/features/dashboard/lib/mock-data";
import { selectInternshipTrack, type TrackIntakes } from "../../../src/features/dashboard/lib/internship-tracks";
import { buildStats } from "../../../src/features/dashboard/lib/internship-stats";
import { isCapstoneDataset } from "../../../src/features/dashboard/lib/capstone-validation";
import type { CapstoneDataset } from "../../../src/features/dashboard/lib/capstone-types";
import type { InternshipPayload, MouPayload } from "../../../src/features/dashboard/lib/types";

const read = (name: string) => JSON.parse(readFileSync(`src/features/dashboard/data/${name}.json`, "utf8"));
const current = DEFAULT_ACADEMIC_PERIOD;
const previous = { year: 2568, term: "2" as const };

test("academic period parsing rejects invalid years, arrays and terms without guessing a semester", () => {
  assert.deepEqual(parseAcademicPeriod({ year: "2568", term: "2" }), previous);
  for (const year of ["NaN", "-2568", "2568.5", "1000000", ["2568", "2569"]]) assert.equal(parseAcademicPeriod({ year }).year, current.year);
  assert.equal(parseAcademicPeriod({ term: "round-1" }).term, current.term);
  for (const term of ACADEMIC_TERMS) assert.ok(matchesAcademicPeriod(2569, term.source, { year: 2569, term: term.value }));
  assert.equal(matchesAcademicPeriod(2568, "ต้น", current), false);
});

test("period navigation preserves route, filters and anchors; saved edits are isolated by year and term", () => {
  const url = new URL(withAcademicPeriod("/capstone?q=test#action-queue", previous), "https://example.test");
  assert.equal(url.pathname, "/capstone"); assert.equal(url.hash, "#action-queue");
  assert.equal(url.searchParams.get("q"), "test"); assert.equal(url.searchParams.get("year"), "2568");
  const base = "nextlink.elective.courses.v1";
  assert.equal(periodStorageKey(base, current), base);
  assert.notEqual(periodStorageKey(base, current), periodStorageKey(base, previous));
  assert.notEqual(periodStorageKey(base, previous), periodStorageKey(base, { year: 2568, term: "1" }));
});

test("elective cohorts partition courses and empty periods never fall back to another cohort", () => {
  const recent = selectElectivePeriod(mockDashboardData, current);
  const old = selectElectivePeriod(mockDashboardData, previous);
  assert.equal(recent.courses.length, 10); assert.equal(old.courses.length, 3);
  assert.equal(new Set([...recent.courses, ...old.courses].map(c => c.id)).size, 13);
  assert.deepEqual(selectElectivePeriod(mockDashboardData, { year: 2569, term: "summer" }).courses, []);
  assert.equal(old.courses.reduce((n, c) => n + c.enrolled, 0), 66);
});

test("internship demand and intake use the same academic period and track", () => {
  const source = read("internship-companies") as Omit<InternshipPayload, "track">;
  const intakes = read("internship-track-intakes").tracks as TrackIntakes;
  const before = JSON.stringify({ source, intakes });
  for (const track of ["ฝึกงาน", "สหกิจศึกษา"] as const) {
    const recent = selectInternshipTrack(source, intakes, track);
    const selected = internshipPeriodSource(source, intakes, previous);
    const old = selectInternshipTrack(selected.source as Omit<InternshipPayload, "track">, selected.intakes, track);
    assert.equal(recent.applications.length, 30); assert.equal(old.applications.length, 6);
    assert.equal(buildStats(old.companies, old.applications).reduce((n, c) => n + c.totalPicks, 0), 30);
    assert.notEqual(old.companies.reduce((n, c) => n + c.positions.reduce((s, p) => s + p.declaredIntake, 0), 0), recent.companies.reduce((n, c) => n + c.positions.reduce((s, p) => s + p.declaredIntake, 0), 0));
    if (old.companies[0]?.positions[0]) old.companies[0].positions[0].accepted = 999;
    const empty = internshipPeriodSource(source, intakes, { year: 2569, term: "2" });
    assert.equal(selectInternshipTrack(empty.source as Omit<InternshipPayload, "track">, empty.intakes, track).companies.length, 0);
  }
  assert.equal(JSON.stringify({ source, intakes }), before);
});

test("MOU snapshots follow reporting periods independently of contract status", () => {
  const source = read("mou-companies") as MouPayload;
  const recent = selectMouPeriod(source, current), old = selectMouPeriod(source, previous);
  assert.equal(recent.companies.length, 10); assert.equal(old.companies.length, 4);
  assert.notEqual(recent.companies[0].documentStatus, old.companies[0].documentStatus);
  old.companies[0].note = "edited history";
  assert.notEqual(recent.companies[0].note, "edited history");
  assert.equal(selectMouPeriod(source, { year: 2569, term: "2" }).companies.length, 0);
});

test("Capstone partitions topics by year and term while preserving ranking rounds", () => {
  const source = read("capstone-projects") as CapstoneDataset;
  const recent = selectCapstonePeriod(source, current), old = selectCapstonePeriod(source, previous);
  assert.equal(recent.topics.length, 24); assert.equal(old.topics.length, 4);
  assert.ok(isCapstoneDataset(recent)); assert.ok(isCapstoneDataset(old));
  assert.deepEqual(recent.topics[0].rounds, source.topics[0].rounds);
  assert.equal(selectCapstonePeriod(source, { year: 2569, term: "2" }).topics.length, 0);
  assert.deepEqual(recent.topics[0].rankings, source.topics[0].rankings);
});

test("legacy Capstone edits migrate into matching periods and reset prevents their return", () => {
  const source = read("capstone-projects") as CapstoneDataset;
  const legacy = structuredClone(source);
  legacy.topics[0].title = "edited current";
  legacy.topics[24].title = "edited previous";
  const stored = { sourceVersion: source.lastUpdated, data: legacy, editedAt: "2026-09-08T00:00:00Z" };
  const recent = selectCapstonePeriod(source, current), old = selectCapstonePeriod(source, previous);
  const restored = restoreCapstoneSnapshot(stored, recent, true);
  assert.equal(restored.data.topics.length, 24);
  assert.equal(restored.data.topics[0].title, "edited current");
  assert.equal(restoreCapstoneSnapshot(stored, old, true).data.topics[0].title, "edited previous");
  assert.throws(() => restoreCapstoneSnapshot(stored, recent), /cohort/);
  assert.deepEqual(restoreCapstoneSnapshot({ reset: true }, recent), { data: recent, editedAt: null });
});
