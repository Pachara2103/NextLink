import { validMilestones, milestoneChanges } from "./capstone-milestones";
import type { CapstoneDataset, CapstoneDraft, CapstoneTopic } from "./capstone-types";
import { TEAM_PHASES, TOPIC_STATUSES } from "./capstone-statuses";

export function toCapstoneDraft(topic: CapstoneTopic, data: CapstoneDataset): CapstoneDraft {
  return structuredClone({ topic, relationships: data.relationships.filter(r => r.companyId === topic.companyId), reason: "" });
}
export function needsChangeReason(before: CapstoneTopic, after: CapstoneTopic) {
  return before.scope !== after.scope || before.assignments.some(a => {
    const next = after.assignments.find(n => n.id === a.id);
    return next && (a.mentor !== next.mentor || JSON.stringify(a.professorIds) !== JSON.stringify(next.professorIds));
  });
}
export function applyCapstoneDraft(data: CapstoneDataset, draft: CapstoneDraft, at: string): CapstoneDataset {
  const before = data.topics.find(t => t.id === draft.topic.id);
  if (!before) throw new Error("Unknown Capstone topic");
  if (needsChangeReason(before, draft.topic) && !draft.reason.trim()) throw new Error("A change reason is required");
  if (!validMilestones(draft.topic)) throw new Error("ตรวจชื่อ Milestone ทีมที่ยืนยัน วันที่ และสถานะให้ถูกต้อง");
  const changes: { field: string; before: string; after: string }[] = milestoneChanges(before, draft.topic);
  const fields = { title: "ชื่อหัวข้อ", category: "หมวดหมู่", status: "สถานะหัวข้อ", capacity: "จำนวนกลุ่มที่รับ", coordinator: "ผู้ประสานงาน", contactRole: "บทบาทผู้ติดต่อ", description: "รายละเอียด", scope: "ขอบเขต", deliverables: "สิ่งส่งมอบ", support: "สิ่งสนับสนุน", issue: "ปัญหาที่ต้องติดตาม" } as const;
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (before[key] !== draft.topic[key]) changes.push({ field: fields[key], before: key === "status" ? TOPIC_STATUSES[before.status].label : String(before[key] ?? "ยังไม่ทราบ"), after: key === "status" ? TOPIC_STATUSES[draft.topic.status].label : String(draft.topic[key] ?? "ยังไม่ทราบ") });
  }
  for (const next of draft.topic.assignments) {
    const old = before.assignments.find(a => a.id === next.id);
    if (old && JSON.stringify(old) !== JSON.stringify(next)) {
      const describe = (a: typeof next) => `${TEAM_PHASES[a.phase]} · ${a.mentor || "ยังไม่มีพี่เลี้ยง"} · ${a.professorIds.map(id => data.professors.find(p => p.id === id)?.name ?? id).join(", ") || "ยังไม่มีที่ปรึกษา"}`;
      changes.push({ field: `ทีม ${data.teams.find(t => t.id === next.teamId)?.name}`, before: describe(old), after: describe(next) });
    }
  }
  const topic = { ...draft.topic, history: [...before.history, ...changes.map((change, i) => ({ ...change, id: `${before.id}-${at}-${i}`, at, reason: draft.reason.trim() || "แก้ข้อมูลตัวอย่างในเบราว์เซอร์" }))] };
  return { ...data, topics: data.topics.map(t => t.id === topic.id ? topic : t), relationships: [
    ...data.relationships.filter(r => r.companyId !== topic.companyId), ...draft.relationships,
  ] };
}
