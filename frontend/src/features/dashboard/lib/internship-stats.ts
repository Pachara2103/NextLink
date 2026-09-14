import type { InternshipApplication, InternshipCompany, InternshipPosition } from "./types";
import type { QueueKind } from "./queue";

export type IntakeKind = "complete" | "short" | "over" | "none" | "mixed";
export type CompanyStats = {
  company: InternshipCompany; picksByRank: number[]; totalPicks: number; firstPicks: number;
  declared: number; accepted: number; gap: number; fillRate: number; competition: number;
  shortfall: number; surplus: number; unfilledPositions: number; intake: IntakeKind;
};
export const RANKS = [1, 2, 3, 4, 5];
export function applicationRanks(applications: InternshipApplication[]) {
  return [...new Set(applications.flatMap(a => a.choices.map(c => c.rank)))].filter(r => Number.isSafeInteger(r) && r > 0).sort((a, b) => a - b);
}
export const INTAKE_META: Record<IntakeKind, { label: string; tone: string }> = {
  complete: { label: "รับครบตามที่แจ้ง", tone: "tone-green" },
  short: { label: "รับไม่ครบ", tone: "tone-orange" },
  over: { label: "รับเกินที่แจ้ง", tone: "tone-purple" },
  none: { label: "ยังไม่รับเลย", tone: "tone-red" },
  mixed: { label: "บางตำแหน่งขาด / บางตำแหน่งเกิน", tone: "tone-orange" },
};
export const sumDeclared = (positions: InternshipPosition[]) => positions.reduce((n, p) => n + p.declaredIntake, 0);
export const sumAccepted = (positions: InternshipPosition[]) => positions.reduce((n, p) => n + p.accepted, 0);
export function intakeKind(declared: number, accepted: number): IntakeKind {
  if (declared > 0 && accepted === 0) return "none";
  return accepted < declared ? "short" : accepted > declared ? "over" : "complete";
}
export function buildStats(companies: InternshipCompany[], applications: InternshipApplication[]): CompanyStats[] {
  const picks = new Map<string, number[]>();
  for (const application of applications) for (const choice of application.choices) {
    const row = picks.get(choice.companyId) ?? [0, 0, 0, 0, 0, 0];
    row[choice.rank] = (row[choice.rank] ?? 0) + 1; picks.set(choice.companyId, row);
  }
  return companies.map(company => {
    const picksByRank = picks.get(company.id) ?? [0, 0, 0, 0, 0, 0];
    const totalPicks = picksByRank.reduce((n, count) => n + count, 0);
    const declared = sumDeclared(company.positions), accepted = sumAccepted(company.positions);
    const shortfall = company.positions.reduce((n, p) => n + Math.max(p.declaredIntake - p.accepted, 0), 0);
    const surplus = company.positions.reduce((n, p) => n + Math.max(p.accepted - p.declaredIntake, 0), 0);
    const unfilledPositions = company.positions.filter(p => p.declaredIntake > 0 && p.accepted === 0).length;
    return { company, picksByRank, totalPicks, firstPicks: picksByRank[1], declared, accepted,
      gap: accepted - declared, fillRate: declared ? Math.round(accepted / declared * 100) : 0,
      competition: declared ? totalPicks / declared : 0, shortfall, surplus, unfilledPositions,
      intake: shortfall && surplus ? "mixed" : intakeKind(declared, accepted),
    };
  });
}
export function queueKind(stats: CompanyStats): QueueKind | null {
  if (stats.company.mouStatus === "ไม่พบ MOU" || stats.unfilledPositions > 0) return "BLOCKED";
  if (stats.shortfall > 0) return "WAITING";
  if (stats.surplus > 0) return "IN_PROGRESS";
  return null;
}

/** A blank headcount remains zero in the demo. Valid exponent notation keeps its value. */
export function toCount(value: string): number {
  const number = value.trim() === "" ? 0 : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("จำนวนคนต้องเป็นจำนวนเต็มตั้งแต่ 0 และไม่เกินค่าที่ระบบรองรับ");
  return number;
}
