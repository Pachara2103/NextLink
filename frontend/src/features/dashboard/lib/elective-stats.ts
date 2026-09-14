import type { DashboardCourse, DashboardWorkflowTask, WorkflowTaskStatus } from "./types";
import { QUEUE_META, queueRank, type QueueKind } from "./queue";

export type OperationalReadinessKey = "READY" | QueueKind;
export const workflowStatusLabels: Record<WorkflowTaskStatus, string> = {
  RECEIVED: "ได้รับแล้ว", NOT_RECEIVED: "ยังไม่ได้รับ", IN_PROGRESS: "กำลังดำเนินการ",
  DONE: "เสร็จแล้ว", BLOCKED: "ติดปัญหา", NOT_APPLICABLE: "ยังไม่ถึงขั้นตอน", UNKNOWN: "ยังไม่ระบุ",
};
export function isWorkflowComplete(task: DashboardWorkflowTask) {
  return ["DONE", "RECEIVED", "NOT_APPLICABLE"].includes(task.status);
}

/** One decision feeds readiness, the queue, and the next-action copy. */
export function assessCourse(course: DashboardCourse) {
  const issues: { kind: QueueKind; text: string }[] = course.workflow.filter(task => !isWorkflowComplete(task)).map(task => ({
    kind: task.status === "BLOCKED" ? "BLOCKED" : task.status === "IN_PROGRESS" ? "IN_PROGRESS" : "WAITING",
    text: `${task.label}: ${workflowStatusLabels[task.status]}`,
  }));
  const required = { course: "เปิดแล้ว", documents: "เอกสารครบ", invitation: "ลงนามแล้ว", mcv: "เปิดแล้ว" };
  for (const key of Object.keys(required) as (keyof typeof required)[]) {
    if (course.status[key] !== required[key]) issues.push({ kind: "WAITING", text: course.status[key] });
  }
  issues.sort((a, b) => queueRank(a.kind) - queueRank(b.kind));
  const key: OperationalReadinessKey = issues.length ? issues[0].kind : "READY";
  const label = key === "READY" ? "พร้อมดำเนินการ" : QUEUE_META[key].label;
  const className = key === "READY" ? "tone-green" : key === "BLOCKED" ? "tone-red" : key === "WAITING" ? "tone-orange" : "tone-blue";
  return { key, label, className, issues, nextAction: issues[0]?.text ?? "ทุกขั้นตอนเสร็จแล้ว" };
}

export const operationalReadiness = assessCourse;
export const isFollowUp = (course: DashboardCourse) => assessCourse(course).issues.length > 0;
export const isBlocked = (course: DashboardCourse) => assessCourse(course).key === "BLOCKED";
export const nextAction = (course: DashboardCourse) => assessCourse(course).nextAction;
export const firstIssue = nextAction;
export function queueSeverity(course: DashboardCourse) {
  const state = assessCourse(course).key;
  const key: QueueKind = state === "READY" ? "IN_PROGRESS" : state;
  return { key, ...QUEUE_META[key] };
}
export const queueSeverityRank = (course: DashboardCourse) => isFollowUp(course) ? queueRank(queueSeverity(course).key) : 3;
export function electiveSeats(courses: Pick<DashboardCourse, "capacity" | "enrolled">[]) {
  return {
    remaining: courses.reduce((sum, course) => sum + (course.capacity === null ? 0 : Math.max(course.capacity - course.enrolled, 0)), 0),
    overbooked: courses.reduce((sum, course) => sum + (course.capacity === null ? 0 : Math.max(course.enrolled - course.capacity, 0)), 0),
  };
}

export function electiveCapacity(courses: Pick<DashboardCourse, "capacity" | "enrolled">[]) {
  const known = courses.filter(course => course.capacity !== null);
  const capacity = known.reduce((sum, course) => sum + course.capacity!, 0);
  const enrolled = known.reduce((sum, course) => sum + course.enrolled, 0);
  return { capacity, enrolled, unknown: courses.length - known.length,
    occupancy: capacity > 0 ? Math.round(enrolled / capacity * 100) : null, ...electiveSeats(courses) };
}
