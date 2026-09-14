import type { FridayActivity, StudentEvaluation } from "../lib/friday-activity";

// Entirely synthetic: source workbooks inform field names only. No student/contact data.
const responses = (prefix: string, count: number): StudentEvaluation[] => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-student-${index + 1}`,
  ratings: { content: index % 3 === 0 ? 4 : 5, speaker: index % 2 === 0 ? 4 : 5, application: index % 4 === 0 ? 3 : 4, overall: index % 3 === 0 ? 4 : 5 },
  suggestedTopic: index === 0 ? "อยากเรียนรู้การนำ AI ไปใช้กับงานจริง (ข้อความตัวอย่าง)" : "",
  suggestion: index === 1 ? "อยากให้เพิ่มเวลาสำหรับฝึกปฏิบัติ (ข้อความตัวอย่าง)" : "",
}));
const makeActivity = (id: string, overrides: Partial<FridayActivity>): FridayActivity => ({
  id, academicYear: 2569, term: "1", sequence: 1,
  companyId: "demo-company-cloud", companyName: "บริษัทตัวอย่าง คลาวด์แล็บ",
  title: "จากแนวคิดสู่ระบบ Cloud ที่ใช้งานจริง", description: "เรียนรู้แนวคิดการออกแบบระบบ พร้อมแลกเปลี่ยนประสบการณ์กับทีมวิศวกร (กิจกรรมสมมติ)",
  domain: "Cloud & Infrastructure", format: "talk", date: "2026-08-07", startTime: "13:00", endTime: "16:00", location: "401 ตึกร้อยปี",
  status: "completed", capacity: 60, booked: 55, attended: 52, reportedScore: null, publicationUrl: "", notes: "",
  studentEvaluations: responses(id, 12), companyEvaluations: [{ id: `${id}-company-1`, experience: "นิสิตมีส่วนร่วมและถามคำถามต่อเนื่อง (ข้อความตัวอย่าง)", suggestedTopic: "การออกแบบระบบที่รองรับผู้ใช้งานจำนวนมาก (ข้อความตัวอย่าง)", improvement: "เพิ่มเวลาสำหรับช่วงถามตอบ (ข้อความตัวอย่าง)" }],
  ...overrides,
});

export const fridayActivities: FridayActivity[] = [
  makeActivity("friday-demo-69-1-01", { reportedScore: 4.6 }),
  makeActivity("friday-demo-69-1-02", { sequence: 2, companyId: "demo-company-data", companyName: "บริษัทตัวอย่าง ดาต้าสตูดิโอ", title: "Workshop วิเคราะห์ข้อมูลด้วย Python", domain: "Data & AI", format: "workshop", date: "2026-08-14", location: "402 ตึกร้อยปี", capacity: 40, booked: 44, attended: 43, studentEvaluations: responses("data", 18) }),
  makeActivity("friday-demo-69-1-03", { sequence: 3, title: "เยี่ยมชมทีมพัฒนาระบบ Cloud", format: "visit", date: "2026-08-21", location: "สำนักงานบริษัทตัวอย่าง คลาวด์แล็บ", capacity: 30, booked: 28, attended: null, studentEvaluations: [], companyEvaluations: [], notes: "รอยืนยันจำนวนผู้เข้าร่วมหลังจบกิจกรรม (ตัวอย่าง)" }),
  makeActivity("friday-demo-69-1-04", { sequence: 4, companyId: "demo-company-security", companyName: "บริษัทตัวอย่าง ซีเคียวเทค", title: "รู้ทันภัยไซเบอร์ในชีวิตประจำวัน", domain: "Cybersecurity", date: "2026-08-28", location: "403 ตึกร้อยปี", capacity: null, booked: 48, attended: 45, studentEvaluations: responses("security", 8), companyEvaluations: [] }),
  makeActivity("friday-demo-69-1-05", { sequence: 5, companyId: "demo-company-data", companyName: "บริษัทตัวอย่าง ดาต้าสตูดิโอ", title: "เตรียมความพร้อมสู่สายงาน Data", domain: "Data & AI", date: "2026-09-18", status: "scheduled", capacity: 60, booked: 32, attended: null, studentEvaluations: [], companyEvaluations: [] }),
  makeActivity("friday-demo-69-1-06", { sequence: 6, format: "hackathon", rawFormat: "Hackatron", companyId: "demo-company-product", companyName: "บริษัทตัวอย่าง โปรดักต์เวิร์กส์", title: "ออกแบบประสบการณ์ผู้ใช้จากโจทย์จริง", domain: "Product & Design", date: null, startTime: "", endTime: "", location: "", status: "scheduled", capacity: null, booked: null, attended: null, studentEvaluations: [], companyEvaluations: [] }),
  makeActivity("friday-demo-69-1-07", { sequence: 7, title: "พื้นฐานระบบเครือข่ายสำหรับนักพัฒนา", date: "2026-09-04", status: "cancelled", booked: 0, attended: null, studentEvaluations: [], companyEvaluations: [], notes: "บริษัทยกเลิกกิจกรรมรอบนี้ (ตัวอย่าง)" }),
  makeActivity("friday-demo-68-2-01", { academicYear: 2568, term: "2", date: "2026-02-06", title: "จากแนวคิดสู่ระบบ Cloud ที่ใช้งานจริง" }),
  makeActivity("friday-demo-68-1-01", { academicYear: 2568, date: "2025-08-08", title: "เส้นทางอาชีพวิศวกรซอฟต์แวร์" }),
  makeActivity("friday-demo-67-1-01", { academicYear: 2567, date: "2024-08-09", title: "เริ่มต้นสร้างเว็บแอปพลิเคชัน" }),
  makeActivity("friday-demo-66-1-01", { academicYear: 2566, date: "2023-08-11", title: "รู้จักการทำงานในบริษัทเทคโนโลยี", attended: 0, booked: null, studentEvaluations: [], companyEvaluations: [], notes: "ตัวอย่างกรณีบันทึกผู้เข้าร่วมเป็นศูนย์ ต้องไม่แสดงเป็นข้อมูลที่หายไป" }),
];
