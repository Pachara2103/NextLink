import rawDataset from "@/features/dashboard/data/internship-companies.json";
import trackIntakes from "@/features/dashboard/data/internship-track-intakes.json";
import type { InternshipApplication, InternshipCompany, InternshipPayload, InternshipTrack } from "@/features/dashboard/lib/types";
import { selectInternshipTrack } from "./internship-tracks";
import { internshipPeriodSource } from "./academic-data";
import { DEFAULT_ACADEMIC_PERIOD, type AcademicPeriod } from "./academic-period";

const companies = rawDataset.companies as InternshipCompany[];
const applications = rawDataset.applications as InternshipApplication[];

const mockInternshipData: Omit<InternshipPayload, "track"> = {
  dataset: rawDataset.dataset,
  sourceFile: rawDataset.sourceFile,
  sheetName: rawDataset.sheetName,
  lastUpdated: trackIntakes.lastUpdated,
  timezone: rawDataset.timezone,
  isMock: true,
  source: "mock",
  companies,
  applications,
};

export async function getInternshipDashboardData(track: InternshipTrack, period: AcademicPeriod = DEFAULT_ACADEMIC_PERIOD): Promise<InternshipPayload> {
  // Keep the mapper separate so a future Google Sheet/PostgreSQL importer can
  // preserve raw rows and replace this mock source without changing the UI.
  const selected = internshipPeriodSource(mockInternshipData, trackIntakes.tracks, period);
  return selectInternshipTrack(selected.source as Omit<InternshipPayload, "track">, selected.intakes, track);
}
