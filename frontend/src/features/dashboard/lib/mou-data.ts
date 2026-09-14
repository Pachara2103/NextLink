import rawDataset from "@/features/dashboard/data/mou-companies.json";
import type { MouCompany, MouPayload } from "@/features/dashboard/lib/types";

const companies = rawDataset.companies as MouCompany[];

export const mockMouData: MouPayload = {
  dataset: rawDataset.dataset,
  sourceFile: rawDataset.sourceFile,
  sheetName: rawDataset.sheetName,
  lastUpdated: rawDataset.lastUpdated,
  timezone: rawDataset.timezone,
  isMock: true,
  source: "mock",
  companies,
};

export async function getMouDashboardData(): Promise<MouPayload> {
  // The attached workbook was converted to synthetic demo rows before being
  // included in the public deployment. Keeping this mapper separate makes a
  // future Google Sheets/PostgreSQL importer replaceable.
  return mockMouData;
}
