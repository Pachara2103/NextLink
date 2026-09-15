import test from 'node:test';
import assert from 'node:assert/strict';
import raw from '../../../src/features/dashboard/data/capstone-projects.json';
import type { CapstoneDataset } from '../../../src/features/dashboard/lib/capstone-types';
import { toCapstoneDraft, applyCapstoneDraft } from '../../../src/features/dashboard/lib/capstone-edit';
import { validMilestones } from '../../../src/features/dashboard/lib/capstone-milestones';
import { isCapstoneDataset } from '../../../src/features/dashboard/lib/capstone-validation';
const data = raw as CapstoneDataset;
test('milestone edits, additions and deletions leave history with before and after values', () => {
  const t = data.topics.find(t => t.milestones.length)!;
  const draft = toCapstoneDraft(t, data);
  draft.topic.milestones[0].status = 'เสร็จแล้ว';
  draft.topic.milestones.push({ id: 'new', teamId: t.assignments[0].teamId, title: 'Synthetic review', due: '2026-10-12', status: 'นัดหมายแล้ว' });
  const saved = applyCapstoneDraft(data, draft, '2026-09-14T00:00:00Z');
  assert.ok(isCapstoneDataset(saved));
  const next = saved.topics.find(row => row.id === t.id)!;
  assert.equal(next.history.length, t.history.length + 2);
  assert.match(next.history.at(-1)!.after, /Synthetic review/);
  const remove = toCapstoneDraft(next, saved); remove.topic.milestones = [];
  const deleted = applyCapstoneDraft(saved, remove, '2026-09-15T00:00:00Z').topics.find(row => row.id === t.id)!;
  assert.equal(deleted.history.length, next.history.length + 2);
  assert.equal(deleted.history.at(-1)!.after, 'ไม่มีรายการ');
});
test('milestone rejects impossible dates, blank title, unassigned teams and unknown statuses', () => {
  const t = data.topics.find(t => t.milestones.length)!;
  for (const invalid of [{ due: '2026-02-31' }, { title: ' ' }, { teamId: 'foreign-team' }, { status: 'unreviewed' }]) {
    const draft = toCapstoneDraft(t, data); Object.assign(draft.topic.milestones[0], invalid);
    assert.equal(validMilestones(draft.topic), false);
    assert.throws(() => applyCapstoneDraft(data, draft, '2026-09-14T00:00:00Z'));
  }
});
