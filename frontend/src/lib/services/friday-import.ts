import { getJson, patchJson, postForm, postJson } from "@/lib/services/http";

export type FridayImportDecision = "pending" | "create" | "update" | "skip";
export type FridayImportYearConvention = "AD" | "BE";

export interface FridayImportNormalized {
  sourceKey: string | null;
  academicYear: number | null;
  term: "FIRST" | "SECOND" | "SUMMER" | null;
  title: string;
  companyIds: string[];
  companyName: string;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  format: string;
  status: string | null;
  capacity: number | null;
  booked: number | null;
  attended: number | null;
}

export interface FridayImportRow {
  id: string;
  rowNumber: number;
  sheetName: string;
  raw: Record<string, string | null>;
  normalized: FridayImportNormalized;
  errors: string[];
  mappingStatus: "matched" | "needs_mapping";
  candidateActivities: { id: string; title: string; revision: number }[];
  decision: FridayImportDecision;
  targetActivityId: string | null;
  targetActivityRevision: number | null;
  committedActivityId: string | null;
}

export interface FridayImportReceipt {
  id: string;
  batchId: string;
  inserted: number;
  updated: number;
  skipped: number;
  pending: number;
  rejected: number;
  unchanged: number;
  activityIds: string[];
  committedAt: string;
}

export interface FridayImportBatch {
  id: string;
  filename: string;
  revision: number;
  status: "preview" | "committed";
  yearConvention: FridayImportYearConvention;
  sourceHash: string;
  rows: FridayImportRow[];
  receipt: FridayImportReceipt | null;
  idempotentReplay: boolean;
}

export interface FridayImportReview {
  expectedBatchRevision: number;
  decision: Exclude<FridayImportDecision, "pending">;
  companyIds: string[];
  targetActivityId?: string;
  targetActivityRevision?: number;
  normalized?: Partial<Omit<FridayImportNormalized, "companyIds" | "companyName">>;
}

const IMPORTS = "/api/v1/friday-activities/imports";

export const fridayImportService = {
  preview(file: File, yearConvention: FridayImportYearConvention) {
    const form = new FormData();
    form.append("file", file);
    form.append("yearConvention", yearConvention);
    return postForm<FridayImportBatch>(`${IMPORTS}/preview`, form, {
      timeoutMs: 60_000,
    });
  },

  get: (id: string) =>
    getJson<FridayImportBatch>(`${IMPORTS}/${encodeURIComponent(id)}`),

  review: (batchId: string, rowId: string, review: FridayImportReview) =>
    patchJson<FridayImportBatch>(
      `${IMPORTS}/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(rowId)}`,
      review,
    ),

  commit: (id: string, expectedBatchRevision: number, idempotencyKey: string) =>
    postJson<FridayImportBatch>(
      `${IMPORTS}/${encodeURIComponent(id)}/commit`,
      { expectedBatchRevision, idempotencyKey },
      { timeoutMs: 60_000 },
    ),
};

export const FRIDAY_IMPORT_TEMPLATE_HEADERS = [
  "sourceKey", "academicYear", "term", "title", "companyId", "companyName",
  "sessionDate", "startTime", "endTime", "location", "format", "capacity",
  "booked", "attended", "status",
] as const;
