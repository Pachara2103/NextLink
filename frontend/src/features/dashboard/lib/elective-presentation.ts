import { ELECTIVE_STATUS } from "./elective-statuses";
import { formatDate } from "./format";
import { isWorkflowComplete, workflowStatusLabels, type OperationalReadinessKey } from "@/features/dashboard/lib/elective-stats";
import { QUEUE_META, type QueueKind } from "@/features/dashboard/lib/queue";
import type { DashboardCourse, DashboardPayload, DashboardWorkflowTask, DeliveryMode, WorkflowTaskStatus } from "@/features/dashboard/lib/types";

export const dayNames: Record<string, string> = {
  MON: "จันทร์",
  TUE: "อังคาร",
  WED: "พุธ",
  THU: "พฤหัสบดี",
  FRI: "ศุกร์",
  SAT: "เสาร์",
  SUN: "อาทิตย์",
};

export const deliveryModeLabels: Record<string, string> = {
  ON_SITE: "ON-SITE",
  HYBRID: "HYBRID",
  ONLINE: "ONLINE",
};

export const documentTypeLabels: Record<string, string> = {
  COURSE_OPENING_FORM: "ไฟล์ขอเปิดรายวิชา",
  SYLLABUS: "Course Syllabus",
  INVITATION_LETTER: "หนังสือเชิญ",
  OTHER: "เอกสารอื่น ๆ",
};

export type Props = { payload: DashboardPayload };
export type QueueSeverityKey = "all" | QueueKind;
export type SortOption = "default" | "course_status" | "occupancy" | "next_action";
export type CourseEditDraft = {
  title: string;
  category: string;
  provider: string;
  instructor: string;
  coordinatorName: string;
  coordinatorEmail: string;
  coordinatorPhone: string;
  coordinatorLineId: string;
  mcvJoinCode: string;
  deliveryMode: DeliveryMode;
  capacity: number | null;
  enrolled: number;
  weeks: number;
  courseStatus: string;
  documentsStatus: string;
  invitationStatus: string;
  mcvStatus: string;
  notes: string;
  workflow: Array<{ key: string; status: WorkflowTaskStatus }>;
};

export const readinessOptions: Array<{ key: OperationalReadinessKey; label: string; tone: "green" | "blue" | "orange" | "red" }> = [
  { key: "READY", label: "พร้อมดำเนินการ", tone: "green" },
  { key: "IN_PROGRESS", label: QUEUE_META.IN_PROGRESS.label, tone: "blue" },
  { key: "WAITING", label: QUEUE_META.WAITING.label, tone: "orange" },
  { key: "BLOCKED", label: QUEUE_META.BLOCKED.label, tone: "red" },
];

export function formatSession(session: DashboardCourse["sessions"][number]) {
  return `${dayNames[session.dayOfWeek] ?? session.dayOfWeek} ${session.startTime}–${session.endTime}${sessionValidity(session)}`;
}

export function sessionValidity(session: DashboardCourse["sessions"][number]) {
  if (!session.validFrom && !session.validUntil) return "";
  return ` · ${session.validFrom ? formatDate(session.validFrom, session.timezone ?? "Asia/Bangkok") : "เริ่มต้นเทอม"} ถึง ${session.validUntil ? formatDate(session.validUntil, session.timezone ?? "Asia/Bangkok") : "สิ้นสุดเทอม"}`;
}

export function scheduleSummary(course: DashboardCourse) {
  return course.sessions.map(formatSession).join(" · ");
}

/**
 * Tone for the four operational status columns.
 *
 * This used to recognise one finished value — "เปิดแล้ว" — and let every other
 * wording fall through to neutral on a substring guess. That painted
 * "เอกสารครบ" and "ลงนามแล้ว" the same grey as "ยังไม่เปิด", so a reader could
 * not tell a finished step from one that had not started, and "ลงนามแล้ว" came
 * out grey here while the MOU page painted the same word green.
 *
 * Each known value now names its own tone: green once the step is done, blue
 * when it is someone else's turn, orange while it waits. Anything a future
 * sheet introduces still falls back to neutral rather than being guessed at.
 */
