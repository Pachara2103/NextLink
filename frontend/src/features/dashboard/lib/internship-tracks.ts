import type { InternshipPayload, InternshipPosition, InternshipTrack } from "./types";

export const INTERNSHIP_TRACKS = {
  "ฝึกงาน": { path: "/dashboard/internship", title: "ฝึกงาน", storageKey: "nextlink.internship.companies.v2" },
  "สหกิจศึกษา": { path: "/dashboard/cooperative", title: "สหกิจศึกษา", storageKey: "nextlink.cooperative.companies.v1" },
} satisfies Record<InternshipTrack, { path: string; title: string; storageKey: string }>;

export type TrackIntakes = Record<InternshipTrack, Record<string, InternshipPosition[]>>;

/** Demand and intake must belong to the same cohort before any KPI is calculated. */
export function selectInternshipTrack(source: Omit<InternshipPayload, "track">, intakes: TrackIntakes, track: InternshipTrack): InternshipPayload {
  const applications = source.applications.filter(a => a.track === track);
  const chosenCompanies = new Set(applications.flatMap(a => a.choices.map(c => c.companyId)));
  const companies = source.companies.flatMap(company => {
    const positions = intakes[track][company.id];
    if (!positions || positions.some(p => !p.name || !Number.isSafeInteger(p.declaredIntake) || !Number.isSafeInteger(p.accepted) || p.declaredIntake < 0 || p.accepted < 0)) {
      throw new Error(`Missing or invalid ${track} intake for ${company.id}`);
    }
    if (!chosenCompanies.has(company.id) && !positions.some(p => p.declaredIntake || p.accepted)) return [];
    return [{ ...company, positions: positions.map(p => ({ ...p })) }];
  });
  return { ...source, track, dataset: `${source.dataset}-${track}`, companies, applications };
}
