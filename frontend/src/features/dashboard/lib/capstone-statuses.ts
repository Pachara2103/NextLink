import type { TeamPhase, TopicStatus } from "./capstone-types";

export const TOPIC_STATUSES: Record<TopicStatus, { label: string; tone: string }> = {
  draft: { label: "ร่าง", tone: "tone-neutral" },
  open: { label: "เปิดรับ", tone: "tone-green" },
  closed: { label: "ปิดรับ", tone: "tone-blue" },
  withdrawn: { label: "ถอนหัวข้อ", tone: "tone-red" },
};
export const TEAM_PHASES: Record<TeamPhase, string> = {
  proposal: "เตรียม Proposal", development: "กำลังพัฒนา", testing: "ทดสอบและประเมิน",
  completed: "เสร็จสิ้น", terminated: "ยุติ",
};
