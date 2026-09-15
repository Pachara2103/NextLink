import { mockDashboardData } from "./mock-data";
import { selectElectivePeriod } from "./academic-data";
import { DEFAULT_ACADEMIC_PERIOD, type AcademicPeriod } from "./academic-period";

/** UI migration uses synthetic fixtures. Never select a database from frontend env. */
export async function getElectiveDashboardData(period: AcademicPeriod = DEFAULT_ACADEMIC_PERIOD) {
  return selectElectivePeriod(mockDashboardData, period);
}
