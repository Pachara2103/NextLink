"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import type { FailureReason, PlanCourse, PlanPayload, ScheduleResult } from "./plan-types.ts";
import type { SlotId } from "./slots.ts";

export type PlanGap = { course: PlanCourse; missing: number; reason: FailureReason };
const PlanContext = createContext<ReturnType<typeof useController> | null>(null);

function effective(payload: PlanPayload, document: PlanDocument) {
  return {
    courses: mergeCourses(payload.courses, document),
    rooms: mergeRooms(payload.rooms, document.roomEdits),
    assignments: document.assignments,
  };
}

/** Commands receive the newest document under a cross-tab lock, not a render's stale copy. */
function useController(payload: PlanPayload) {
  const planningAbort = useRef<AbortController | null>(null);
  const [planning, setPlanning] = useState(false);
  const [store] = useState(() => new PlanStore(payload, browserPersistence()));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.load();
    const onStorage = (event: StorageEvent) => { if (event.key === store.key || event.key === null) store.refresh(); };
    const onFocus = () => store.refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus); };
  }, [store]);

  const { document } = snapshot;
  const { courses, rooms, assignments } = useMemo(() => effective(payload, document), [payload, document]);
  const conflicts = useMemo(() => detectConflicts({ courses, rooms, assignments }), [courses, rooms, assignments]);
  const gaps = useMemo(() => courses.flatMap((course): PlanGap[] => {
    const missing = course.sessionsPerWeek - assignments.filter((item) => item.courseId === course.id).length;
    return missing > 0 ? [{ course, missing, reason: explainFailure({ course, courses, rooms, placed: assignments }) }] : [];
  }), [courses, rooms, assignments]);

  const commands = useMemo(() => ({
    runAutoAssign: async (): Promise<ScheduleResult | null> => {
      if (planningAbort.current) return null;
      const controller = new AbortController();
      planningAbort.current = controller;
      setPlanning(true);
      let result: ScheduleResult | null = null;
      try {
        const saved = await store.mutate(async (current) => {
          const input = effective(payload, current);
          result = await scheduleInWorker({ ...input, locked: input.assignments.filter((item) => item.locked) }, controller.signal);
          return { ...current, assignments: result.assignments };
        });
        return saved ? result : null;
      } finally { planningAbort.current = null; setPlanning(false); }
    },
    cancelPlanning: () => planningAbort.current?.abort(),
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
    addCourse: (draft: CourseDraft) => store.mutate((current) => {
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
  }), [store, payload]);

  return {
    ...commands, ...snapshot, planning, term: payload.term, courses, rooms, assignments, conflicts, gaps, editedAt: document.editedAt,
    undo: store.undo, retry: store.retry, reload: store.reload, recoverEmpty: store.recoverEmpty, reportError: store.reportError,
    checklistFor: (id: string) => readChecklist(document.checklists[id]),
    assignmentsInRoom: (id: string) => assignments.filter((item) => item.roomId === id).length,
    assignmentsForCourse: (id: string) => assignments.filter((item) => item.courseId === id).length,
    /** True for a course somebody typed in here, rather than one the seed carries. */
    isAddedCourse: (id: string) => isAddedCourse(document.courseEdits, id),
  };
}

export function PlanProvider({ payload, children }: { payload: PlanPayload; children: ReactNode }) {
  const value = useController(payload);
  return createElement(PlanContext.Provider, { value }, children);
}

export function usePlanState() {
  const value = useContext(PlanContext);
  if (!value) throw new Error("Planner requires PlanProvider");
  return value;
}
