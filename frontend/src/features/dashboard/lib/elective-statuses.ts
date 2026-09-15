
// Shared labels for dashboard filters, validators and editors; no ORM dependency.
export const ELECTIVE_STATUS = {
  course: { OPEN: "เปิดแล้ว", READY: "พร้อมเปิด", REVIEWING: "กำลังตรวจเอกสาร", WAITING: "รอเปิดรายวิชา", DRAFT: "ร่าง" },
  documents: { COMPLETE: "เอกสารครบ", WAITING_INSTRUCTOR: "รอเอกสารผู้สอน", MISSING_SYLLABUS: "ขาด syllabus ฉบับแก้ไข", WAITING_ROOM: "รอตรวจข้อมูลห้องเรียน" },
  invitation: { SIGNED: "ลงนามแล้ว", WAITING_SIGNATURE: "รอลงนาม", WAITING_DRAFT: "รอส่งร่างหนังสือเชิญ", NEEDS_CORRECTION: "รอแก้ไขก่อนส่งตรวจ" },
  mcv: { OPEN: "เปิดแล้ว", PREPARING: "กำลังเตรียมเปิด", NOT_OPEN: "ยังไม่เปิด" },
} as const;

export function statusCode<T extends Record<string, string>>(labels: T, label: string): keyof T {
  const key = Object.keys(labels).find(key => labels[key] === label);
  if (!key) throw new Error(`สถานะไม่ถูกต้อง: ${label}`);
  return key;
}
