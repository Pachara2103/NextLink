import rawDataset from "../data/elective-courses.json";
import workflowDataset from "../data/elective-workflow.json";
import history from "../data/academic-history.json";
import type { DashboardCourse, DashboardDocument, DashboardPayload, DashboardWorkflowTask, WorkflowTaskStatus } from "./types";

type WorkflowEntry = (typeof workflowDataset.courses)[keyof typeof workflowDataset.courses];

const workflowEntries = workflowDataset.courses as Record<string, WorkflowEntry>;

function enrichCourse(course: DashboardCourse): DashboardCourse {
  const entry = workflowEntries[course.id];
  const workflow: DashboardWorkflowTask[] = (entry?.tasks ?? []).map((task) => ({
    key: task.key,
    label: task.label,
    status: task.status as WorkflowTaskStatus,
    rawStatus: task.rawStatus ?? null,
    detail: (task as { detail?: string }).detail ?? null,
    referenceUrl: (task as { referenceUrl?: string }).referenceUrl ?? null,
  }));
  const documents: DashboardDocument[] = [
    {
      type: "COURSE_OPENING_FORM",
      filename: `${course.courseCode}-opening-form.docx`,
      status: "APPROVED",
      externalUrl: entry?.documents?.course_opening_form?.externalUrl ?? null,
    },
    {
      type: "SYLLABUS",
      filename: `${course.courseCode}-syllabus.pdf`,
      status: course.status.documents === "เอกสารครบ" ? "APPROVED" : "DRAFT",
      externalUrl: entry?.documents?.course_syllabus?.externalUrl ?? null,
    },
  ];

  return {
    ...course,
    workflow,
    documents,
    mcvJoinCode: entry?.mcvJoinCode ?? null,
    source: {
      system: workflowDataset.sourceSystem,
      spreadsheetId: workflowDataset.sourceSpreadsheetId,
      sheetName: workflowDataset.sourceSheetName,
      rowNumber: entry?.sourceRowNumber ?? null,
      sourceKey: entry?.sourceKey ?? null,
    },
  };
}

export const mockDashboardData: DashboardPayload = {
  dataset: rawDataset.dataset,
  lastUpdated: rawDataset.lastUpdated,
  timezone: rawDataset.timezone,
  isMock: true,
  source: "mock",
  courses: [...rawDataset.courses, ...history.electiveCourses].map(course => enrichCourse(course as DashboardCourse)),
};
