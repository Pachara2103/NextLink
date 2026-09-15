import type { CapstoneDataset } from "./capstone-types";
import { isCapstoneDataset } from "./capstone-validation";
import { isRecord } from "./local-dataset";

type Entities = "companies" | "professors" | "relationships" | "students" | "teams" | "topics";
export type CapstoneStorageRow = Omit<CapstoneDataset, Entities> & { id: "capstone" } & { [K in Entities]: Record<string, CapstoneDataset[K][number]> };
const names: Entities[] = ["companies", "professors", "relationships", "students", "teams", "topics"];
const keyed = <T extends { id: string }>(values: T[]): Record<string, T> => Object.fromEntries(values.map(row => [row.id, row]));
export function capstoneStorageRows(data: CapstoneDataset): CapstoneStorageRow[] {
  return [{ id: "capstone", schemaVersion: data.schemaVersion, lastUpdated: data.lastUpdated,
    companies: keyed(data.companies), professors: keyed(data.professors), relationships: keyed(data.relationships),
    students: keyed(data.students), teams: keyed(data.teams), topics: keyed(data.topics) }];
}
export function capstoneFromRows(rows: CapstoneStorageRow[]): CapstoneDataset {
  const row = rows[0];
  return { schemaVersion: row.schemaVersion, lastUpdated: row.lastUpdated,
    companies: Object.values(row.companies), professors: Object.values(row.professors), relationships: Object.values(row.relationships),
    students: Object.values(row.students), teams: Object.values(row.teams), topics: Object.values(row.topics) };
}
export function isCapstoneStorageRow(value: unknown): value is CapstoneStorageRow {
  if (!isRecord(value) || value.id !== "capstone" || !names.every(name => isRecord(value[name]))) return false;
  if (!names.every(name => Object.entries(value[name] as Record<string, unknown>).every(([id, row]) => isRecord(row) && row.id === id))) return false;
  try { return isCapstoneDataset(capstoneFromRows([value as CapstoneStorageRow])); } catch { return false; }
}
