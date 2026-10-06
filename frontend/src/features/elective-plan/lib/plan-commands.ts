/**
 * Every control on the planner, written once as "what it does to the screen"
 * and "what it says to the server".
 *
 * The pairing matters more than either half. A drag that the rules forbid is
 * caught by `apply` the moment it happens and never becomes a request; a drag
 * the rules allow but the database refuses — two classes in one room, because
 * somebody else booked it first — comes back as the same Thai sentence the
 * rules would have used. One vocabulary, two places it can be enforced, and
 * the person sees no seam.
 *
 * `scope` is the third field and the one worth reading twice. Six commands are
 * `"timetable"` — place, move, remove, lock, unlock a course's periods, retime,
 * and the two whole-board replacements — and they are held until somebody saves
 * the board. Every other command is `"now"`. The line is not about risk or size;
 * it is about whether the press is a decision or a step towards one. Ticking
 * "จดหมายเชิญ: ส่งแล้ว" is a decision. Dragging a class to Wednesday to see how
 * the week looks is not.
 *
 * Two things follow for the `"timetable"` six, whose `send` runs long after the
 * press:
 *
 * - **`apply` and `send` read different states.** `apply` gets the live state;
 *   `send` gets `before`/`after`, the pair this command drew, which is what its
 *   request body describes. A command that read the live state in `send` would
 *   describe whatever was dragged after it.
 * - **Ids in `send` go through `context.id`.** A period placed and then moved
 *   before บันทึก is two queued commands, and when the second is sent the first
 *   has only just been given a real id. `naming` is how a command reports the
 *   ids its rows got; `context.id` is how every later command reads them.
 *
 * There is no `inverse`. ยกเลิก on the board puts back a timetable this browser
 * still has (see `plan-remote.ts`), and nothing else is ever taken back — which
 * is why deleting a course asks first.
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
import type { CommandContext, RemoteCommand } from "./plan-remote.ts";
import { validateRoomDraft, type RoomDraft, type RoomOverride } from "./rooms.ts";
import { sortAssignments } from "./scheduler.ts";
import { electiveService } from "@/lib/services/elective";
import type { Assignment, PlanCourse, PlanRoom, ScheduleResult } from "./plan-types.ts";
import { slotLabel, type SlotId } from "./slots.ts";

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

/**
 * The three ids a course write needs and the grid never shows.
 *
 * Looked up under the id the course has *now* — a course added earlier in the
 * same save was drawn under a placeholder, and the entry the server's answer
 * put in the index is filed under the id it really got.
 */
