import type { CapstoneTopic } from './capstone-types';
export const MILESTONE_STATUSES = ['รอยืนยัน', 'นัดหมายแล้ว', 'เสร็จแล้ว', 'ยกเลิก'] as const;
export function validMilestones(topic: CapstoneTopic) {
  const rows = topic.milestones;
  return rows.length <= 10000 && new Set(rows.map(m => m.id)).size === rows.length && rows.every(m =>
    Boolean(m.id) && Boolean(m.title.trim()) && topic.assignments.some(a => a.teamId === m.teamId)
    && /^\d{4}-\d{2}-\d{2}$/.test(m.due) && Number.isFinite(Date.parse(m.due))
    && new Date(m.due).toISOString().slice(0, 10) === m.due && MILESTONE_STATUSES.some(s => s === m.status));
}
export function milestoneChanges(before: CapstoneTopic, after: CapstoneTopic) {
  const describe = (m: CapstoneTopic['milestones'][number] | undefined) => m ? `${m.title} · ${m.teamId} · ${m.due} · ${m.status}` : 'ไม่มีรายการ';
  return [...new Set([...before.milestones.map(m => m.id), ...after.milestones.map(m => m.id)])].flatMap(id => {
    const old = before.milestones.find(m => m.id === id), next = after.milestones.find(m => m.id === id);
    return describe(old) === describe(next) ? [] : [{ field: `Milestone: ${next?.title ?? old?.title}`, before: describe(old), after: describe(next) }];
  });
}
