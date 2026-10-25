import { ApiError, NetworkError } from "@/lib/services/http";
import type { FridayActivityRecord, FridayEditable, FridayFormat, FridayPerson, FridaySession, FridayStatus, FridayTerm } from "@/lib/services/friday-activity";
import type { AcademicPeriod } from "./academic-period";

export const LIVE_FRIDAY_STATUSES: Record<FridayStatus, string> = { draft: "ร่าง", contacting: "กำลังติดต่อ", invited: "ส่งคำเชิญแล้ว", confirmed: "ยืนยันแล้ว", in_progress: "กำลังจัด", completed: "เสร็จสิ้น", cancelled: "ยกเลิก" };
export const LIVE_FRIDAY_FORMATS: Record<FridayFormat, string> = { talk: "บรรยาย", workshop: "Workshop", visit: "เยี่ยมชม", hackathon: "Hackathon", other: "อื่น ๆ", unknown: "ยังไม่ระบุ" };
export const LIVE_FRIDAY_TRANSITIONS: Record<FridayStatus, FridayStatus[]> = { draft: ["contacting", "invited", "confirmed", "cancelled"], contacting: ["invited", "confirmed", "cancelled"], invited: ["contacting", "confirmed", "cancelled"], confirmed: ["contacting", "in_progress", "cancelled"], in_progress: ["confirmed", "completed", "cancelled"], completed: ["confirmed"], cancelled: ["draft"] };
const termToApi: Record<AcademicPeriod["term"], FridayTerm> = { "1": "FIRST", "2": "SECOND", summer: "SUMMER" };
const termToUi: Record<FridayTerm, AcademicPeriod["term"]> = { FIRST: "1", SECOND: "2", SUMMER: "summer" };
// Academic years cross the API boundary in CE exactly once. The dashboard uses BE.
export function fridayApiPeriod(period: AcademicPeriod) { return { academicYear: period.year - 543, term: termToApi[period.term] }; }
export function fridayUiPeriod(period: { academicYear: number; term: FridayTerm }): AcademicPeriod { return { year: period.academicYear + 543, term: termToUi[period.term] }; }
export function fridayNewSession(): FridaySession { return { sessionDate: null, startTime: null, endTime: null, location: null, status: "planned", capacity: null, booked: null, attended: null }; }
export function fridayNewDraft(period: AcademicPeriod, ownerUserId = ""): FridayEditable { return { ...fridayApiPeriod(period), title: "", description: null, domain: null, format: "unknown", ownerUserId, companyIds: [], people: [], sessions: [fridayNewSession()] }; }
export function fridayEditable(record: FridayActivityRecord): FridayEditable { return { academicYear: record.academicYear, term: record.term, title: record.title, description: record.description, domain: record.domain, format: record.format, ownerUserId: record.ownerUserId, companyIds: [...record.companyIds], people: record.people.map(person => ({ ...person })), sessions: record.sessions.map(session => ({ ...session })) }; }
export function fridayPersonKey(person: Pick<FridayPerson, "namespace" | "sourceId">) { return `${person.namespace}:${person.sourceId}`; }
export function fridayLiveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
    if (error.status === 403) return "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ Friday Activity กรุณาติดต่อผู้ดูแลระบบ";
    if (error.status === 409) return "มีผู้แก้ไขข้อมูลนี้แล้ว แบบฟอร์มของคุณยังอยู่ กรุณาตรวจฉบับล่าสุดก่อนบันทึกอีกครั้ง";
    if (error.status === 503) return "เซิร์ฟเวอร์ Friday Activity ยังไม่พร้อม กรุณาลองอีกครั้ง";
    if (error.detail && error.detail.length < 350 && !/^[[{<]/.test(error.detail)) return error.detail;
    return `ดำเนินการไม่สำเร็จ (HTTP ${error.status}) กรุณาตรวจข้อมูลแล้วลองใหม่`;
  }
  return error instanceof NetworkError ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่และตรวจรายการก่อนส่งซ้ำ" : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่";
}
export function fridayLiveDate(value: string | null) { if (!value) return "ยังไม่ระบุวัน"; return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T12:00:00+07:00`)); }
export function fridayLiveTimestamp(value: string | null) { if (!value) return "ยังไม่มีข้อมูล"; return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)); }
export function fridayLiveCount(value: number | null) { return value === null ? "—" : value.toLocaleString("th-TH"); }
