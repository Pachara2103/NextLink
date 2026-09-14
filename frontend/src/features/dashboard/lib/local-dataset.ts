export type RowValidator<T> = (value: unknown) => value is T;
export type FieldChange = { path: string[]; before?: unknown; after?: unknown };
export type RowChanges = { id: string; changes: FieldChange[] };
export type StoredDataset = { schemaVersion: 3; items: RowChanges[]; editedAt: string; revision: string };
export class DatasetConflict extends Error {
  readonly fields: string[];
  constructor(fields: string[]) {
    super(`ข้อมูลเปลี่ยนแล้วในช่อง ${fields.join(", ")} กรุณาตรวจข้อมูลล่าสุดก่อนบันทึกอีกครั้ง`);
    this.fields = fields;
  }
}
export class LegacyDataset extends Error {
  readonly changes: RowChanges[];
  constructor(changes: RowChanges[]) {
    super("ข้อมูลที่บันทึกแบบเดิมไม่มีประวัติว่าช่องใดถูกแก้ กรุณาตรวจทานและเลือกช่องที่จะนำกลับมา ข้อมูลเดิมยังเก็บอยู่");
    this.changes = changes;
  }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export const sameValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (isRecord(a) && isRecord(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.every(key => sameValue(a[key], b[key]));
  }
  return false;
};
const safeKey = (key: string) => !["__proto__", "constructor", "prototype"].includes(key);
export function changedFields(before: unknown, after: unknown, path: string[] = []): FieldChange[] {
  if (sameValue(before, after)) return [];
  if (isRecord(before) && isRecord(after)) return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => {
    if (!safeKey(key)) throw new Error("Invalid field name");
    return changedFields(before[key], after[key], [...path, key]);
  });
  return [{ path, before, after }];
}
function fieldValue(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((at, key) => isRecord(at) ? at[key] : undefined, value);
}
export function applyFields<T>(value: T, changes: FieldChange[], checkConflict = true): T {
  let result = structuredClone(value);
  const conflicts = changes.filter(change => checkConflict && !sameValue(fieldValue(value, change.path), change.before) && !sameValue(fieldValue(value, change.path), change.after));
  if (conflicts.length) throw new DatasetConflict(conflicts.map(change => change.path.join(".")));
  for (const { path, after } of changes) {
    if (path.length > 30 || !path.every(safeKey)) throw new Error("Invalid patch path");
    if (!path.length) { result = structuredClone(after) as T; continue; }
    let at = result as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      if (!isRecord(at[key])) at[key] = {};
      at = at[key] as Record<string, unknown>;
    }
    if (after === undefined) delete at[path.at(-1)!];
    else at[path.at(-1)!] = structuredClone(after);
  }
  return result;
}
export function datasetChanges<T extends { id: string }>(before: T[], after: T[]): RowChanges[] {
  const source = new Map(before.map(row => [row.id, row]));
  if (new Set(after.map(row => row.id)).size !== after.length || after.length !== before.length || after.some(row => !source.has(row.id))) throw new Error("Invalid dataset identity");
  return after.map(row => ({ id: row.id, changes: changedFields(source.get(row.id), row) })).filter(row => row.changes.length);
}
export function applyDatasetChanges<T extends { id: string }>(rows: T[], patches: RowChanges[], checkConflict = true): T[] {
  const ids = new Set(rows.map(row => row.id));
  const missing = patches.filter(patch => !ids.has(patch.id));
  if (missing.length) throw new DatasetConflict(missing.map(row => row.id));
  const byId = new Map(patches.map(patch => [patch.id, patch.changes]));
  return rows.map(row => byId.has(row.id) ? applyFields(row, byId.get(row.id)!, checkConflict) : row);
}
export function rebaseDataset<T extends { id: string }>(before: T[], after: T[], latest: T[]): T[] {
  return applyDatasetChanges(latest, datasetChanges(before, after));
}
function validChange(value: unknown): value is FieldChange {
  return isRecord(value) && Array.isArray(value.path) && value.path.length > 0 && value.path.length <= 30
    && value.path.every(key => typeof key === "string" && key.length > 0 && safeKey(key)) && value.path[0] !== "id";
}
export function restoreDataset<T extends { id: string }>(parsed: unknown, bundled: T[], validate: RowValidator<T>) {
  const legacyArray = Array.isArray(parsed);
  if (!legacyArray && !isRecord(parsed)) throw new Error("Invalid saved data");
  const envelope = parsed as Record<string, unknown>;
  const list = legacyArray ? parsed : envelope.items;
  const editedAt = legacyArray ? null : envelope.editedAt;
  if (!Array.isArray(list) || list.length > 10000) throw new Error("Invalid saved rows");
  if (editedAt !== null && (typeof editedAt !== "string" || !Number.isFinite(Date.parse(editedAt)))) throw new Error("Invalid edit time");
  const ids = list.map(row => isRecord(row) ? row.id : null);
  if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) throw new Error("Invalid row ID");
  let items: T[];
  if (envelope.schemaVersion === 3) {
    if (typeof envelope.revision !== "string" || !envelope.revision) throw new Error("Invalid revision");
    if (!list.every(row => isRecord(row) && Array.isArray(row.changes) && row.changes.length <= 10000 && row.changes.every(validChange))) throw new Error("Invalid changes");
    items = applyDatasetChanges(bundled, list as RowChanges[]);
  } else {
    if (envelope.schemaVersion !== undefined && envelope.schemaVersion !== 2) throw new Error("Unsupported saved data");
    const source = new Map(bundled.map(row => [row.id, row]));
    const legacy = list.filter(row => source.has(row.id)).map(row => ({ ...source.get(row.id), ...row }));
    if (!legacy.every(validate)) throw new Error("Invalid saved row");
    const byId = new Map(legacy.map(row => [row.id, row]));
    items = bundled.map(row => byId.get(row.id) ?? row);
    // Full legacy rows have no trustworthy baseline. Never infer that every
    // different field was an intentional edit. Keep the original for review.
    if (list.some(validate)) throw new LegacyDataset(datasetChanges(bundled, items));
  }
  if (!items.every(validate)) throw new Error("Invalid saved row");
  return { items, editedAt: editedAt as string | null, hasOverrides: !sameValue(items, bundled), revision: typeof envelope.revision === "string" ? envelope.revision : "legacy" };
}
export function storedDataset<T extends { id: string }>(items: T[], bundled: T[], editedAt: string, revision = editedAt): StoredDataset {
  return { schemaVersion: 3, items: datasetChanges(bundled, items), editedAt, revision };
}
