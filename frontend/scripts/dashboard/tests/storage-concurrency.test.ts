import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyDatasetChanges, datasetChanges, DatasetConflict, LegacyDataset, rebaseDataset, restoreDataset, storedDataset } from "../../../src/features/dashboard/lib/local-dataset";
import { capstoneFromRows, capstoneStorageRows, isCapstoneStorageRow } from "../../../src/features/dashboard/lib/capstone-storage-rows";
import type { CapstoneDataset } from "../../../src/features/dashboard/lib/capstone-types";

const at = "2026-09-12T00:00:00Z";
const base = [{ id: "A", title: "Original", status: { course: "WAITING" }, notes: "" }, { id: "B", title: "Other", status: { course: "OPEN" }, notes: "" }];
type Row = typeof base[number];
const valid = (row: unknown): row is Row => !!row && typeof row === "object" && "id" in row && "status" in row && "title" in row && "notes" in row;

test("two stale tabs editing different rows keep both changes", () => {
  const a = structuredClone(base); a[0].notes = "A edit";
  const b = structuredClone(base); b[1].notes = "B edit";
  const latest = restoreDataset(storedDataset(a, base, at, "A"), base, valid).items;
  const merged = rebaseDataset(base, b, latest);
  assert.equal(merged[0].notes, "A edit"); assert.equal(merged[1].notes, "B edit");
  assert.deepEqual(restoreDataset(storedDataset(merged, base, at, "B"), base, valid).items, merged);
});
test("source updates survive a saved note-only override", () => {
  const edited = structuredClone(base); edited[0].notes = "Staff note";
  const saved = storedDataset(edited, base, at);
  assert.deepEqual(saved.items[0].changes.map(change => change.path), [["notes"]]);
  const fresh = structuredClone(base); fresh[0].status.course = "SIGNED";
  const restored = restoreDataset(JSON.parse(JSON.stringify(saved)), fresh, valid);
  assert.equal(restored.items[0].status.course, "SIGNED"); assert.equal(restored.items[0].notes, "Staff note");
});
test("same-field conflicts reject stale writes without mutating the current rows", () => {
  const a = structuredClone(base); a[0].notes = "A edit";
  const b = structuredClone(base); b[0].notes = "B edit";
  assert.throws(() => rebaseDataset(base, b, a), DatasetConflict);
  assert.equal(a[0].notes, "A edit");
  assert.throws(() => restoreDataset(storedDataset(a, base, at), b, valid), DatasetConflict);
});
test("undo only reverses its own fields and refuses to overwrite newer edits", () => {
  const saved = structuredClone(base); saved[0].notes = "my edit";
  const latest = structuredClone(saved); latest[1].title = "newer other row";
  const undone = rebaseDataset(saved, base, latest);
  assert.equal(undone[0].notes, ""); assert.equal(undone[1].title, "newer other row");
  latest[0].notes = "newer same row";
  assert.throws(() => rebaseDataset(saved, base, latest), DatasetConflict);
});
test("legacy full rows require field review; selected recovery leaves other source fields intact", () => {
  const legacy = structuredClone(base); legacy[0].notes = "keep this"; legacy[0].title = "old title";
  let review: LegacyDataset | undefined;
  try { restoreDataset({ schemaVersion: 2, items: [legacy[0]], editedAt: at }, base, valid); }
  catch (error) { assert.ok(error instanceof LegacyDataset); review = error; }
  assert.ok(review);
  const chosen = review.changes.map(row => ({ ...row, changes: row.changes.filter(change => change.path[0] === "notes") }));
  const recovered = applyDatasetChanges(base, chosen);
  assert.equal(recovered[0].notes, "keep this"); assert.equal(recovered[0].title, "Original");
});
test("patches cannot use prototype paths or alter row IDs", () => {
  for (const path of [["__proto__", "polluted"], ["id"], ["status", "constructor"]]) {
    assert.throws(() => restoreDataset({ schemaVersion: 3, revision: "bad", editedAt: at, items: [{ id: "A", changes: [{ path, after: "changed" }] }] }, base, valid));
  }
  assert.throws(() => datasetChanges(base, [{ ...base[0], id: "new" }, base[1]]));
});
test("Capstone merges different topics and relationships without treating the entire dataset as one field", () => {
  const data: CapstoneDataset = JSON.parse(readFileSync("src/features/dashboard/data/capstone-projects.json", "utf8"));
  const a = structuredClone(data), b = structuredClone(data);
  a.topics[0].title = "A title"; b.topics[1].title = "B title";
  b.relationships[0].role = "updated role";
  const rows = rebaseDataset(capstoneStorageRows(data), capstoneStorageRows(b), capstoneStorageRows(a));
  assert.ok(rows.every(isCapstoneStorageRow));
  const result = capstoneFromRows(rows);
  assert.equal(result.topics[0].title, "A title"); assert.equal(result.topics[1].title, "B title");
  assert.equal(result.relationships[0].role, "updated role");
  assert.deepEqual(result.topics[0].assignments, data.topics[0].assignments);
});
