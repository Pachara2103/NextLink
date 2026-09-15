export type TopicStatus = "draft" | "open" | "closed" | "withdrawn";
export type TeamPhase = "proposal" | "development" | "testing" | "completed" | "terminated";
export type Company = { id: string; name: string; englishName: string; domain: string; address: string };
export type Professor = { id: string; name: string };
export type Student = { id: string; name: string };
export type Team = { id: string; name: string; studentIds: string[] };
export type CompanyProfessor = { id: string; companyId: string; professorId: string; role: string; source: string };
export type TeamApplication = { id: string; teamId: string; round: string; status: "active" | "withdrawn" };
export type CompanyRanking = { round: string; applicationIds: string[]; note: string; updatedAt: string | null; recordedBy: string };
export type Assignment = { id: string; teamId: string; professorIds: string[]; mentor: string; phase: TeamPhase };
export type CapstoneNote = { id: string; type: "บันทึก" | "ปัญหา" | "Feedback"; basis: "ข้อเท็จจริง" | "ความคิดเห็น"; text: string; author: string; at: string };
export type CapstoneChange = { id: string; field: string; before: string; after: string; reason: string; at: string };
export type CapstoneTopic = {
  id: string; year: string; term: "1" | "2" | "summer"; companyId: string | null; title: string; category: string; rounds: string[];
  capacity: number | null; status: TopicStatus; coordinator: string; contactRole: string;
  description: string; scope: string; deliverables: string; support: string; issue: string;
  interestKnown: boolean; applicationsKnown: boolean;
  selections: { studentId: string; round: string }[];
  applications: TeamApplication[]; rankings: CompanyRanking[]; assignments: Assignment[];
  notes: CapstoneNote[]; history: CapstoneChange[];
  milestones: { id: string; teamId: string; title: string; due: string; status: string }[];
  links: { label: string; url: string }[];
};
export type CapstoneDataset = {
  schemaVersion: 1; lastUpdated: string;
  companies: Company[]; professors: Professor[]; relationships: CompanyProfessor[];
  students: Student[]; teams: Team[]; topics: CapstoneTopic[];
};
export type CapstoneDraft = { topic: CapstoneTopic; relationships: CompanyProfessor[]; reason: string };
