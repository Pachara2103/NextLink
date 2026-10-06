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

/**
 * A course, and everything in the draft that was pointed at the id it was
 * drawn under.
 *
 * A row created in a draft is named by a placeholder until บันทึก reaches it,
 * and by then the person may well have given it periods and ticked boxes
 * against it — all of which name the placeholder. Rewriting them here, in the
 * one place that learns the real id, is what keeps the rest of the save
 * talking about the same course the database now has.
 */
export const reconcileCourse =
  (created: Elective): Reconcile =>
  (state) => {
    const real = readCourse(created);
    const previous = state.payload.courses.find(
      (item) => item.courseCode === real.courseCode && item.section === real.section,
    );
    const wasId = previous?.id ?? real.id;
    const courses = state.payload.courses.map((item) => (item.id === wasId ? real : item));

    const links = new Map(state.index.courses);
    links.delete(wasId);
    links.set(real.id, {
      companyId: created.companyId,
      lecturerId: created.lecturerId,
      coordinatorId: created.coordinatorId ?? null,
    });
    const index: PlanIndex = { ...state.index, courses: links };

    const checklists = { ...state.document.checklists };
    if (wasId !== real.id && checklists[wasId]) {
      checklists[real.id] = checklists[wasId];
      delete checklists[wasId];
    }
    const assignments =
      wasId === real.id
        ? state.document.assignments
        : state.document.assignments.map((item) =>
            item.courseId === wasId ? { ...item, courseId: real.id } : item,
          );

    return { ...withDocument(withCourses(state, courses), { checklists, assignments }), index };
  };

export const reconcileRoom =
  (created: ElectiveRoom): Reconcile =>
  (state) => {
    const real = readRoom(created);
    const previous = state.payload.rooms.find(
      (item) => item.building === real.building && item.name === real.name,
    );
    const wasId = previous?.id ?? real.id;
    const rooms = state.payload.rooms.map((item) => (item.id === wasId ? real : item));
    // Periods already dropped into a room that was itself only drawn a moment
    // ago still name it by its placeholder — see `reconcileCourse`.
    const assignments =
      wasId === real.id
        ? state.document.assignments
        : state.document.assignments.map((item) =>
            item.roomId === wasId ? { ...item, roomId: real.id } : item,
          );
    return withDocument(withRooms(state, rooms), { assignments });
  };

/**
 * The id a row is drawn under before the server has given it one.
 *
 * Deliberately not a number: `serverId` in `plan-api.ts` refuses it, so a
 * request built from a placeholder fails in this browser with a sentence about
 * the row not being saved yet, rather than reaching the API as `/electives/NaN`.
 */
export const placeholderId = (kind: string): string => `new-${kind}-${Date.now().toString(36)}`;
