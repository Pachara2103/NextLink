/**
 * Every control on the planner, written once as "what it does to the screen"
 * and "what it says to the server".
 *
 * The pairing matters more than either half. A drag that the rules forbid is
 * caught by `apply` and never becomes a request; a drag the rules allow but
 * the database refuses — two classes in one room, because somebody else
 * booked it a second ago — comes back as the same Thai sentence the rules
 * would have used, and the class goes back where it was. One vocabulary, two
 * places it can be enforced, and the person sees no seam.
 *
 * `inverse` is the "เลิกทำ" in the toast. It is built *after* the server has
 * answered, from the state on either side of the command, so it can name rows
 * by the ids they really have rather than the ones they were drawn under.
 * Commands that cannot be taken back honestly — deleting a course takes its
 * periods and its paperwork with it — return null and are simply not offered.
 */

import { changeAssignmentTime, moveAssignment, placeAssignment } from "./assignments.ts";
import type { CourseChecklist } from "./checklist.ts";
import {
  checklistPatch,
  courseWrite,
  readSession,
  roomWrite,
  serverId,
  sessionWrite,
  sessionWriteFrom,
} from "./plan-api.ts";
import {
  courseDraftFrom,
  normalizeCourseDraft,
  sortSlots,
  validateCourseDraft,
  type CourseDraft,
  type CourseOverride,
} from "./courses.ts";
import {
  placeholderId,
  reconcileCourse,
  reconcileRoom,
  reconcileSession,
  withChecklist,
  withCourses,
  withDocument,
  withRooms,
  type RemoteState,
} from "./plan-state.ts";
import type { RemoteCommand } from "./plan-remote.ts";
import { roomDraftFrom, validateRoomDraft, type RoomDraft, type RoomOverride } from "./rooms.ts";
import { sortAssignments } from "./scheduler.ts";
import { electiveService } from "@/lib/services/elective";
import type { Assignment, PlanCourse, PlanRoom, ScheduleResult } from "./plan-types.ts";
import type { SlotId } from "./slots.ts";

/* ------------------------------------------------------------------ *
 * lookups
 * ------------------------------------------------------------------ */

function courseOf(state: RemoteState, courseId: string): PlanCourse {
  const course = state.payload.courses.find((item) => item.id === courseId);
  if (!course) throw new Error("ไม่พบวิชานี้แล้ว กรุณาโหลดแผนล่าสุด");
  return course;
}

function roomOf(state: RemoteState, roomId: string): PlanRoom {
  const room = state.payload.rooms.find((item) => item.id === roomId);
  if (!room) throw new Error("ไม่พบห้องนี้แล้ว กรุณาโหลดแผนล่าสุด");
  return room;
}

function sessionOf(state: RemoteState, id: string): Assignment {
  const found = state.document.assignments.find((item) => item.id === id);
  if (!found) throw new Error("ไม่พบคาบนี้แล้ว กรุณาโหลดแผนล่าสุด");
  return found;
}

/** The three ids a course write needs and the grid never shows. */
function linkOf(state: RemoteState, courseId: string) {
  const link = state.index.courses.get(courseId);
  if (!link) throw new Error("ไม่พบบริษัทของวิชานี้ กรุณาโหลดแผนล่าสุด");
  return link;
}

/**
 * The lecturer/coordinator ids to send with an edited course.
 *
 * Kept only while the name is unchanged. Once somebody types a different name
 * into the box they mean a different person, and sending the old id with the
 * new name would rename the row instead — turning "this course is taught by
 * someone else now" into "อาจารย์สมชาย is now called อาจารย์สมหญิง" everywhere
 * that person appears.
 */
function peopleIds(state: RemoteState, courseId: string, draft: CourseDraft) {
  const link = linkOf(state, courseId);
  const before = courseOf(state, courseId);
  const same = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").trim() === (b ?? "").trim();
  return {
    companyId: link.companyId,
    lecturerId: same(before.instructor, draft.instructor) ? link.lecturerId : null,
    coordinatorId: same(before.coordinator?.name, draft.coordinator?.name) ? link.coordinatorId : null,
  };
}

const assignmentsWithout = (state: RemoteState, id: string) =>
  state.document.assignments.filter((item) => item.id !== id);

/* ------------------------------------------------------------------ *
 * periods
 * ------------------------------------------------------------------ */

