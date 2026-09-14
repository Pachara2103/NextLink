import test from 'node:test';
import assert from 'node:assert/strict';
import { directorySeed, isDirectoryCompany, companyKey, latestCase } from '../../../src/features/dashboard/lib/company-directory';
import { partnershipSnapshot, signedWithoutFriday } from '../../../src/features/dashboard/lib/partnership-history';
import { storedDataset, restoreDataset } from '../../../src/features/dashboard/lib/local-dataset';

test('shared fixture registry uses explicit identities and valid nested contacts/cases', () => {
  assert.ok(directorySeed.every(isDirectoryCompany));
  assert.equal(companyKey('mou', 'mou-mock-01'), companyKey('friday', 'demo-company-cloud'));
  assert.notEqual(companyKey('mou', 'unlinked'), companyKey('friday', 'unlinked'));
});
test('contacts and backdated cases persist and latest case uses occurrence, not entry date', () => {
  const rows = structuredClone(directorySeed), c = rows[0];
  c.contacts.push({ ...c.contacts[0], id: 'new', name: 'New synthetic contact' });
  c.cases.push({ ...c.cases[0], id: 'late-entry', occurredOn: '2025-01-01', recordedAt: '2026-09-14T00:00:00Z' });
  const restored = restoreDataset(storedDataset(rows, directorySeed, '2026-09-14T00:00:00Z', 'r1'), directorySeed, isDirectoryCompany).items;
  assert.equal(restored[0].contacts.length, 3);
  assert.notEqual(latestCase(restored[0].cases)!.id, 'late-entry');
  const duplicate = structuredClone(c); duplicate.contacts.push(duplicate.contacts[0]); assert.equal(isDirectoryCompany(duplicate), false);
  const badDate = structuredClone(c); badDate.cases[0].occurredOn = '2026-02-31'; assert.equal(isDirectoryCompany(badDate), false);
});
test('company history resolves current storage and tolerates unreadable module without inventing history', () => {
  const base = partnershipSnapshot();
  assert.ok(base.events.filter(e => e.companyId === 'partner-cloud').length > 1);
  const filtered = partnershipSnapshot((key, seed) => key.startsWith('nextlink.capstone.') ? [] : seed);
  assert.ok(filtered.events.length > 0); assert.equal(filtered.events.some(e => e.module === 'capstone'), false);
});
test('MOU without Friday requires readable history; only completed events count', () => {
  const snapshot = partnershipSnapshot();
  const m = { ...snapshot.currentMous[0], documentStatus: 'ลงนามแล้ว (บ.ในเครือ)' };
  const a = { ...snapshot.friday[0], companyId: 'demo-company-cloud', status: 'scheduled' as const };
  assert.equal(signedWithoutFriday([m], [a], false), null);
  assert.equal(signedWithoutFriday([m], [a], true)!.length, 1);
  assert.equal(signedWithoutFriday([m], [{ ...a, status: 'completed' }], true)!.length, 0);
  assert.equal(signedWithoutFriday([{ ...m, documentStatus: 'รอลงนาม' }], [], true)!.length, 0);
});
