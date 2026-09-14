import { formatNumber } from "@/features/dashboard/lib/format";
import { type CompanyStats } from "@/features/dashboard/lib/internship-stats";
import { MOU_DOCUMENT_STATUSES, MOU_STATUS_TONE, type MouDocumentStatus } from "@/features/dashboard/lib/mou-statuses";
import type { InternshipCompany, InternshipMouStatus, InternshipPayload, } from "@/features/dashboard/lib/types";

export type Props = { payload: InternshipPayload };
export type FilterValue = "all" | string;
export type SortOption = "demand" | "first_choice" | "shortfall" | "name";

export type CompanyEditDraft = {
  name: string;
  shortName: string;
  industry: string;
  coordinator: string;
  note: string;
  positions: { name: string; declaredIntake: string; accepted: string }[];
};
export const RANK_LABELS: Record<number, string> = { 1: "อันดับ 1", 2: "อันดับ 2", 3: "อันดับ 3", 4: "อันดับ 4", 5: "อันดับ 5" };

export const mouStatusOptions: InternshipMouStatus[] = [...MOU_DOCUMENT_STATUSES, "กำลังประสาน", "ไม่พบ MOU"];

export function mouTone(status: string) {
  const known = MOU_STATUS_TONE[status as MouDocumentStatus];
  if (known) return `tone-${known}`;
  if (status === "ไม่พบ MOU") return "tone-red";
  if (status === "กำลังประสาน") return "tone-blue";
  return "tone-neutral";
}

export function toEditDraft(company: InternshipCompany): CompanyEditDraft {
  return {
    name: company.name,
    shortName: company.shortName,
    industry: company.industry,
    coordinator: company.coordinator ?? "",
    note: company.note ?? "",
    positions: company.positions.map((position) => ({
      name: position.name,
      declaredIntake: String(position.declaredIntake),
      accepted: String(position.accepted),
    })),
  };
}

export function gapLabel(stats: CompanyStats) {
  if (stats.declared === 0 && stats.accepted === 0) return "ยังไม่แจ้งจำนวน";
  if (stats.shortfall > 0 && stats.surplus > 0) return `ขาด ${formatNumber(stats.shortfall)} / เกิน ${formatNumber(stats.surplus)} คน ต่างตำแหน่ง`;
  if (stats.gap === 0) return "ครบพอดี";
  return stats.gap > 0 ? `เกิน ${formatNumber(stats.gap)}` : `ขาด ${formatNumber(Math.abs(stats.gap))}`;
}