export function placeCommand(courseId: string, slotId: SlotId, roomId: string | null): RemoteCommand {
  return {
    what: "จัดคาบไม่สำเร็จ",
    apply: (state) =>
      withDocument(state, {
        assignments: sortAssignments(
          placeAssignment({
            courses: state.payload.courses,
            rooms: state.payload.rooms,
            assignments: state.document.assignments,
            courseId,
            slotId,
            roomId,
          }),
        ),
      }),
    send: async () =>
      reconcileSession(await electiveService.placeSession(sessionWrite({ courseId, slotId, roomId }))),
    inverse: ({ after }) => {
      const placed = after.document.assignments.find(
        (item) => item.courseId === courseId && item.slotId === slotId,
      );
      return placed ? removeCommand(placed.id) : null;
    },
  };
}

export function moveCommand(assignmentId: string, slotId: SlotId, roomId: string | null): RemoteCommand {
  return {
    what: "ย้ายคาบไม่สำเร็จ",
    apply: (state) =>
      withDocument(state, {
        assignments: sortAssignments(
          moveAssignment({
            courses: state.payload.courses,
            rooms: state.payload.rooms,
            assignments: state.document.assignments,
            assignmentId,
            slotId,
            roomId,
          }),
        ),
      }),
    send: async ({ before }) => {
      await electiveService.updateSession(
        serverId(assignmentId, "คาบ"),
        sessionWriteFrom(sessionOf(before, assignmentId), { slotId, roomId }),
      );
    },
    inverse: ({ before }) => {
      const was = sessionOf(before, assignmentId);
      return moveCommand(assignmentId, was.slotId, was.roomId);
    },
  };
}

export function removeCommand(assignmentId: string): RemoteCommand {
  return {
    what: "เอาคาบออกไม่สำเร็จ",
    apply: (state) => {
      sessionOf(state, assignmentId);
      return withDocument(state, { assignments: assignmentsWithout(state, assignmentId) });
    },
    send: async () => {
      await electiveService.removeSession(serverId(assignmentId, "คาบ"));
    },
    inverse: ({ before }) => {
      const was = sessionOf(before, assignmentId);
      return placeCommand(was.courseId, was.slotId, was.roomId);
    },
  };
}

export function toggleLockCommand(assignmentId: string): RemoteCommand {
  return {
    what: "เปลี่ยนสถานะล็อกไม่สำเร็จ",
    apply: (state) => {
      const was = sessionOf(state, assignmentId);
      return withDocument(state, {
        assignments: state.document.assignments.map((item) =>
          item.id === assignmentId ? { ...item, locked: !was.locked } : item,
        ),
      });
    },
    send: async ({ after }) => {
      await electiveService.updateSession(
        serverId(assignmentId, "คาบ"),
        sessionWriteFrom(sessionOf(after, assignmentId)),
      );
    },
    inverse: () => toggleLockCommand(assignmentId),
  };
}

/**
 * Every period of one course unlocked at once — the way out of "ปลดล็อกวิชานี้
 * ก่อนจัดใหม่". One request per period, in order: there is no route that takes
 * a course, and inventing one to save two round trips on a button pressed a
 * handful of times a term is not a trade worth making.
 */
export function unlockCourseCommand(courseId: string): RemoteCommand {
  return {
    what: "ปลดล็อกวิชาไม่สำเร็จ",
    apply: (state) =>
      withDocument(state, {
        assignments: state.document.assignments.map((item) =>
          item.courseId === courseId ? { ...item, locked: false } : item,
        ),
      }),
    send: async ({ before }) => {
      for (const item of before.document.assignments) {
        if (item.courseId === courseId && item.locked) {
          await electiveService.updateSession(
            serverId(item.id, "คาบ"),
            sessionWriteFrom(item, { locked: false }),
          );
        }
      }
    },
    inverse: ({ before }) => {
      const locked = before.document.assignments.filter((item) => item.courseId === courseId && item.locked);
      if (!locked.length) return null;
      return {
        what: "ล็อกคาบกลับไม่สำเร็จ",
        apply: (state) =>
          withDocument(state, {
            assignments: state.document.assignments.map((item) =>
              locked.some((was) => was.id === item.id) ? { ...item, locked: true } : item,
            ),
          }),
        send: async () => {
          for (const item of locked) {
            await electiveService.updateSession(serverId(item.id, "คาบ"), sessionWriteFrom(item, { locked: true }));
          }
        },
      };
    },
  };
}

