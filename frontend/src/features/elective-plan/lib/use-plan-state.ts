"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { readChecklist, type CourseChecklist } from "./checklist.ts";
import { detectConflicts } from "./conflicts.ts";
import {
  addCourse as addCourseTo,
  deleteCourse,
  isAddedCourse,
  mergeCourses,
  normalizeCourseDraft,
  patchCourse,
  sortSlots,
  takenCourseIds,
  validateCourseDraft,
  type CourseDraft,
} from "./courses.ts";
import { addRoom as addRoomTo, deleteRoom, mergeRooms, patchRoom, setRoomBlocked, validateRoomDraft, type RoomDraft, type RoomOverride } from "./rooms.ts";
import { explainFailure, sortAssignments } from "./scheduler.ts";
import { scheduleInWorker } from "./schedule-worker-client.ts";
import { changeAssignmentTime, moveAssignment, placeAssignment } from "./assignments.ts";
import { decodePlan, emptyPlanData, type CourseOverride, type PlanDocument } from "./plan-document.ts";
import { browserPersistence, PlanStore } from "./plan-store.ts";
import { RemotePlanStore } from "./plan-remote.ts";
import {
  addCourseCommand,
  addRoomCommand,
  autoAssignCommand,
  clearUnlockedCommand,
  moveCommand,
  placeCommand,
  removeCommand,
  removeCourseCommand,
  removeRoomCommand,
  setAvailabilityCommand,
  setBlockedCommand,
  setChecklistCommand,
  setCourseFieldCommand,
  setTimeCommand,
  toggleAvailabilityCommand,
  toggleLockCommand,
  unlockCourseCommand,
  updateCourseCommand,
  updateRoomCommand,
} from "./plan-commands.ts";
import type { ArchivedTerm, FailureReason, PlanCourse, PlanPayload, ScheduleResult, TermMeta } from "./plan-types.ts";
import type { SlotId } from "./slots.ts";

export type PlanGap = { course: PlanCourse; missing: number; reason: FailureReason };

/**
 * Where the plan lives.
 *
 * `api` is the real thing: one shared plan in postgres, and every control a
 * request. `seed` is the bundled JSON in localStorage, kept because it is what
 * the regression suites drive and what lets the planner be opened with no
 * backend running — `planSource()` in `plan-data.ts` decides which a build gets.
 */
export type PlanSource =
  | { kind: "seed"; payload: PlanPayload; terms: TermMeta[]; archives: ArchivedTerm[] }
  | { kind: "api"; termId?: number };

const PlanContext = createContext<ReturnType<typeof useController> | null>(null);

function effective(payload: PlanPayload, document: PlanDocument) {
  return {
    courses: mergeCourses(payload.courses, document),
    rooms: mergeRooms(payload.rooms, document.roomEdits),
    assignments: document.assignments,
  };
}

/**
 * The scheduler's cancel button and busy flag, shared by both stores.
 *
 * A plain box rather than a `useRef`: this is handed to the command factory,
 * and React's rules — rightly — treat passing a ref around during render as a
 * mistake. Nothing here is read while rendering; the box exists so that two
 * presses of "จัดตารางใหม่" in one tick cannot both start a run.
 */
type Planning = {
  abort: { current: AbortController | null };
  setBusy: Dispatch<SetStateAction<boolean>>;
};

/**
 * One run at a time, and a cancelled run changes nothing.
 *
 * The guard is the ref rather than the `planning` flag because two presses in
 * the same tick read the same stale flag; a ref is written before either can
 * read it again.
 */
async function scheduling(
  planning: Planning,
  work: (signal: AbortSignal) => Promise<ScheduleResult | null>,
): Promise<ScheduleResult | null> {
  if (planning.abort.current) return null;
  const controller = new AbortController();
  planning.abort.current = controller;
  planning.setBusy(true);
  try {
    return await work(controller.signal);
  } finally {
    planning.abort.current = null;
    planning.setBusy(false);
  }
}

/* ------------------------------------------------------------------ *
 * the plan in this browser
 * ------------------------------------------------------------------ */

