import type { CapstoneDataset, CapstoneTopic } from "./capstone-types";
import type { QueueKind } from "./queue";

export type CapstoneFilters = { year: string; round: string; company: string; professor: string; category: string; status: string; query: string; topic: string };
export const EMPTY_FILTERS: CapstoneFilters = { year: "", round: "", company: "", professor: "", category: "", status: "", query: "", topic: "" };

export function confirmedCount(topic: CapstoneTopic) {
  return new Set(topic.assignments.filter(a => a.phase !== "terminated").map(a => a.teamId)).size;
}
export function remainingCount(topic: CapstoneTopic): number | null {
  if (topic.status !== "open") return 0;
  return topic.capacity === null ? null : Math.max(topic.capacity - confirmedCount(topic), 0);
}
export function studentIds(topic: CapstoneTopic, round = "") {
  return new Set(topic.selections.filter(s => !round || s.round === round).map(s => s.studentId));
}
export function interestCount(topic: CapstoneTopic, round = ""): number | null {
  return topic.interestKnown ? studentIds(topic, round).size : null;
}
export function applicationCount(topic: CapstoneTopic, round = ""): number | null {
  return topic.applicationsKnown ? new Set(topic.applications.filter(a => a.status === "active" && (!round || a.round === round)).map(a => a.teamId)).size : null;
}
export function followUp(topic: CapstoneTopic, round = ""): { kind: QueueKind; reason: string } | null {
  return topicFollowUp(topic, round, confirmedCount(topic));
}
function topicFollowUp(topic: CapstoneTopic, round: string, confirmed: number): ReturnType<typeof followUp> {
  if (topic.status === "withdrawn") return null;
  if (topic.issue) return { kind: "BLOCKED", reason: topic.issue };
  if (topic.capacity !== null && confirmed > topic.capacity) return { kind: "BLOCKED", reason: "กลุ่มที่ยืนยันเกินจำนวนที่รับได้" };
  if (!topic.coordinator || !topic.scope || topic.capacity === null) return { kind: "WAITING", reason: "รอข้อมูลผู้ประสานงาน ขอบเขต หรือจำนวนกลุ่มที่รับ" };
  const rounds = round ? [round] : topic.rounds;
  if (topic.companyId && topic.status === "open" && rounds.some(r => {
    const ranked = new Set(topic.rankings.find(ranking => ranking.round === r)?.applicationIds);
    return topic.applications.some(a => a.round === r && a.status === "active" && !ranked.has(a.id));
  })) return { kind: "WAITING", reason: "รอบริษัทจัดอันดับกลุ่มผู้สมัคร" };
  if (topic.status === "draft") return { kind: "IN_PROGRESS", reason: "เตรียมหัวข้อและข้อตกลงก่อนเปิดรับ" };
  if (topic.assignments.some(a => !["completed", "terminated"].includes(a.phase))) return { kind: "IN_PROGRESS", reason: "ติดตามความคืบหน้าทีมและนัดหมาย" };
  return null;
}
/** Build once per dataset revision; filters reuse normalized text and relationships. */
export function buildCapstoneIndex(data: CapstoneDataset) {
  const companies = new Map(data.companies.map(company => [company.id, company]));
  const professors = new Map(data.professors.map(professor => [professor.id, professor]));
  const relationships = new Map<string, CapstoneDataset["relationships"]>();
  for (const relationship of data.relationships) {
    const rows = relationships.get(relationship.companyId) ?? [];
    rows.push(relationship);
    relationships.set(relationship.companyId, rows);
  }
  const search = new Map(data.topics.map(topic => {
    const company = companies.get(topic.companyId ?? "");
    return [topic.id, [topic.id, topic.title, topic.coordinator, topic.description, company?.name, company?.englishName].join(" ").toLocaleLowerCase()];
  }));
  return { companies, professors, relationships, search };
}

export function filterTopics(data: CapstoneDataset, filters: CapstoneFilters, index = buildCapstoneIndex(data)) {
  const query = filters.query.trim().toLocaleLowerCase();
  return data.topics.filter(topic =>
    (!filters.year || topic.year === filters.year)
      && (!filters.round || topic.rounds.includes(filters.round))
      && (!filters.company || topic.companyId === filters.company)
      && (!filters.professor || index.relationships.get(topic.companyId ?? "")?.some(r => r.professorId === filters.professor))
      && (!filters.category || topic.category === filters.category)
      && (!filters.status || topic.status === filters.status)
      && (!filters.topic || topic.id === filters.topic)
      && (!query || index.search.get(topic.id)?.includes(query))
  );
}

/** Share round-specific counts across KPIs, sorting, charts and both table layouts. */
export function capstoneTopicMetrics(topics: CapstoneTopic[], round = "") {
  return new Map(topics.map(topic => {
    const confirmed = confirmedCount(topic);
    const students = topic.interestKnown ? studentIds(topic, round) : new Set<string>();
    return [topic.id, {
      confirmed, students,
      interest: topic.interestKnown ? students.size : null,
      applications: applicationCount(topic, round),
      remaining: topic.status !== "open" ? 0 : topic.capacity === null ? null : Math.max(topic.capacity - confirmed, 0),
      work: topicFollowUp(topic, round, confirmed),
    }];
  }));
}

export function capstoneStats(topics: CapstoneTopic[], round = "", metrics = capstoneTopicMetrics(topics, round)) {
  const counts: Record<QueueKind, number> = { BLOCKED: 0, WAITING: 0, IN_PROGRESS: 0 };
  for (const topic of topics) { const work = metrics.get(topic.id)!.work; if (work) counts[work.kind]++; }
  return {
    topics: topics.length, companies: new Set(topics.map(t => t.companyId).filter(Boolean)).size,
    confirmed: topics.reduce((sum, t) => sum + metrics.get(t.id)!.confirmed, 0),
    remaining: topics.reduce((sum, t) => sum + (metrics.get(t.id)!.remaining ?? 0), 0),
    unknownCapacity: topics.filter(t => t.status === "open" && t.capacity === null).length,
    students: new Set(topics.filter(t => t.interestKnown).flatMap(t => [...metrics.get(t.id)!.students])).size,
    unknownInterest: topics.filter(t => !t.interestKnown).length,
    counts, pending: Object.values(counts).reduce((sum, n) => sum + n, 0),
  };
}