export function setTimeCommand(assignmentId: string, startTime: string, endTime: string): RemoteCommand {
  return {
    what: "แก้เวลาไม่สำเร็จ",
    apply: (state) =>
      withDocument(state, {
        assignments: changeAssignmentTime(state.document.assignments, assignmentId, startTime, endTime),
      }),
    send: async ({ after }) => {
      await electiveService.updateSession(
        serverId(assignmentId, "คาบ"),
        sessionWriteFrom(sessionOf(after, assignmentId)),
      );
    },
    inverse: ({ before }) => {
      const was = sessionOf(before, assignmentId);
      return setTimeCommand(assignmentId, was.startTime, was.endTime);
    },
  };
}

/**
 * Replace the periods that are not locked — "จัดตารางใหม่" and "ล้างที่ยังไม่
 * ล็อก" are the same request with a different list.
 *
 * One request rather than a delete and N places, because a half-applied
 * timetable is not a timetable: the server does the whole swap in one
 * transaction and refuses the lot if any part of it clashes.
 */
export function replaceCommand(next: Assignment[], what: string): RemoteCommand {
  return {
    what,
    apply: (state) => withDocument(state, { assignments: sortAssignments(next) }),
    send: async () => {
      const written = await electiveService.replaceSessions(
        next
          .filter((item) => !item.locked)
          .map((item) =>
            sessionWrite({
              courseId: item.courseId,
              slotId: item.slotId,
              roomId: item.roomId,
              source: item.source,
              startTime: item.startTime,
              endTime: item.endTime,
            }),
          ),
      );
      // The answer is the whole term's periods, ids included — the one case
      // where taking the server's list wholesale is simpler than patching.
      return (state) => withDocument(state, { assignments: sortAssignments(written.map(readSession)) });
    },
    inverse: ({ before }) => replaceCommand(before.document.assignments, "ย้อนตารางกลับไม่สำเร็จ"),
  };
}

/* ------------------------------------------------------------------ *
 * courses
 * ------------------------------------------------------------------ */

export function setAvailabilityCommand(courseId: string, availability: SlotId[]): RemoteCommand {
  const slots = sortSlots(availability);
  return {
    what: "บันทึกช่วงที่สะดวกไม่สำเร็จ",
    apply: (state) => {
      courseOf(state, courseId);
      return withCourses(
        state,
        state.payload.courses.map((item) => (item.id === courseId ? { ...item, availability: slots } : item)),
      );
    },
    send: async () => {
      await electiveService.setAvailability(serverId(courseId, "วิชา"), slots);
    },
    inverse: ({ before }) => setAvailabilityCommand(courseId, courseOf(before, courseId).availability),
  };
}

export function toggleAvailabilityCommand(courseId: string, slotId: SlotId, course: PlanCourse): RemoteCommand {
  const next = course.availability.includes(slotId)
    ? course.availability.filter((slot) => slot !== slotId)
    : sortSlots([...course.availability, slotId]);
  return setAvailabilityCommand(courseId, next);
}

/**
 * A whole course, written back from the form.
 *
 * `PUT` rather than a patch because the form holds every field — and because
 * the route that takes a partial update is the availability grid's, which is
 * the one control people press without opening the form.
 */
export function updateCourseCommand(courseId: string, draft: CourseDraft): RemoteCommand {
  const next = normalizeCourseDraft(draft);
  return {
    what: "บันทึกวิชาไม่สำเร็จ",
    apply: (state) => {
      const courses = state.payload.courses;
      if (!courses.some((course) => course.id === courseId)) {
        throw new Error("ไม่พบวิชานี้แล้ว กรุณาโหลดแผนล่าสุด");
      }
      const error = validateCourseDraft(next, courses, courseId);
      if (error) throw new Error(error);
      // A course that has moved online keeps its periods and loses its rooms.
      const assignments =
        next.deliveryMode === "ONLINE"
          ? state.document.assignments.map((item) =>
              item.courseId === courseId ? { ...item, roomId: null } : item,
            )
          : state.document.assignments;
      return withDocument(
        withCourses(
          state,
          courses.map((course) => (course.id === courseId ? { ...course, ...next } : course)),
        ),
        { assignments },
      );
    },
    send: async ({ before, after }) => {
      const updated = await electiveService.updateElective(
        serverId(courseId, "วิชา"),
        courseWrite(next, { ...peopleIds(before, courseId, next), termId: before.index.termId }),
      );
      // Going online strands the rooms the periods used to sit in; the server
      // took the course but not the periods, so they follow here.
      if (next.deliveryMode === "ONLINE") {
        for (const item of after.document.assignments) {
          if (item.courseId === courseId && item.roomId === null) {
            await electiveService.updateSession(serverId(item.id, "คาบ"), sessionWriteFrom(item));
          }
        }
      }
      return reconcileCourse(updated);
    },
    inverse: ({ before }) => updateCourseCommand(courseId, courseDraftFrom(courseOf(before, courseId))),
  };
}

