import type { CapstoneDataset } from "./capstone-types";
import { validateRanking } from "./capstone-ranking";

// Validate every nested collection before browser data is allowed into the UI.
type Shape = "text" | "date" | "nullableDate" | "nullableId" | "capacity" | "boolean" | "version" | { [key: string]: Shape } | readonly [Shape];
const schema: Shape = {
  schemaVersion: "version", lastUpdated: "date",
  companies: [{ id: "text", name: "text", englishName: "text", domain: "text", address: "text" }],
  professors: [{ id: "text", name: "text" }], students: [{ id: "text", name: "text" }],
  teams: [{ id: "text", name: "text", studentIds: ["text"] }],
  relationships: [{ id: "text", companyId: "text", professorId: "text", role: "text", source: "text" }],
  topics: [{
    id: "text", year: "text", term: "text", companyId: "nullableId", title: "text", category: "text", rounds: ["text"],
    capacity: "capacity", status: "text", coordinator: "text", contactRole: "text", description: "text",
    scope: "text", deliverables: "text", support: "text", issue: "text", interestKnown: "boolean", applicationsKnown: "boolean",
    selections: [{ studentId: "text", round: "text" }],
    applications: [{ id: "text", teamId: "text", round: "text", status: "text" }],
    rankings: [{ round: "text", applicationIds: ["text"], note: "text", updatedAt: "nullableDate", recordedBy: "text" }],
    assignments: [{ id: "text", teamId: "text", professorIds: ["text"], mentor: "text", phase: "text" }],
    notes: [{ id: "text", type: "text", basis: "text", text: "text", author: "text", at: "date" }],
    history: [{ id: "text", field: "text", before: "text", after: "text", reason: "text", at: "date" }],
    milestones: [{ id: "text", teamId: "text", title: "text", due: "date", status: "text" }],
    links: [{ label: "text", url: "text" }],
  }],
};
function matches(value: unknown, shape: Shape): boolean {
  if (shape === "text") return typeof value === "string" && value.length <= 20000;
  if (shape === "date") return typeof value === "string" && Number.isFinite(Date.parse(value));
  if (shape === "nullableDate") return value === null || matches(value, "date");
  if (shape === "nullableId") return value === null || matches(value, "text");
  if (shape === "capacity") return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1000);
  if (shape === "boolean") return typeof value === "boolean";
  if (shape === "version") return value === 1;
  if (Array.isArray(shape)) return Array.isArray(value) && value.length <= 10000 && value.every(item => matches(item, shape[0]));
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.entries(shape).every(([key, field]) => matches((value as Record<string, unknown>)[key], field));
}
const unique = (ids: string[]) => ids.every(Boolean) && new Set(ids).size === ids.length;
const uniqueIds = (rows: { id: string }[]) => unique(rows.map(r => r.id));

export function isCapstoneDataset(value: unknown): value is CapstoneDataset {
  if (!matches(value, schema)) return false;
  const data = value as CapstoneDataset;
  if (![data.companies, data.professors, data.students, data.teams, data.relationships, data.topics].every(uniqueIds)) return false;
  const companies = new Set(data.companies.map(c => c.id));
  const professors = new Set(data.professors.map(p => p.id));
  const students = new Set(data.students.map(s => s.id));
  const teams = new Set(data.teams.map(t => t.id));
  if (!data.teams.every(t => unique(t.studentIds) && t.studentIds.every(id => students.has(id)))) return false;
  if (!data.relationships.every(r => companies.has(r.companyId) && professors.has(r.professorId))) return false;
  if (!unique(data.relationships.map(r => `${r.companyId}:${r.professorId}`))) return false;
  return data.topics.every(t => {
    if (!t.title.trim() || !/^\d{4}$/.test(t.year) || !["1", "2", "summer"].includes(t.term) || !t.category || (t.companyId !== null && !companies.has(t.companyId))) return false;
    if (!["draft", "open", "closed", "withdrawn"].includes(t.status) || !t.rounds.length || !unique(t.rounds)) return false;
    if (![t.applications, t.assignments, t.notes, t.history, t.milestones].every(uniqueIds)) return false;
    if (!t.selections.every(s => students.has(s.studentId) && t.rounds.includes(s.round))) return false;
    if (!t.applications.every(a => teams.has(a.teamId) && t.rounds.includes(a.round) && ["active", "withdrawn"].includes(a.status))) return false;
    if (!unique(t.applications.map(a => `${a.round}:${a.teamId}`))) return false;
    if (!unique(t.rankings.map(r => r.round)) || !t.rankings.every(r => t.rounds.includes(r.round) && validateRanking(t, r.round, r.applicationIds))) return false;
    if (!unique(t.assignments.map(a => a.teamId)) || !t.assignments.every(a => teams.has(a.teamId) && unique(a.professorIds) && a.professorIds.every(p => professors.has(p)) && ["proposal", "development", "testing", "completed", "terminated"].includes(a.phase))) return false;
    if (!t.notes.every(n => ["บันทึก", "ปัญหา", "Feedback"].includes(n.type) && ["ข้อเท็จจริง", "ความคิดเห็น"].includes(n.basis))) return false;
    if (!t.milestones.every(m => teams.has(m.teamId))) return false;
    // A saved browser override must not turn document links into executable URLs.
    return t.links.every(l => /^https?:\/\//i.test(l.url) || /^\/(?!\/)/.test(l.url));
  });
}