export const COURSE_STATUS_TONE: Record<string, string> = {
  "เปิดแล้ว": "tone-green",
  "เอกสารครบ": "tone-green",
  "ลงนามแล้ว": "tone-green",
  "พร้อมเปิด": "tone-blue",
  "กำลังตรวจเอกสาร": "tone-orange",
  "กำลังเตรียมเปิด": "tone-orange",
  "รอเปิดรายวิชา": "tone-orange",
  "รอเอกสารผู้สอน": "tone-orange",
  "รอตรวจข้อมูลห้องเรียน": "tone-orange",
  "รอลงนาม": "tone-orange",
  "รอส่งร่างหนังสือเชิญ": "tone-orange",
  "รอแก้ไขก่อนส่งตรวจ": "tone-orange",
  "ขาด syllabus ฉบับแก้ไข": "tone-orange",
  "ยังไม่เปิด": "tone-orange",
};

export function statusClass(status: string) {
  return COURSE_STATUS_TONE[status] ?? "tone-neutral";
}

export const workflowStatusOptions: Array<{ value: WorkflowTaskStatus; label: string }> = [
  { value: "BLOCKED", label: workflowStatusLabels.BLOCKED },
  { value: "NOT_RECEIVED", label: workflowStatusLabels.NOT_RECEIVED },
  { value: "IN_PROGRESS", label: workflowStatusLabels.IN_PROGRESS },
  { value: "RECEIVED", label: workflowStatusLabels.RECEIVED },
  { value: "DONE", label: workflowStatusLabels.DONE },
  { value: "NOT_APPLICABLE", label: workflowStatusLabels.NOT_APPLICABLE },
  { value: "UNKNOWN", label: workflowStatusLabels.UNKNOWN },
];

export const courseStatusOptions: string[] = Object.values(ELECTIVE_STATUS.course);
export const documentsStatusOptions: string[] = Object.values(ELECTIVE_STATUS.documents);
export const invitationStatusOptions: string[] = Object.values(ELECTIVE_STATUS.invitation);
export const mcvStatusOptions: string[] = Object.values(ELECTIVE_STATUS.mcv);
export const deliveryModeOptions: Array<{ value: DeliveryMode; label: string }> = [
  { value: "ON_SITE", label: "ON-SITE" },
  { value: "HYBRID", label: "HYBRID" },
  { value: "ONLINE", label: "ONLINE" },
];
export const electiveStorageKey = "nextlink.elective.courses.v1";

export function workflowStatusClass(status: WorkflowTaskStatus) {
  if (status === "DONE" || status === "RECEIVED") return "tone-green";
  if (status === "BLOCKED") return "tone-red";
  if (status === "NOT_RECEIVED" || status === "IN_PROGRESS" || status === "UNKNOWN") return "tone-orange";
  return "tone-neutral";
}

export function courseOccupancy(course: DashboardCourse) {
  return course.capacity !== null && course.capacity > 0 ? Math.round((course.enrolled / course.capacity) * 100) : null;
}

export function workflowStatusText(task: DashboardWorkflowTask) {
  return workflowStatusLabels[task.status];
}

export function workflowRawStatus(task: DashboardWorkflowTask) {
  const rawStatus = task.rawStatus?.trim();
  return rawStatus && rawStatus !== workflowStatusLabels[task.status] ? rawStatus : null;
}

export function toCourseEditDraft(course: DashboardCourse): CourseEditDraft {
  return {
    title: course.title,
    category: course.category,
    provider: course.provider,
    instructor: course.instructor,
    coordinatorName: course.coordinator?.name ?? "",
    coordinatorEmail: course.coordinator?.email ?? "",
    coordinatorPhone: course.coordinator?.phone ?? "",
    coordinatorLineId: course.coordinator?.lineId ?? "",
    mcvJoinCode: course.mcvJoinCode ?? "",
    deliveryMode: course.deliveryMode,
    capacity: course.capacity,
    enrolled: course.enrolled,
    weeks: course.weeks,
    courseStatus: course.status.course,
    documentsStatus: course.status.documents,
    invitationStatus: course.status.invitation,
    mcvStatus: course.status.mcv,
    notes: course.notes ?? "",
    workflow: course.workflow.map((task) => ({ key: task.key, status: task.status })),
  };
}

export function workflowProgress(course: DashboardCourse) {
  const total = course.workflow.length;
  const complete = course.workflow.filter(isWorkflowComplete).length;
  return { complete, total };
}