function linkOf(context: CommandContext, courseId: string) {
  const id = context.id(courseId);
  const link = context.current().index.courses.get(id) ?? context.before.index.courses.get(courseId);
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
function peopleIds(context: CommandContext, courseId: string, draft: CourseDraft) {
  const link = linkOf(context, courseId);
  const before = courseOf(context.before, courseId);
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

/**
 * The id the server gave a period that was drawn here.
 *
 * Matched on (course, period), which is the UNIQUE constraint the table
 * carries — and on the course id the request actually used, not the one the
 * period was drawn under, because a course created earlier in the same save
 * has since been renamed to its real id everywhere in the draft.
 */
const namePeriod = (drawnId: string, sentCourseId: string, slotId: SlotId) =>
  (settled: RemoteState): Array<readonly [string, string]> => {
    const real = settled.document.assignments.find(
      (item) => item.slotId === slotId && item.courseId === sentCourseId,
    );
    return real && real.id !== drawnId ? [[drawnId, real.id] as const] : [];
  };

/* ------------------------------------------------------------------ *
 * periods
 * ------------------------------------------------------------------ */

export function placeCommand(courseId: string, slotId: SlotId, roomId: string | null): RemoteCommand {
  // The id `placeAssignment` gives the new period, and the course id the
  // request went out under — the two halves `naming` needs to pair the row on
  // screen with the row the database made.
  let drawnId = "";
  let sentCourseId = courseId;
  return {
    scope: "timetable",
    what: "จัดคาบไม่สำเร็จ",
    label: `จัดคาบ ${slotLabel(slotId)}`,
    apply: (state) => {
      const assignments = sortAssignments(
        placeAssignment({
          courses: state.payload.courses,
          rooms: state.payload.rooms,
          assignments: state.document.assignments,
          courseId,
          slotId,
          roomId,
        }),
      );
      drawnId =
        assignments.find((item) => item.courseId === courseId && item.slotId === slotId)?.id ?? "";
      return withDocument(state, { assignments });
    },
    send: async ({ id }) => {
      sentCourseId = id(courseId);
      return reconcileSession(
        await electiveService.placeSession(sessionWrite({ courseId, slotId, roomId }, id)),
      );
    },
    naming: (settled) => namePeriod(drawnId, sentCourseId, slotId)(settled),
  };
}

export function moveCommand(assignmentId: string, slotId: SlotId, roomId: string | null): RemoteCommand {
  return {
    scope: "timetable",
    what: "ย้ายคาบไม่สำเร็จ",
    label: `ย้ายคาบไป ${slotLabel(slotId)}`,
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
    send: async ({ before, id }) => {
      await electiveService.updateSession(
        serverId(id(assignmentId), "คาบ"),
        sessionWriteFrom(sessionOf(before, assignmentId), { slotId, roomId }, id),
      );
    },
  };
}

export function removeCommand(assignmentId: string): RemoteCommand {
  return {
    scope: "timetable",
    what: "เอาคาบออกไม่สำเร็จ",
    label: "เอาคาบออกจากตาราง",
    apply: (state) => {
      sessionOf(state, assignmentId);
      return withDocument(state, { assignments: assignmentsWithout(state, assignmentId) });
    },
    send: async ({ id }) => {
      await electiveService.removeSession(serverId(id(assignmentId), "คาบ"));
    },
  };
}

export function toggleLockCommand(assignmentId: string): RemoteCommand {
  return {
    scope: "timetable",
    what: "เปลี่ยนสถานะล็อกไม่สำเร็จ",
    label: "ล็อก/ปลดล็อกคาบ",
    apply: (state) => {
      const was = sessionOf(state, assignmentId);
      return withDocument(state, {
        assignments: state.document.assignments.map((item) =>
          item.id === assignmentId ? { ...item, locked: !was.locked } : item,
        ),
      });
    },
    send: async ({ after, id }) => {
      await electiveService.updateSession(
        serverId(id(assignmentId), "คาบ"),
        sessionWriteFrom(sessionOf(after, assignmentId), {}, id),
      );
    },
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
    scope: "timetable",
    what: "ปลดล็อกวิชาไม่สำเร็จ",
    label: "ปลดล็อกทุกคาบของวิชา",
    apply: (state) =>
      withDocument(state, {
        assignments: state.document.assignments.map((item) =>
          item.courseId === courseId ? { ...item, locked: false } : item,
        ),
      }),
    send: async ({ before, id }) => {
      for (const item of before.document.assignments) {
        if (item.courseId === courseId && item.locked) {
          await electiveService.updateSession(
            serverId(id(item.id), "คาบ"),
            sessionWriteFrom(item, { locked: false }, id),
          );
        }
      }
    },
  };
}

export function setTimeCommand(assignmentId: string, startTime: string, endTime: string): RemoteCommand {
  return {
    scope: "timetable",
    what: "แก้เวลาไม่สำเร็จ",
    label: `แก้เวลาเป็น ${startTime}-${endTime}`,
    apply: (state) =>
      withDocument(state, {
        assignments: changeAssignmentTime(state.document.assignments, assignmentId, startTime, endTime),
      }),
    send: async ({ after, id }) => {
      await electiveService.updateSession(
        serverId(id(assignmentId), "คาบ"),
        sessionWriteFrom(sessionOf(after, assignmentId), {}, id),
      );
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
export function replaceCommand(next: Assignment[], what: string, label: string): RemoteCommand {
  let sentCourseIds = new Map<string, string>();
  return {
    scope: "timetable",
    what,
    label,
    apply: (state) => withDocument(state, { assignments: sortAssignments(next) }),
    send: async ({ id }) => {
      sentCourseIds = new Map(next.map((item) => [item.id, id(item.courseId)]));
      const written = await electiveService.replaceSessions(
        next
          .filter((item) => !item.locked)
          .map((item) =>
            sessionWrite(
              {
                courseId: item.courseId,
                slotId: item.slotId,
                roomId: item.roomId,
                source: item.source,
                startTime: item.startTime,
                endTime: item.endTime,
              },
              id,
            ),
          ),
      );
      // The answer is the whole term's periods, ids included — the one case
      // where taking the server's list wholesale is simpler than patching.
      return (state) => withDocument(state, { assignments: sortAssignments(written.map(readSession)) });
    },
    // Every period in the list is a row now, under an id this browser has not
    // seen; a later press that named one of them by the id it was drawn under
    // has to be pointed at the right one.
    naming: (settled) =>
      next.flatMap((drawn) =>
        namePeriod(drawn.id, sentCourseIds.get(drawn.id) ?? drawn.courseId, drawn.slotId)(settled),
      ),
  };
}

/* ------------------------------------------------------------------ *
 * courses
 * ------------------------------------------------------------------ */

export function setAvailabilityCommand(courseId: string, availability: SlotId[]): RemoteCommand {
  const slots = sortSlots(availability);
  return {
    scope: "now",
    what: "บันทึกช่วงที่สะดวกไม่สำเร็จ",
    label: slots.length ? `ช่วงที่สะดวก ${slots.length} คาบ` : "ล้างช่วงที่สะดวก",
    apply: (state) => {
      courseOf(state, courseId);
      return withCourses(
        state,
        state.payload.courses.map((item) => (item.id === courseId ? { ...item, availability: slots } : item)),
      );
    },
    send: async ({ id }) => {
      await electiveService.setAvailability(serverId(id(courseId), "วิชา"), slots);
    },
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
    scope: "now",
    what: "บันทึกวิชาไม่สำเร็จ",
    label: `แก้วิชา ${next.courseCode}`,
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
    send: async (context) => {
      const { after, before, id } = context;
      const updated = await electiveService.updateElective(
        serverId(id(courseId), "วิชา"),
        courseWrite(next, { ...peopleIds(context, courseId, next), termId: before.index.termId }),
      );
      // Going online strands the rooms the periods used to sit in; the server
      // took the course but not the periods, so they follow here.
      if (next.deliveryMode === "ONLINE") {
        for (const item of after.document.assignments) {
          if (item.courseId === courseId && item.roomId === null) {
            await electiveService.updateSession(serverId(id(item.id), "คาบ"), sessionWriteFrom(item, {}, id));
          }
        }
      }
      return reconcileCourse(updated);
    },
  };
}

export function setCourseFieldCommand(courseId: string, patch: CourseOverride, course: PlanCourse): RemoteCommand {
  return updateCourseCommand(courseId, { ...courseDraftFrom(course), ...patch });
}

export function addCourseCommand(draft: CourseDraft, companyId: number): RemoteCommand {
  const next = normalizeCourseDraft(draft);
  const temporary = placeholderId("course");
  return {
    scope: "now",
    what: "เพิ่มรายวิชาไม่สำเร็จ",
    label: `เพิ่มวิชา ${next.courseCode}`,
    apply: (state) => {
      const error = validateCourseDraft(next, state.payload.courses);
      if (error) throw new Error(error);
      return withCourses(state, [...state.payload.courses, { id: temporary, ...next }]);
    },
    send: async ({ before }) =>
      reconcileCourse(
        await electiveService.createElective(
          courseWrite(next, { companyId, termId: before.index.termId }),
        ),
      ),
    naming: (settled) => {
      const created = settled.payload.courses.find(
        (course) => course.courseCode === next.courseCode && course.section === next.section,
      );
      return created && created.id !== temporary ? [[temporary, created.id] as const] : [];
    },
  };
}

/**
 * Delete a course. Its periods and its paperwork go with it (ON DELETE
 * CASCADE), which is why the list asks before queueing one — though until
 * บันทึก it is still only a draft, and stepping back takes it off the queue.
 */
export function removeCourseCommand(courseId: string): RemoteCommand {
  return {
    scope: "now",
    what: "ลบวิชาไม่สำเร็จ",
    label: "ลบวิชา",
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
    send: async ({ id }) => {
      await electiveService.removeElective(serverId(id(courseId), "วิชา"));
    },
  };
}

/* ------------------------------------------------------------------ *
 * rooms
 * ------------------------------------------------------------------ */

export function addRoomCommand(draft: RoomDraft): RemoteCommand {
  const temporary = placeholderId("room");
  return {
    scope: "now",
    what: "เพิ่มห้องไม่สำเร็จ",
    label: `เพิ่มห้อง ${draft.name.trim()}`,
    apply: (state) => {
      const error = validateRoomDraft(draft, state.payload.rooms);
      if (error) throw new Error(error);
      return withRooms(state, [...state.payload.rooms, { id: temporary, ...draft, blockedSlots: [] }]);
    },
    send: async () => reconcileRoom(await electiveService.createRoom(roomWrite(draft))),
    naming: (settled) => {
      const created = settled.payload.rooms.find(
        (room) => room.building === draft.building.trim() && room.name === draft.name.trim(),
      );
      return created && created.id !== temporary ? [[temporary, created.id] as const] : [];
    },
  };
}

export function updateRoomCommand(roomId: string, patch: RoomOverride): RemoteCommand {
  return {
    scope: "now",
    what: "บันทึกห้องไม่สำเร็จ",
    label: "แก้ข้อมูลห้อง",
    apply: (state) => {
      const room = roomOf(state, roomId);
      const error = validateRoomDraft({ ...room, ...patch }, state.payload.rooms, roomId);
      if (error) throw new Error(error);
      return withRooms(
        state,
        state.payload.rooms.map((item) => (item.id === roomId ? { ...item, ...patch } : item)),
      );
    },
    send: async ({ after, id }) => {
      await electiveService.updateRoom(serverId(id(roomId), "ห้อง"), roomWrite(roomOf(after, roomId)));
    },
  };
}

export function removeRoomCommand(roomId: string): RemoteCommand {
  return {
    scope: "now",
    what: "ลบห้องไม่สำเร็จ",
    label: "ลบห้อง",
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
    send: async ({ id }) => {
      await electiveService.removeRoom(serverId(id(roomId), "ห้อง"));
    },
  };
}

export function setBlockedCommand(roomId: string, slotId: SlotId, reason: string | null): RemoteCommand {
  const trimmed = reason?.trim() || null;
  return {
    scope: "now",
    what: "บันทึกคาบที่ห้องติดงานอื่นไม่สำเร็จ",
    label: trimmed ? `จองห้องคาบ ${slotLabel(slotId)}` : `ปล่อยคาบ ${slotLabel(slotId)}`,
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
    send: async ({ after, id }) => {
      await electiveService.setRoomBlocks(
        serverId(id(roomId), "ห้อง"),
        roomOf(after, roomId).blockedSlots.map((block) => ({ slot: block.slotId, reason: block.reason })),
      );
    },
  };
}

/* ------------------------------------------------------------------ *
 * paperwork
 * ------------------------------------------------------------------ */

export function setChecklistCommand(courseId: string, patch: Partial<CourseChecklist>): RemoteCommand {
  return {
    scope: "now",
    what: "บันทึกเช็กลิสต์ไม่สำเร็จ",
    label: "แก้เช็กลิสต์เอกสาร",
    apply: (state) => withChecklist(state, courseId, patch),
    send: async ({ id }) => {
      await electiveService.updateChecklist(serverId(id(courseId), "วิชา"), checklistPatch(patch));
    },
  };
}

/* ------------------------------------------------------------------ *
 * scheduling
 * ------------------------------------------------------------------ */

export function autoAssignCommand(result: ScheduleResult): RemoteCommand {
  return replaceCommand(result.assignments, "จัดตารางใหม่ไม่สำเร็จ", "จัดตารางใหม่ทั้งเทอม");
}

export function clearUnlockedCommand(state: RemoteState): RemoteCommand {
  return replaceCommand(
    state.document.assignments.filter((item) => item.locked),
    "ล้างคาบไม่สำเร็จ",
    "ล้างคาบที่ยังไม่ล็อก",
  );
}

