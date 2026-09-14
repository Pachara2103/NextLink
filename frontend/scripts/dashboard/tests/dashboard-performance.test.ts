import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatDate, formatNumber, formatUpdated } from "../../../src/features/dashboard/lib/format";
import type { CapstoneDataset } from "../../../src/features/dashboard/lib/capstone-types";
import { EMPTY_FILTERS, buildCapstoneIndex, capstoneStats, capstoneTopicMetrics, filterTopics } from "../../../src/features/dashboard/lib/capstone-stats";

const fixture = (): CapstoneDataset => JSON.parse(readFileSync("src/features/dashboard/data/capstone-projects.json", "utf8"));

test("shared formatters preserve Thai numbers, dates and caller time zones", () => {
  for (const value of [0, -1234.56, 9999999, NaN, Infinity]) {
    assert.equal(formatNumber(value), new Intl.NumberFormat("th-TH").format(value));
  }
  for (const timeZone of ["Asia/Bangkok", "UTC", "America/Los_Angeles", "Asia/Bangkok"]) {
    assert.equal(formatUpdated("2026-09-08T00:30:00Z", timeZone), new Intl.DateTimeFormat("th-TH", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date("2026-09-08T00:30:00Z")));
    assert.equal(formatDate("2026-09-08", timeZone), new Intl.DateTimeFormat("th-TH", { timeZone, dateStyle: "medium" }).format(new Date("2026-09-08T00:00:00+07:00")));
  }
  assert.equal(formatDate(null, "Asia/Bangkok"), "ยังไม่กำหนด");
  assert.throws(() => formatUpdated("invalid", "UTC"), RangeError);
});

test("indexed search includes company names and combined professor/round filters", () => {
  const data = fixture();
  const index = buildCapstoneIndex(data);
  const relationship = data.relationships[0];
  const topic = data.topics.find(t => t.companyId === relationship.companyId)!;
  const company = data.companies.find(c => c.id === topic.companyId)!;
  const filters = { ...EMPTY_FILTERS, company: company.id, professor: relationship.professorId, round: topic.rounds[0], query: `  ${company.englishName.toUpperCase()} ` };
  const results = filterTopics(data, filters, index);
  assert.ok(results.some(t => t.id === topic.id));
  assert.ok(results.every(t => t.companyId === company.id && t.rounds.includes(topic.rounds[0])));
  assert.deepEqual(filterTopics(data, { ...filters, professor: "missing" }, index), []);
  assert.deepEqual(filterTopics(data, { ...filters, query: "no-such-project" }, index), []);
});

test("dataset edits rebuild search and relationships without retaining old values", () => {
  const data = fixture();
  const oldIndex = buildCapstoneIndex(data);
  const revised = structuredClone(data);
  const topic = revised.topics[0];
  topic.title = "Unique revised project title";
  revised.relationships = revised.relationships.filter(r => r.companyId !== topic.companyId);
  const index = buildCapstoneIndex(revised);
  const filters = { ...EMPTY_FILTERS, query: "unique revised" };
  assert.equal(filterTopics(data, filters, oldIndex).length, 0);
  assert.deepEqual(filterTopics(revised, filters, index).map(t => t.id), [topic.id]);
  assert.equal(index.relationships.has(topic.companyId!), false);
});

test("shared topic metrics preserve round deduplication and unknown values after edits", () => {
  const data = fixture();
  const topic = data.topics[0];
  topic.selections = [{ studentId: "S1", round: "1" }, { studentId: "S1", round: "2" }, { studentId: "S2", round: "2" }];
  const first = capstoneTopicMetrics(data.topics, "1");
  const second = capstoneTopicMetrics(data.topics, "2");
  assert.equal(first.get(topic.id)!.interest, 1);
  assert.equal(second.get(topic.id)!.interest, 2);
  assert.equal(capstoneTopicMetrics(data.topics).get(topic.id)!.interest, 2);
  topic.interestKnown = false;
  topic.applicationsKnown = false;
  topic.capacity = null;
  topic.status = "open";
  const updated = capstoneTopicMetrics(data.topics, "2");
  assert.equal(updated.get(topic.id)!.interest, null);
  assert.equal(updated.get(topic.id)!.applications, null);
  assert.equal(updated.get(topic.id)!.remaining, null);
  assert.equal(updated.get(topic.id)!.students.size, 0);
  assert.equal(second.get(topic.id)!.interest, 2);
  const filtered = data.topics.slice(0, 3);
  assert.deepEqual(capstoneStats(filtered, "2", updated), capstoneStats(filtered, "2"));
});
