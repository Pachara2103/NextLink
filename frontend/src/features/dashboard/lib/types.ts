import type { MouDocumentStatusValue } from "./mou-statuses";

export type DeliveryMode = "ON_SITE" | "HYBRID" | "ONLINE";

export type WorkflowTaskStatus =
  | "RECEIVED"
  | "NOT_RECEIVED"
  | "IN_PROGRESS"
  | "DONE"
  | "BLOCKED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export type DashboardStatus = {
  course: string;
  documents: string;
  invitation: string;
  mcv: string;
};

export type DashboardSession = {
  id?: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string;
  onlineUrl?: string | null;
  timezone?: string;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type DashboardWorkflowTask = {
  key: string;
  label: string;
  status: WorkflowTaskStatus;
  rawStatus: string | null;
  detail: string | null;
  referenceUrl: string | null;
};

export type DashboardDocument = {
  type: string;
  filename: string;
  status: string;
  externalUrl: string | null;
};

export type DashboardSource = {
  system: string | null;
  spreadsheetId: string | null;
  sheetName: string | null;
  rowNumber: number | null;
  sourceKey: string | null;
};

export type DashboardContact = {
  name: string;
  email: string | null;
  lineId: string | null;
};

export type DashboardCourse = {
  id: string;
  revision?: number;
  academicYear: number;
  term: string;
  courseCode: string;
  title: string;
  category: string;
  provider: string;
  section: string;
  instructor: string;
  coordinator: DashboardContact | null;
  deliveryMode: DeliveryMode;
  sessions: DashboardSession[];
  weeks: number;
  capacity: number | null;
  enrolled: number;
  status: DashboardStatus;
  feedbackAverage: number | null;
  cancellationsOrReschedules: number;
  notes: string | null;
  workflow: DashboardWorkflowTask[];
  documents: DashboardDocument[];
  mcvJoinCode: string | null;
  source: DashboardSource;
};

export type DashboardPayload = {
  availableAcademicYears?: number[];
  dataset: string;
  lastUpdated: string | null;
  fetchedAt?: string;
  timezone: string;
  isMock: boolean;
  source: "mock" | "postgresql";
  courses: DashboardCourse[];
};

export type MouCompany = {
  id: string;
  rowNumber: number;
  companyThai: string;
  companyEnglish: string;
  shortNames: string[];
  documentStatus: MouDocumentStatusValue;
  revised: "Y" | "N";
  template: string | null;
  revisionRequest: string | null;
  revisionSentDate: string | null;
  legalReviewResult: string | null;
  reviewStatus: "pending" | "in_progress" | "approved" | "needs_changes" | "not_required";
  authorizationRequest: string | null;
  authorizationSentDate: string | null;
  authorizationStatus: string | null;
  note: string | null;
  coordinator: string | null;
  raw: Record<string, string | number | null>;
};

export type MouPayload = {
  dataset: string;
  sourceFile: string;
  sheetName: string;
  lastUpdated: string;
  timezone: string;
  isMock: boolean;
  source: "mock" | "postgresql";
  companies: MouCompany[];
};

export type InternshipTrack = "ฝึกงาน" | "สหกิจศึกษา";
export type InternshipMouStatus = MouDocumentStatusValue | "กำลังประสาน" | "ไม่พบ MOU";

/**
 * One opening a company advertised, and what it did with it.
 *
 * `declaredIntake` is what the company said it would take at the start of the
 * round; `accepted` is what it actually took. The pair is the point of the
 * dashboard, so they live together rather than in separate places that could
 * disagree.
 */
export type InternshipPosition = {
  name: string;
  declaredIntake: number;
  accepted: number;
};

export type InternshipCompany = {
  id: string;
  rowNumber: number;
  name: string;
  shortName: string;
  industry: string;
  mouStatus: InternshipMouStatus;
  coordinator: string | null;
  positions: InternshipPosition[];
  note: string | null;
  raw: Record<string, string | number | null>;
};

/**
 * A student's five ranked picks, without the student.
 *
 * The dashboard reports on companies, so nothing here identifies who applied —
 * but the ranking has to be counted from the picks themselves. Storing counts
 * per company instead would let them drift away from the choices they came
 * from.
 */
export type InternshipApplicationChoice = {
  rank: number;
  companyId: string;
  position: string;
};

export type InternshipApplication = {
  id: string;
  track: InternshipTrack;
  department: string;
  choices: InternshipApplicationChoice[];
};

export type InternshipPayload = {
  track: InternshipTrack;
  dataset: string;
  sourceFile: string;
  sheetName: string;
  lastUpdated: string;
  timezone: string;
  isMock: boolean;
  source: "mock" | "postgresql";
  companies: InternshipCompany[];
  applications: InternshipApplication[];
};
