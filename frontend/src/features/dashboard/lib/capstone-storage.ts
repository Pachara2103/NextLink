import type { CapstoneDataset } from "./capstone-types";
import { isCapstoneDataset } from "./capstone-validation";
import { isRecord } from "./local-dataset";

/** Reconcile legacy records only against topics in the selected cohort. */
export function restoreCapstoneSnapshot(parsed: unknown, bundled: CapstoneDataset, legacy = false) {
  if (!isRecord(parsed)) throw new Error("Invalid saved Capstone data");
  if (parsed.reset === true) return { data: bundled, editedAt: null };
  if (parsed.sourceVersion !== bundled.lastUpdated || typeof parsed.editedAt !== "string" || !Number.isFinite(Date.parse(parsed.editedAt)) || !isRecord(parsed.data)) throw new Error("Outdated saved Capstone data");
  const source = new Map(bundled.topics.map(t => [t.id, t]));
  let data: unknown = parsed.data;
  if (legacy) {
    if (!Array.isArray(parsed.data.topics) || !parsed.data.topics.every(t => isRecord(t) && typeof t.id === "string")) throw new Error("Invalid legacy topics");
    const saved = new Map(parsed.data.topics.map(t => [t.id, t]));
    if (saved.size !== parsed.data.topics.length) throw new Error("Duplicate legacy topics");
    data = { ...parsed.data, topics: bundled.topics.map(t => ({ ...t, ...saved.get(t.id), year: t.year, term: t.term })) };
  }
  if (!isCapstoneDataset(data) || data.topics.some(t => !source.has(t.id) || source.get(t.id)!.year !== t.year || source.get(t.id)!.term !== t.term)) throw new Error("Invalid cohort data");
  return { data, editedAt: parsed.editedAt };
}
