/**
 * The pure half of the shared-plan store: the state shape, and the small
 * functions that move it.
 *
 * Split out from `plan-remote.ts` so it can be read — and tested — without a
 * network client in scope. Everything here is a plain transform on a plain
 * object; the file it came from is the one that waits on requests.
 */

import type { CourseChecklist } from "./checklist.ts";
import { emptyDocument, type PlanDocument } from "./plan-document.ts";
import { readCourse, readRoom, readSession, type PlanIndex } from "./plan-api.ts";
import type { Elective, ElectiveRoom, ElectiveSession } from "@/types";
import type { PlanPayload, TermMeta } from "./plan-types.ts";

/**
 * Everything on screen: the facts (`payload`) and the decisions (`document`).
 *
 * The split is the offline store's, kept on purpose so that every component,
 * every selector and `effective()` itself work unchanged against either store.
 * On this path the document's three edit maps stay empty for good — a course
 * added here is a row in `electives`, not an overlay on a bundled file — and
 * `index` carries the ids those rows have that the screen never shows.
 */
export type RemoteState = {
  payload: PlanPayload;
  document: PlanDocument;
  index: PlanIndex;
};

/** A correction the server knew and the optimistic screen could not. */
export type Reconcile = (state: RemoteState) => RemoteState;

/** A plan with nothing in it, for the moment before the first read returns. */
export function blankState(): RemoteState {
  const term: TermMeta = {
    id: "",
    academicYear: 0,
    season: "FIRST",
    label: "",
    shortLabel: "",
    status: "CURRENT",
  };
  const payload: PlanPayload = {
    term,
    seedRevision: "",
    dataset: "",
    lastUpdated: new Date(0).toISOString(),
    timezone: "Asia/Bangkok",
    isMock: false,
    courses: [],
    rooms: [],
  };
  return { payload, document: emptyDocument(payload), index: { termId: 0, courses: new Map() } };
}

export const withDocument = (state: RemoteState, patch: Partial<PlanDocument>): RemoteState => ({
  ...state,
  document: { ...state.document, ...patch },
});

export const withCourses = (state: RemoteState, courses: PlanPayload["courses"]): RemoteState => ({
  ...state,
  payload: { ...state.payload, courses },
});

export const withRooms = (state: RemoteState, rooms: PlanPayload["rooms"]): RemoteState => ({
  ...state,
  payload: { ...state.payload, rooms },
});

export const withChecklist = (
  state: RemoteState,
  courseId: string,
  checklist: Partial<CourseChecklist>,
): RemoteState =>
  withDocument(state, {
    checklists: { ...state.document.checklists, [courseId]: { ...state.document.checklists[courseId], ...checklist } },
  });

/**
 * Put the row the server actually wrote in place of the one drawn on spec.
 *
 * Matching is by the thing the database calls unique rather than by the
 * placeholder id, because between the optimistic draw and the answer the list
 * may have been re-read: (course, period) for a class, (code, section) for a
 * course, (building, name) for a room. Those are the three UNIQUE constraints
 * in `migrations/electives.sql`, which is why they are the three keys here.
 */
export const reconcileSession =
  (created: ElectiveSession): Reconcile =>
  (state) => {
    const real = readSession(created);
    return withDocument(state, {
      assignments: state.document.assignments.map((item) =>
        item.courseId === real.courseId && item.slotId === real.slotId ? real : item,
      ),
    });
  };

export const reconcileCourse =
  (created: Elective): Reconcile =>
  (state) => {
    const real = readCourse(created);
    const courses = state.payload.courses.map((item) =>
      item.courseCode === real.courseCode && item.section === real.section ? real : item,
    );
    const index: PlanIndex = {
      ...state.index,
      courses: new Map(state.index.courses).set(real.id, {
        companyId: created.companyId,
        lecturerId: created.lecturerId,
        coordinatorId: created.coordinatorId ?? null,
      }),
    };
    // A course drawn a moment ago under a placeholder id may already have
    // paperwork pointed at that id by the same click; move it across.
    const checklists = { ...state.document.checklists };
    for (const course of state.payload.courses) {
      if (course.courseCode === real.courseCode && course.section === real.section && course.id !== real.id) {
        if (checklists[course.id]) {
          checklists[real.id] = checklists[course.id];
          delete checklists[course.id];
        }
      }
    }
    return { ...withDocument(withCourses(state, courses), { checklists }), index };
  };

export const reconcileRoom =
  (created: ElectiveRoom): Reconcile =>
  (state) => {
    const real = readRoom(created);
    return withRooms(
      state,
      state.payload.rooms.map((item) =>
        item.building === real.building && item.name === real.name ? real : item,
      ),
    );
  };

/**
 * The id a row is drawn under before the server has given it one.
 *
 * Deliberately not a number: `serverId` in `plan-api.ts` refuses it, so a
 * request built from a placeholder fails in this browser with a sentence about
 * the row not being saved yet, rather than reaching the API as `/electives/NaN`.
 */
export const placeholderId = (kind: string): string => `new-${kind}-${Date.now().toString(36)}`;
