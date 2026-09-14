#!/usr/bin/env node
/**
 * Tests for the course-list rules in lib/courses.ts.
 *
 * The course list stopped being a constant the day somebody could type a course
 * into it, and the rules that keep it honest fail quietly: a correction written
 * to the wrong half of the state, an id that reuses one a hidden course still
 * answers to, a course saved with fewer offered periods than it meets. Each
 * case below is one of those. `node --experimental-strip-types` runs the
 * TypeScript sources directly — no build step, no test framework.
 */
import { readFileSync } from "node:fs";
import {
  EMPTY_COURSE_EDITS,
  addCourse,
  courseDraftFrom,
  deleteCourse,
  isAddedCourse,
  makeCourseId,
  mergeCourses,
  normalizeCourseDraft,
  patchCourse,
  sortSlots,
  takenCourseIds,
  validateCourseDraft,
} from "../../src/features/elective-plan/lib/courses.ts";

let failures = 0;
const check = (name, fn) => {
  try {
    const problem = fn();
    if (problem) {
      failures += 1;
      console.error(`  ✗ ${name}\n      ${problem}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}\n      threw: ${error.message}`);
  }
};

const course = (id, over = {}) => ({
  id,
  courseCode: over.courseCode ?? id.replace("plan-", ""),
  section: over.section ?? 1,
  title: over.title ?? `วิชา ${id}`,
  category: over.category ?? "วิศวกรรมซอฟต์แวร์",
  provider: over.provider ?? "บริษัทตัวอย่าง",
  instructor: over.instructor ?? "อาจารย์ตัวอย่าง",
  coordinator: over.coordinator ?? null,
  deliveryMode: over.deliveryMode ?? "ON_SITE",
  availability: over.availability ?? ["MON_AM"],
  sessionsPerWeek: over.sessionsPerWeek ?? 1,
  capacity: over.capacity ?? 40,
  weeks: over.weeks ?? 10,
  notes: over.notes ?? null,
});

const draft = (over = {}) => {
  const next = course("plan-21105899", over);
  delete next.id;
  return next;
};

const SEED = [course("plan-21105801"), course("plan-21105802"), course("plan-21105803")];
const EMPTY = { courseEdits: EMPTY_COURSE_EDITS, courseOverrides: {} };

/* ---- the seed data itself -------------------------------------------- */

check("every seeded course has a unique id, a unique code and enough offered periods", () => {
  const courses = JSON.parse(readFileSync("src/features/elective-plan/data/plan-courses.json", "utf8")).courses;
  if (new Set(courses.map((item) => item.id)).size !== courses.length) return "two courses share an id";
  if (new Set(courses.map((item) => item.courseCode)).size !== courses.length) return "two courses share a course code";
  // The same rule the form enforces, so a seed nobody could have typed in by
  // hand never ships: a course cannot meet more often than it is offered.
  const short = courses.find((item) => item.availability.length < item.sessionsPerWeek);
  return short ? `${short.courseCode} meets ${short.sessionsPerWeek}×/week but offers ${short.availability.length}` : null;
});

/* ---- merging --------------------------------------------------------- */

check("with no edits the seed comes back untouched, in order", () => {
  const merged = mergeCourses(SEED, EMPTY);
  return merged.map((item) => item.id).join(",") === "plan-21105801,plan-21105802,plan-21105803"
    ? null
    : "order or contents changed";
});

check("an override changes the course without touching the seed", () => {
  const state = patchCourse(EMPTY, "plan-21105802", { capacity: 90, deliveryMode: "ONLINE" });
  const found = mergeCourses(SEED, state).find((item) => item.id === "plan-21105802");
  if (found.capacity !== 90 || found.deliveryMode !== "ONLINE") return "the override did not apply";
  if (SEED[1].capacity !== 40) return "the seed array was mutated";
  return found.title === SEED[1].title ? null : "fields nobody edited were lost";
});

check("a hidden seed course comes back when the removal goes", () => {
  const state = deleteCourse(EMPTY, "plan-21105801");
  if (mergeCourses(SEED, state).some((item) => item.id === "plan-21105801")) return "the course is still listed";
  return mergeCourses(SEED, EMPTY).length === 3 ? null : "the seed did not survive the removal";
});

check("an added course is listed after the seed and is edited in place", () => {
  const { state, id } = addCourse(EMPTY, draft(), takenCourseIds(SEED, EMPTY_COURSE_EDITS));
  const patched = patchCourse(state, id, { capacity: 55 });
  if (Object.keys(patched.courseOverrides).length > 0) return "an added course collected an override instead of being edited";
  const merged = mergeCourses(SEED, patched);
  if (merged.length !== 4 || merged[3].id !== id) return "the added course is missing or out of order";
  if (!isAddedCourse(patched.courseEdits, id)) return "the added course does not know it was added";
  return merged[3].capacity === 55 ? null : "the edit did not apply";
});

check("deleting a course forgets what was typed about it", () => {
  const withOverride = patchCourse(EMPTY, "plan-21105802", { capacity: 90 });
  const deleted = deleteCourse(withOverride, "plan-21105802");
  if (deleted.courseOverrides["plan-21105802"]) return "a hidden course kept its override";
  const added = addCourse(EMPTY, draft(), []);
  const gone = deleteCourse(added.state, added.id);
  if (gone.courseEdits.added.length !== 0) return "an added course was hidden rather than forgotten";
  return gone.courseEdits.removed.includes(added.id) ? "an added course was also recorded as removed" : null;
});

check("removing the same course twice does not queue it twice", () => {
  const once = deleteCourse(EMPTY, "plan-21105801");
  const twice = deleteCourse(once, "plan-21105801");
  return twice.courseEdits.removed.length === 1 ? null : `removed ${twice.courseEdits.removed.length} times`;
});

/* ---- ids ------------------------------------------------------------- */

check("an id comes from the course code, and never reuses a hidden course's", () => {
  if (makeCourseId(draft({ courseCode: "21105899" }), []) !== "plan-21105899") return "the code is not in the id";
  const taken = ["plan-21105899"];
  if (makeCourseId(draft({ courseCode: "21105899" }), taken) !== "plan-21105899-2") return "a taken id was handed out again";
  // takenCourseIds counts a hidden seed course: its periods and paperwork are
  // still keyed by that id, and a new course must not inherit them.
  const hidden = deleteCourse(EMPTY, "plan-21105801");
  return takenCourseIds(SEED, hidden.courseEdits).includes("plan-21105801")
    ? null
    : "a hidden course's id was offered for reuse";
});

check("a code with no ASCII in it still makes a usable id", () => {
  const id = makeCourseId(draft({ courseCode: "วิชาใหม่" }), []);
  return /^[a-z0-9-]+$/.test(id) ? null : `id "${id}" is not URL- or schema-safe`;
});

/* ---- the form's rules ------------------------------------------------ */

check("a course must have a code, a title, a company and a lecturer", () => {
  const missing = [
    ["courseCode", { courseCode: "  " }],
    ["title", { title: "" }],
    ["provider", { provider: " " }],
    ["instructor", { instructor: "" }],
    ["category", { category: "" }],
  ];
  for (const [field, over] of missing) {
    if (!validateCourseDraft(draft(over), SEED)) return `an empty ${field} was accepted`;
  }
  return validateCourseDraft(draft(), SEED) ? `a complete draft was rejected: ${validateCourseDraft(draft(), SEED)}` : null;
});

check("two courses cannot share a code and a section, but another section can", () => {
  const clash = draft({ courseCode: SEED[0].courseCode });
  if (!validateCourseDraft(clash, SEED)) return "a duplicate course code was accepted";
  if (validateCourseDraft(clash, SEED, SEED[0].id)) return "a course was rejected for clashing with itself";
  // Whitespace and case are not a different course.
  if (!validateCourseDraft(draft({ courseCode: ` ${SEED[0].courseCode} ` }), SEED)) return "a padded duplicate was accepted";
  // The same code taught to a second group is a second course, not a duplicate.
  return validateCourseDraft(draft({ courseCode: SEED[0].courseCode, section: 2 }), SEED);
});

check("a section is a whole number from 1, and lands in the id from the second on", () => {
  if (!validateCourseDraft(draft({ section: 0 }), SEED)) return "section 0 was accepted";
  if (!validateCourseDraft(draft({ section: 1.5 }), SEED)) return "a fractional section was accepted";
  if (makeCourseId(draft({ courseCode: "21105899", section: 1 }), []) !== "plan-21105899") return "section 1 should not be in the id";
  if (makeCourseId(draft({ courseCode: "21105899", section: 2 }), []) !== "plan-21105899-2") return "section 2 is missing from the id";
  // Two sections of one course are two ids, so they keep separate periods.
  const first = addCourse(EMPTY, draft({ courseCode: "21105899", section: 1 }), []);
  const second = addCourse(first.state, draft({ courseCode: "21105899", section: 2 }), [first.id]);
  return first.id !== second.id ? null : "both sections were given the same id";
});

check("a course cannot meet more often than the company offered", () => {
  if (!validateCourseDraft(draft({ sessionsPerWeek: 2, availability: ["MON_AM"] }), SEED)) return "2 periods a week from one offer was accepted";
  if (!validateCourseDraft(draft({ availability: [] }), SEED)) return "a course with no offered period was accepted";
  return validateCourseDraft(draft({ sessionsPerWeek: 2, availability: ["MON_AM", "THU_PM"] }), SEED);
});

check("counts have to be whole numbers inside the range the seed loader allows", () => {
  const bad = [
    { sessionsPerWeek: 0 },
    { sessionsPerWeek: 19, availability: sortSlots(["MON_AM"]) },
    { weeks: 0 },
    { weeks: 53 },
    { capacity: -1 },
    { capacity: 40.5 },
    { capacity: Number.NaN },
  ];
  for (const over of bad) {
    if (!validateCourseDraft(draft(over), SEED)) return `${JSON.stringify(over)} was accepted`;
  }
  return null;
});

check("a delivery mode the scheduler does not know is refused", () => {
  if (!validateCourseDraft(draft({ deliveryMode: "REMOTE" }), SEED)) return "an unknown delivery mode was accepted";
  return validateCourseDraft(draft({ deliveryMode: "ONLINE" }), SEED);
});

check("a coordinator is kept whole or dropped whole", () => {
  const named = normalizeCourseDraft(draft({ coordinator: { name: " คุณนลิน ", email: " a@b.co ", phone: "" } }));
  if (named.coordinator.name !== "คุณนลิน" || named.coordinator.email !== "a@b.co") return "the contact was not trimmed";
  if (named.coordinator.phone !== null) return "an empty phone number was kept as an empty string";
  const nameless = normalizeCourseDraft(draft({ coordinator: { name: "  ", email: "a@b.co", phone: null } }));
  if (nameless.coordinator !== null) return "a contact with no name was kept";
  return validateCourseDraft(draft({ coordinator: { name: "คุณนลิน", email: "not-an-email", phone: null } }), SEED)
    ? null
    : "a malformed coordinator email was accepted";
});

check("what gets stored is trimmed, de-duplicated and in week order", () => {
  const next = normalizeCourseDraft(draft({
    title: "  วิชาใหม่  ",
    notes: "   ",
    availability: ["THU_PM", "MON_AM", "THU_PM"],
  }));
  if (next.title !== "วิชาใหม่") return "the title was not trimmed";
  if (next.notes !== null) return "a blank note was stored as a string";
  return next.availability.join(",") === "MON_AM,THU_PM" ? null : `availability stored as ${next.availability.join(",")}`;
});

check("a draft taken from a course round-trips without changing it", () => {
  const source = course("plan-21105804", { availability: ["MON_AM", "THU_PM"], sessionsPerWeek: 2, notes: "หมายเหตุ" });
  const back = normalizeCourseDraft(courseDraftFrom(source));
  const expected = { ...source };
  delete expected.id;
  if (JSON.stringify(back) !== JSON.stringify(expected)) return `round trip changed the course: ${JSON.stringify(back)}`;
  // The draft must not share arrays with the course it came from, or editing
  // the form would edit the plan before anything was saved.
  const copy = courseDraftFrom(source);
  copy.availability.push("SAT_EVE");
  return source.availability.length === 2 ? null : "the draft shares its availability array with the course";
});

if (failures) {
  console.error(`\ncourses: ${failures} failing check(s)`);
  process.exit(1);
}
console.log("courses: ok (17 checks)");
