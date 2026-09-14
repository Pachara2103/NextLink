import { MOU_STATUS_TONE } from "@/features/dashboard/lib/mou-statuses";
import type { MouCompany, MouPayload } from "@/features/dashboard/lib/types";

export type Props = { payload: MouPayload };
export type FilterValue = "all" | string;
export type SortOption = "default" | "document_status" | "next_action" | "company";
export type MouEditDraft = {
  companyThai: string;
  companyEnglish: string;
  shortNames: string;
  documentStatus: string;
  revised: MouCompany["revised"];
  template: string;
  revisionRequest: string;
  revisionSentDate: string;
  legalReviewResult: string;
  reviewStatus: MouCompany["reviewStatus"];
  authorizationRequest: string;
  authorizationSentDate: string;
  authorizationStatus: string;
  coordinator: string;
  note: string;
};

export const mouStorageKey = "nextlink.mou.companies.v1";
export const authorizationStatusOptions = ["มอบอำนาจแล้ว", "กำลังดำเนินการ", "รอเอกสาร", "ยังไม่เริ่ม"];

export function toneClass(tone: string) {
  if (tone === "green") return "tone-green";
  if (tone === "blue") return "tone-blue";
  if (tone === "purple") return "tone-purple";
  if (tone === "orange") return "tone-orange";
  if (tone === "red") return "tone-red";
  return "tone-neutral";
}

export function statusClass(status: string) {
  if (status === "มอบอำนาจแล้ว") return "tone-green";
  if (status === "กำลังดำเนินการ") return "tone-blue";
  if (status === "รอเอกสาร") return "tone-orange";
  if (status === "ยังไม่เริ่ม") return "tone-neutral";
  return toneClass(MOU_STATUS_TONE[status as keyof typeof MOU_STATUS_TONE] ?? "neutral");
}

export function toMouEditDraft(company: MouCompany): MouEditDraft {
  return {
    companyThai: company.companyThai,
    companyEnglish: company.companyEnglish,
    shortNames: company.shortNames.join(", "),
    documentStatus: company.documentStatus,
    revised: company.revised,
    template: company.template ?? "",
    revisionRequest: company.revisionRequest ?? "",
    revisionSentDate: company.revisionSentDate ?? "",
    legalReviewResult: company.legalReviewResult ?? "",
    reviewStatus: company.reviewStatus,
    authorizationRequest: company.authorizationRequest ?? "",
    authorizationSentDate: company.authorizationSentDate ?? "",
    authorizationStatus: company.authorizationStatus ?? "",
    coordinator: company.coordinator ?? "",
    note: company.note ?? "",
  };
}

export function optionalMouValue(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}