function localCommands(store: PlanStore, payload: PlanPayload, planning: Planning) {
  return {
    runAutoAssign: (): Promise<ScheduleResult | null> => scheduling(planning, async (signal) => {
      let result: ScheduleResult | null = null;
      // Computed *inside* the mutation, against the document the lock hands
      // over rather than this render's copy: a run that took four seconds while
      // another tab locked a class must plan around that class.
      const saved = await store.mutate(async (current) => {
        const input = effective(payload, current);
        result = await scheduleInWorker({ ...input, locked: input.assignments.filter((item) => item.locked) }, signal);
        return { ...current, assignments: result.assignments };
      });
      return saved ? result : null;
    }),
    place: (courseId: string, slotId: SlotId, roomId: string | null) => store.mutate((current) => ({
      ...current, assignments: sortAssignments(placeAssignment({ ...effective(payload, current), courseId, slotId, roomId })),
    })),
    move: (assignmentId: string, slotId: SlotId, roomId: string | null) => store.mutate((current) => ({
      ...current, assignments: sortAssignments(moveAssignment({ ...effective(payload, current), assignmentId, slotId, roomId })),
    })),
    remove: (assignmentId: string) => store.mutate((current) => ({ ...current, assignments: current.assignments.filter((item) => item.id !== assignmentId) })),
    toggleLock: (assignmentId: string) => store.mutate((current) => ({ ...current, assignments: current.assignments.map((item) => item.id === assignmentId ? { ...item, locked: !item.locked } : item) })),
    unlockCourse: (courseId: string) => store.mutate((current) => ({ ...current, assignments: current.assignments.map((item) => item.courseId === courseId ? { ...item, locked: false } : item) })),
    setTime: (id: string, start: string, end: string) => store.mutate((current) => ({ ...current, assignments: changeAssignmentTime(current.assignments, id, start, end) })),
    // A correction goes to whichever half of the state owns the course — see
    // `patchCourse`. Writing every edit to `courseOverrides` would leave a
    // course somebody typed in with two records of itself to disagree.
    setAvailability: (courseId: string, availability: SlotId[]) => store.mutate((current) => ({ ...current, ...patchCourse(current, courseId, { availability: sortSlots(availability) }) })),
    toggleAvailability: (courseId: string, slotId: SlotId) => store.mutate((current) => {
      const course = effective(payload, current).courses.find((item) => item.id === courseId);
      if (!course) throw new Error("ไม่พบวิชา");
      const availability = course.availability.includes(slotId)
        ? course.availability.filter((slot) => slot !== slotId)
        : sortSlots([...course.availability, slotId]);
      return { ...current, ...patchCourse(current, courseId, { availability }) };
    }),
    setCourseField: (courseId: string, patch: CourseOverride) => store.mutate((current) => ({ ...current, ...patchCourse(current, courseId, patch) })),
    addCourse: (draft: CourseDraft, _companyId?: number) => store.mutate((current) => {
      const { courses } = effective(payload, current);
      const error = validateCourseDraft(draft, courses);
      if (error) throw new Error(error);
      // Every id the plan has ever spoken for, so a code that matches a course
      // somebody hid earlier does not quietly reuse its id — and with it that
      // course's periods and paperwork.
      return { ...current, ...addCourseTo(current, draft, takenCourseIds(payload.courses, current.courseEdits)).state };
    }),
    updateCourse: (courseId: string, draft: CourseDraft) => store.mutate((current) => {
      const { courses } = effective(payload, current);
      if (!courses.some((course) => course.id === courseId)) throw new Error("ไม่พบวิชานี้แล้ว กรุณาโหลดแผนล่าสุด");
      const error = validateCourseDraft(draft, courses, courseId);
      if (error) throw new Error(error);
      const next = normalizeCourseDraft(draft);
      // A course that has moved online keeps its periods and loses its rooms,
      // which is what an online course is. Leaving the room on would be a plan
      // the schema refuses to save at all.
      const assignments = next.deliveryMode === "ONLINE"
        ? current.assignments.map((item) => (item.courseId === courseId ? { ...item, roomId: null } : item))
        : current.assignments;
      return { ...current, ...patchCourse(current, courseId, next), assignments };
    }),
    removeCourse: (courseId: string) => store.mutate((current) => {
      const checklists = { ...current.checklists };
      delete checklists[courseId];
      return {
        ...current,
        ...deleteCourse(current, courseId),
        assignments: current.assignments.filter((item) => item.courseId !== courseId),
        checklists,
      };
    }),
    clearUnlocked: () => store.mutate((current) => ({ ...current, assignments: current.assignments.filter((item) => item.locked) })),
    addRoom: (draft: RoomDraft) => store.mutate((current) => {
      const { rooms } = effective(payload, current);
      const error = validateRoomDraft(draft, rooms);
      if (error) throw new Error(error);
      const taken = [...payload.rooms, ...current.roomEdits.added].map((room) => room.id);
      return { ...current, roomEdits: addRoomTo(current.roomEdits, draft, taken).edits };
    }),
    updateRoom: (id: string, patch: RoomOverride) => store.mutate((current) => {
      const { rooms } = effective(payload, current);
      const room = rooms.find((room) => room.id === id);
      if (!room) throw new Error("ไม่พบห้องนี้แล้ว กรุณาโหลดแผนล่าสุด");
      const error = validateRoomDraft({ ...room, ...patch }, rooms, id);
      if (error) throw new Error(error);
      return { ...current, roomEdits: patchRoom(current.roomEdits, id, patch) };
    }),
    removeRoom: (id: string) => store.mutate((current) => ({ ...current, roomEdits: deleteRoom(current.roomEdits, id), assignments: current.assignments.filter((item) => item.roomId !== id) })),
    setBlocked: (id: string, slotId: SlotId, reason: string | null) => store.mutate((current) => {
      const room = effective(payload, current).rooms.find((item) => item.id === id);
      if (!room) throw new Error("ไม่พบห้องนี้แล้ว");
      return { ...current, roomEdits: setRoomBlocked(current.roomEdits, room, slotId, reason) };
    }),
    setChecklistField: (id: string, patch: Partial<CourseChecklist>) => store.mutate((current) => ({ ...current, checklists: { ...current.checklists, [id]: { ...current.checklists[id], ...patch } } })),
    resetAll: () => store.replace(emptyPlanData(), store.getSnapshot().document.revision),
    importPlan: async (raw: string) => {
      try { return await store.replace(decodePlan(raw, payload).document, store.getSnapshot().document.revision); }
      catch (error) { store.reportError(error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ"); return false; }
    },
  };
}

/* ------------------------------------------------------------------ *
 * the plan everyone shares
 * ------------------------------------------------------------------ */

function remoteCommands(store: RemotePlanStore, planning: Planning): ReturnType<typeof localCommands> {
  const courseIn = (id: string) => {
    const found = store.getState().payload.courses.find((item) => item.id === id);
    if (!found) throw new Error("ไม่พบวิชานี้แล้ว กรุณาโหลดแผนล่าสุด");
    return found;
  };
  const refuse = (what: string) => {
    store.reportError(`${what}ทำได้เฉพาะตอนเก็บแผนไว้ในเบราว์เซอร์เท่านั้น`);
    return Promise.resolve(false);
  };

  return {
    runAutoAssign: (): Promise<ScheduleResult | null> => scheduling(planning, async (signal) => {
      const current = store.getState();
      const result = await scheduleInWorker({
        courses: current.payload.courses,
        rooms: current.payload.rooms,
        locked: current.document.assignments.filter((item) => item.locked),
      }, signal);
      // One request, not one per class: the server swaps the unlocked half of
      // the timetable in a transaction, so a plan it refuses leaves the old one
      // whole rather than half-replaced.
      return (await store.run(autoAssignCommand(result))) ? result : null;
    }),
    place: (courseId, slotId, roomId) => store.run(placeCommand(courseId, slotId, roomId)),
    move: (assignmentId, slotId, roomId) => store.run(moveCommand(assignmentId, slotId, roomId)),
    remove: (assignmentId) => store.run(removeCommand(assignmentId)),
    toggleLock: (assignmentId) => store.run(toggleLockCommand(assignmentId)),
    unlockCourse: (courseId) => store.run(unlockCourseCommand(courseId)),
    setTime: (id, start, end) => store.run(setTimeCommand(id, start, end)),
    setAvailability: (courseId, availability) => store.run(setAvailabilityCommand(courseId, availability)),
    toggleAvailability: (courseId, slotId) => store.run(toggleAvailabilityCommand(courseId, slotId, courseIn(courseId))),
    setCourseField: (courseId, patch) => store.run(setCourseFieldCommand(courseId, patch, courseIn(courseId))),
    addCourse: (draft, companyId) => {
      // `electives.company_id` is a foreign key, so a course has to belong to a
      // company that exists. The form asks for one; this is the backstop.
      if (!companyId) return refuse("การเพิ่มวิชาโดยไม่เลือกบริษัท");
      return store.run(addCourseCommand(draft, companyId));
    },
    updateCourse: (courseId, draft) => store.run(updateCourseCommand(courseId, draft)),
    removeCourse: (courseId) => store.run(removeCourseCommand(courseId)),
    clearUnlocked: () => store.run(clearUnlockedCommand(store.getState())),
    addRoom: (draft) => store.run(addRoomCommand(draft)),
    updateRoom: (id, patch) => store.run(updateRoomCommand(id, patch)),
    removeRoom: (id) => store.run(removeRoomCommand(id)),
    setBlocked: (id, slotId, reason) => store.run(setBlockedCommand(id, slotId, reason)),
    setChecklistField: (id, patch) => store.run(setChecklistCommand(id, patch)),
    // Both of these replace the plan wholesale, which is a thing you may do to
    // a copy in your own browser and not to the one everybody is working in.
    // The controls that call them are hidden on this path.
    resetAll: () => refuse("การคืนค่าเริ่มต้นทั้งแผน"),
    importPlan: () => refuse("การนำเข้าแผน"),
  };
}

/* ------------------------------------------------------------------ *
 * the hook
 * ------------------------------------------------------------------ */

/** Commands receive the newest plan, not a render's stale copy of it. */
function useController(source: PlanSource) {
  const [planning, setPlanning] = useState(false);
  const [abortBox] = useState<Planning["abort"]>(() => ({ current: null }));
  const [store] = useState(() =>
    source.kind === "seed"
      ? new PlanStore(source.payload, browserPersistence())
      : new RemotePlanStore(source.termId),
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === store.key || event.key === null) store.refresh(); };
    const onFocus = () => store.refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus); };
  }, [store]);

  const { document, payload } = snapshot;
  const { courses, rooms, assignments } = useMemo(() => effective(payload, document), [payload, document]);
  const conflicts = useMemo(() => detectConflicts({ courses, rooms, assignments }), [courses, rooms, assignments]);
  const gaps = useMemo(() => courses.flatMap((course): PlanGap[] => {
    const missing = course.sessionsPerWeek - assignments.filter((item) => item.courseId === course.id).length;
    return missing > 0 ? [{ course, missing, reason: explainFailure({ course, courses, rooms, placed: assignments }) }] : [];
  }), [courses, rooms, assignments]);

  const planner = useMemo<Planning>(() => ({ abort: abortBox, setBusy: setPlanning }), [abortBox]);
  const commands = useMemo(
    () => (store instanceof PlanStore ? localCommands(store, payload, planner) : remoteCommands(store, planner)),
    [store, payload, planner],
  );

  const cancelPlanning = useMemo(() => () => abortBox.current?.abort(), [abortBox]);

  const terms = source.kind === "seed" ? source.terms : snapshot.terms;
  const archives = source.kind === "seed" ? source.archives : snapshot.archives;

  return {
    ...commands,
    ...snapshot,
    mode: source.kind,
    planning,
    cancelPlanning,
    payload, terms, archives,
    term: payload.term, courses, rooms, assignments, conflicts, gaps,
    // A shared plan has no "edited in this browser" state to report: every
    // change is already everyone's, so the banner offering to throw local edits
    // away has nothing to offer.
    editedAt: source.kind === "seed" ? document.editedAt : null,
    /**
     * Read the plan, once somebody is looking at it.
     *
     * The provider sits at the root of the app so that an edit which could not
     * be saved survives a trip to another screen and back. That would also
     * mean the login page asking the API for a timetable nobody has opened, so
     * the read is the planner's own first act — see `PlanShell`.
     */
    load: store.load,
    undo: store.undo, retry: store.retry, reload: store.reload,
    recoverEmpty: store instanceof PlanStore ? store.recoverEmpty : async () => false,
    reportError: store.reportError,
    checklistFor: (id: string) => readChecklist(document.checklists[id]),
    assignmentsInRoom: (id: string) => assignments.filter((item) => item.roomId === id).length,
    assignmentsForCourse: (id: string) => assignments.filter((item) => item.courseId === id).length,
    /**
     * True for a course somebody typed in here, rather than one the seed
     * carries. Every course on the shared plan was typed in by somebody, which
     * is why the edit and delete controls are always offered there.
     */
    isAddedCourse: (id: string) => source.kind === "api" || isAddedCourse(document.courseEdits, id),
  };
}

export function PlanProvider({ source, children }: { source: PlanSource; children: ReactNode }) {
  const value = useController(source);
  return createElement(PlanContext.Provider, { value }, children);
}

export function usePlanState() {
  const value = useContext(PlanContext);
  if (!value) throw new Error("Planner requires PlanProvider");
  return value;
}
