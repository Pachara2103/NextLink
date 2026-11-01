import { getJson } from "./http";
import type { FridayListQuery, FridayListResponse } from "./friday-activity";

export type FridayReportQuery = Omit<FridayListQuery, "page" | "pageSize">;
export type FridayAnalytics = {
  source: "postgresql";
  summary: FridayListResponse["summary"];
  statusCounts: { key: string; count: number }[];
  formatCounts: { key: string; count: number }[];
  companies: { id: string; name: string; count: number }[];
  months: { month: string; held: number; planned: number }[];
  undatedSessions: number;
  trend: { academicYear: number; summary: FridayListResponse["summary"] | null }[];
  lastUpdated: string | null;
};
export type EvaluationDimension = {
  key: "content" | "speaker" | "application" | "overall";
  label: string;
  count: number;
  total: number;
  mean: number | null;
  distribution: { score: number; count: number }[];
};
export type EvaluationReport = {
  id: string;
  noteId: string;
  activityId: string | null;
  title: string;
  companies: { id: string; name: string }[];
  kind: "student" | "company" | "reported" | "unmatched";
  mapping: "confirmed" | "provisional" | "conflict" | "invalid" | "unmatched";
  counted: boolean;
  excludedReason: string | null;
  reference: string;
  responseCount: number | null;
  dimensions: EvaluationDimension[];
  reportedScore: number | null;
  feedback: string | null;
  updatedAt: string;
};
export type FridayEvaluations = {
  source: "postgresql";
  format: "legacy-workbook-notes-v1";
  summary: {
    studentResponses: number;
    studentActivities: number;
    companyResponses: number;
    companyActivities: number;
    provisionalReports: number;
    invalidReports: number;
    duplicateReports: number;
    unmatchedReports: number;
    dimensions: EvaluationDimension[];
  };
  items: EvaluationReport[];
  total: number;
  page: number;
  pageSize: number;
  includeProvisional: boolean;
  lastUpdated: string | null;
};

export function fridayReportUrl(kind: "analytics" | "evaluations", query: FridayReportQuery & { page?: number; pageSize?: number; includeProvisional?: boolean; kind?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  return `/api/v1/friday-activities/${kind}?${params}`;
}
export const fridayReportingService = {
  analytics: (query: FridayReportQuery) => getJson<FridayAnalytics>(fridayReportUrl("analytics", query)),
  evaluations: (query: FridayReportQuery & { page: number; pageSize: number; includeProvisional: boolean; kind?: string }) => getJson<FridayEvaluations>(fridayReportUrl("evaluations", query)),
};
