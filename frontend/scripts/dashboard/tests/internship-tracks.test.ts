import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { InternshipPayload } from "../../../src/features/dashboard/lib/types";
import { INTERNSHIP_TRACKS, selectInternshipTrack, type TrackIntakes } from "../../../src/features/dashboard/lib/internship-tracks";
const raw = JSON.parse(readFileSync("src/features/dashboard/data/internship-companies.json", "utf8"));
const source: Omit<InternshipPayload, "track"> = { ...raw, isMock: true, source: "mock" };
const intakes: TrackIntakes = JSON.parse(readFileSync("src/features/dashboard/data/internship-track-intakes.json", "utf8")).tracks;
const internship = () => selectInternshipTrack(source, intakes, "ฝึกงาน");
const cooperative = () => selectInternshipTrack(source, intakes, "สหกิจศึกษา");

test("routes contain disjoint cohorts and preserve all 60 original applications", () => {
  const a = internship(), b = cooperative();
  assert.equal(a.applications.length, 30); assert.equal(b.applications.length, 30);
  assert.ok(a.applications.every(a => a.track === "ฝึกงาน"));
  assert.ok(b.applications.every(a => a.track === "สหกิจศึกษา"));
  assert.equal(new Set([...a.applications, ...b.applications].map(a => a.id)).size, 60);
  assert.equal(a.applications.flatMap(a => a.choices).length, 150);
  assert.equal(b.applications.flatMap(a => a.choices).length, 150);
});
test("intake projections split the mock total rather than double counting it on both pages", () => {
  const a = internship(), b = cooperative();
  for (const company of source.companies) {
    for (const position of company.positions) {
      const ap = a.companies.find(c => c.id === company.id)?.positions.find(p => p.name === position.name);
      const bp = b.companies.find(c => c.id === company.id)?.positions.find(p => p.name === position.name);
      for (const key of ["declaredIntake", "accepted"] as const) assert.equal((ap?.[key] ?? 0) + (bp?.[key] ?? 0), position[key]);
    }
  }
  const seats = (d: InternshipPayload) => d.companies.flatMap(c => c.positions).reduce((sum, p) => sum + p.declaredIntake, 0);
  assert.equal(seats(a), 27); assert.equal(seats(b), 29);
});
test("changing one projected position does not mutate the other cohort or fixture", () => {
  const a = internship(), b = cooperative();
  const old = b.companies[0].positions[0].accepted;
  a.companies[0].positions[0].accepted = 99;
  assert.equal(b.companies[0].positions[0].accepted, old);
  assert.notEqual(internship().companies[0].positions[0].accepted, 99);
});
test("missing track-specific intake fails instead of falling back to combined totals", () => {
  const incomplete = structuredClone(intakes);
  delete incomplete["สหกิจศึกษา"][source.companies[0].id];
  assert.throws(() => selectInternshipTrack(source, incomplete, "สหกิจศึกษา"), /Missing or invalid/);
});
test("cohorts use separate URLs and storage, leaving ambiguous legacy edits untouched", () => {
  assert.notEqual(INTERNSHIP_TRACKS["ฝึกงาน"].path, INTERNSHIP_TRACKS["สหกิจศึกษา"].path);
  assert.notEqual(INTERNSHIP_TRACKS["ฝึกงาน"].storageKey, INTERNSHIP_TRACKS["สหกิจศึกษา"].storageKey);
  assert.notEqual(INTERNSHIP_TRACKS["ฝึกงาน"].storageKey, "nextlink.internship.companies.v1");
});