export function setCourseFieldCommand(courseId: string, patch: CourseOverride, course: PlanCourse): RemoteCommand {
  return updateCourseCommand(courseId, { ...courseDraftFrom(course), ...patch });
}

export function addCourseCommand(draft: CourseDraft, companyId: number): RemoteCommand {
  const next = normalizeCourseDraft(draft);
  const temporary = placeholderId("course");
  return {
    what: "เพิ่มรายวิชาไม่สำเร็จ",
    apply: (state) => {
      const error = validateCourseDraft(next, state.payload.courses);
      if (error) throw new Error(error);
      return withCourses(state, [...state.payload.courses, { id: temporary, ...next }]);
    },
    send: async ({ before }) =>
      reconcileCourse(
        await electiveService.createElective(courseWrite(next, { companyId, termId: before.index.termId })),
      ),
    inverse: ({ after }) => {
      const created = after.payload.courses.find(
        (course) => course.courseCode === next.courseCode && course.section === next.section,
      );
      return created && created.id !== temporary ? removeCourseCommand(created.id) : null;
    },
  };
}

/**
 * No inverse. The row takes its periods and its paperwork with it (ON DELETE
 * CASCADE), and an "undo" that quietly rebuilt the course without them would
 * be a worse answer than the confirmation the list already asks for.
 */
export function removeCourseCommand(courseId: string): RemoteCommand {
  return {
    what: "ลบวิชาไม่สำเร็จ",
    apply: (state) => {
      courseOf(state, courseId);
      const checklists = { ...state.document.checklists };
      delete checklists[courseId];
      return withDocument(
        withCourses(
          state,
          state.payload.courses.filter((course) => course.id !== courseId),
        ),
        {
          assignments: state.document.assignments.filter((item) => item.courseId !== courseId),
          checklists,
        },
      );
    },
    send: async () => {
      await electiveService.removeElective(serverId(courseId, "วิชา"));
    },
  };
}

/* ------------------------------------------------------------------ *
 * rooms
 * ------------------------------------------------------------------ */

export function addRoomCommand(draft: RoomDraft): RemoteCommand {
  const temporary = placeholderId("room");
  return {
    what: "เพิ่มห้องไม่สำเร็จ",
    apply: (state) => {
      const error = validateRoomDraft(draft, state.payload.rooms);
      if (error) throw new Error(error);
      return withRooms(state, [...state.payload.rooms, { id: temporary, ...draft, blockedSlots: [] }]);
    },
    send: async () => reconcileRoom(await electiveService.createRoom(roomWrite(draft))),
    inverse: ({ after }) => {
      const created = after.payload.rooms.find(
        (room) => room.building === draft.building.trim() && room.name === draft.name.trim(),
      );
      return created && created.id !== temporary ? removeRoomCommand(created.id) : null;
    },
  };
}

export function updateRoomCommand(roomId: string, patch: RoomOverride): RemoteCommand {
  return {
    what: "บันทึกห้องไม่สำเร็จ",
    apply: (state) => {
      const room = roomOf(state, roomId);
      const error = validateRoomDraft({ ...room, ...patch }, state.payload.rooms, roomId);
      if (error) throw new Error(error);
      return withRooms(
        state,
        state.payload.rooms.map((item) => (item.id === roomId ? { ...item, ...patch } : item)),
      );
    },
    send: async ({ after }) => {
      await electiveService.updateRoom(serverId(roomId, "ห้อง"), roomWrite(roomOf(after, roomId)));
    },
    inverse: ({ before }) => updateRoomCommand(roomId, roomDraftFrom(roomOf(before, roomId))),
  };
}

