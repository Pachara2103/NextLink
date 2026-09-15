import type { MouCompany } from "./types";
import { MOU_SIGNED_STATUSES } from "./mou-statuses";
import type { QueueKind } from "./queue";

export const REVIEW_STATUSES: Record<MouCompany["reviewStatus"], string> = {
  pending: "รอส่งตรวจ", in_progress: "อยู่ระหว่างตรวจ", approved: "ตรวจผ่านแล้ว",
  needs_changes: "ต้องแก้ไข", not_required: "ไม่ต้องตรวจแก้",
};
export const isSigned = (company: MouCompany) => MOU_SIGNED_STATUSES.has(company.documentStatus);
export const isPending = (company: MouCompany) => !isSigned(company) && company.documentStatus !== "ปฏิเสธการลงนาม";

export function queueKind(company: MouCompany): QueueKind {
  if (company.documentStatus === "นิติกรบริษัท" || company.documentStatus === "แก้ไขที่นิติกรจุฬาฯ") return "BLOCKED";
  if (company.documentStatus === "รอลงนาม" || company.documentStatus === "ยังไม่ได้ลงนาม") return "WAITING";
  return "IN_PROGRESS";
}
export function nextAction(company: MouCompany) {
  if (company.documentStatus === "นิติกรบริษัท") return "รอผลตรวจ/การตอบกลับจากนิติกรบริษัท";
  if (company.documentStatus === "แก้ไขที่นิติกรจุฬาฯ") return "ติดตามการตรวจแก้กับนิติกรจุฬาฯ";
  if (company.documentStatus === "มอบอำนาจ") return "ติดตามเอกสารและสถานะมอบอำนาจ";
  if (company.documentStatus === "รอลงนาม") return "ติดตามการลงนามเอกสาร MOU";
  if (company.documentStatus === "ยังไม่ได้ลงนาม") return "เตรียมเอกสารและนัดหมายลงนาม";
  if (company.documentStatus === "ปฏิเสธการลงนาม") return "บันทึกเหตุผลและประเมินการดำเนินการต่อ";
  return "ตรวจสอบข้อมูลให้เป็นปัจจุบัน";
}
export function processStatus(company: MouCompany) {
  return [
    { label: "Template", done: Boolean(company.template) },
    { label: "ตรวจแก้", done: company.reviewStatus === "approved" || company.reviewStatus === "not_required" },
    { label: "มอบอำนาจ", done: company.authorizationStatus === "มอบอำนาจแล้ว" },
    { label: "ลงนาม", done: isSigned(company) },
  ];
}