export function removeRoomCommand(roomId: string): RemoteCommand {
  return {
    what: "ลบห้องไม่สำเร็จ",
    apply: (state) => {
      roomOf(state, roomId);
      return withDocument(
        withRooms(
          state,
          state.payload.rooms.filter((room) => room.id !== roomId),
        ),
        { assignments: state.document.assignments.filter((item) => item.roomId !== roomId) },
      );
    },
    send: async () => {
      await electiveService.removeRoom(serverId(roomId, "ห้อง"));
    },
    inverse: ({ before }) => {
      const was = roomOf(before, roomId);
      const restore = addRoomCommand(roomDraftFrom(was));
      if (!was.blockedSlots.length) return restore;
      // A room comes back with the periods it was already taken for; without
      // them the timetable would show it free where it never was.
      return {
        ...restore,
        send: async (context) => {
          const fix = await restore.send(context);
          const state = fix ? fix(context.after) : context.after;
          const created = state.payload.rooms.find(
            (room) => room.building === was.building && room.name === was.name,
          );
          if (created && created.id !== roomId) {
            await electiveService.setRoomBlocks(
              serverId(created.id, "ห้อง"),
              was.blockedSlots.map((block) => ({ slot: block.slotId, reason: block.reason })),
            );
          }
          return (current) =>
            withRooms(
              current,
              current.payload.rooms.map((room) =>
                room.building === was.building && room.name === was.name
                  ? { ...room, blockedSlots: was.blockedSlots }
                  : room,
              ),
            );
        },
      };
    },
  };
}

export function setBlockedCommand(roomId: string, slotId: SlotId, reason: string | null): RemoteCommand {
  const trimmed = reason?.trim() || null;
  return {
    what: "บันทึกคาบที่ห้องติดงานอื่นไม่สำเร็จ",
    apply: (state) => {
      const room = roomOf(state, roomId);
      const blockedSlots = trimmed
        ? [...room.blockedSlots.filter((block) => block.slotId !== slotId), { slotId, reason: trimmed }]
        : room.blockedSlots.filter((block) => block.slotId !== slotId);
      return withRooms(
        state,
        state.payload.rooms.map((item) => (item.id === roomId ? { ...item, blockedSlots } : item)),
      );
    },
    send: async ({ after }) => {
      await electiveService.setRoomBlocks(
        serverId(roomId, "ห้อง"),
        roomOf(after, roomId).blockedSlots.map((block) => ({ slot: block.slotId, reason: block.reason })),
      );
    },
    inverse: ({ before }) => {
      const was = roomOf(before, roomId).blockedSlots.find((block) => block.slotId === slotId);
      return setBlockedCommand(roomId, slotId, was?.reason ?? null);
    },
  };
}

/* ------------------------------------------------------------------ *
 * paperwork
 * ------------------------------------------------------------------ */

export function setChecklistCommand(courseId: string, patch: Partial<CourseChecklist>): RemoteCommand {
  return {
    what: "บันทึกเช็กลิสต์ไม่สำเร็จ",
    apply: (state) => withChecklist(state, courseId, patch),
    send: async () => {
      await electiveService.updateChecklist(serverId(courseId, "วิชา"), checklistPatch(patch));
    },
    inverse: ({ before }) => {
      const was = before.document.checklists[courseId] ?? {};
      const previous: Partial<CourseChecklist> = {};
      for (const field of Object.keys(patch) as (keyof CourseChecklist)[]) {
        // A field with no stored answer yet goes back to the default the
        // checklist reader would have shown, not to `undefined` — which the
        // patch builder would drop, leaving the new value in place.
        previous[field] = (was[field] ??
          (field === "mcvJoinCode" ? "" : field.endsWith("Letter") ? "NOT_RECEIVED" : "NOT_DONE")) as never;
      }
      return setChecklistCommand(courseId, previous);
    },
  };
}

/* ------------------------------------------------------------------ *
 * scheduling
 * ------------------------------------------------------------------ */

export function autoAssignCommand(result: ScheduleResult): RemoteCommand {
  return replaceCommand(result.assignments, "จัดตารางใหม่ไม่สำเร็จ");
}

export function clearUnlockedCommand(state: RemoteState): RemoteCommand {
  return replaceCommand(
    state.document.assignments.filter((item) => item.locked),
    "ล้างคาบไม่สำเร็จ",
  );
}
