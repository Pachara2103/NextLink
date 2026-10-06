# Elective planner in Graph_RAG

The elective planner now lives inside the authenticated NextLink console at
`/elective-plan`. Desktop and mobile navigation link to the planner and back to
the existing console panels. Login preserves the requested planner page and its
filters. The existing backend session validation still gates every planner route.

## Website themes

The theme selector applies to the entire website, including login, the console,
portalled profile dialogs, and the planner:

- **สีดั้งเดิม**: the original planner's light canvas, navy header and weekday colours.
- **โหมดมืด**: Graph_RAG's CARBON palette, with matching text, status colours,
  borders, native inputs, tables and dialogs. This is the default for new visitors.

A `nextlink-theme` cookie supplies the initial server-rendered theme so a saved
choice does not flash the other palette on reload. `nextlink.theme` in localStorage
synchronizes changes between tabs. The selector remains usable when localStorage
writes are unavailable.

`src/app/globals.css` owns the website palette. Planner CSS is scoped under
`.elective-planner`; its animation names are prefixed. The planner's table scrolls
inside the available console pane instead of using standalone viewport margins.

## Source and migration boundary

Ported from `violin11909/NextLink-Elective-Plan` commit
`df48be432687a8bbfe1cf94d8ae95420e4250aff` (planner audit fixes in PR #4).
The source repository remains separate and unchanged. Feature components, domain
logic, seed fixtures and regression checks live under the Graph_RAG frontend.

Included workflows: automatic scheduling in a Web Worker, manual placement and
movement, lock/unlock, conflict explanations, room CRUD and reservations,
availability editing, course filters, checklists, archived terms, JSON backups,
Excel export, recovery and undo. The shared PlanProvider also retains unsaved
work and undo while moving between planner and console pages.

This migration hosts the existing browser-local planner inside Graph_RAG. It does
not create a PostgreSQL/Neo4j planner schema or connect example course data to the
live company database. The bundled courses and previous-term fixtures remain
labelled example data. Plans belong to the browser origin, not an authenticated
user account, and are not shared between devices or automatically cleared on
logout. Use a separate browser profile for independent plans on a shared machine.

To transfer an existing plan from the standalone website:

1. Open the original planner in the browser that holds the plan and choose
   **สำรองแผน JSON**.
2. Log in to Graph_RAG and open **จัดตารางวิชาเลือก**.
3. Choose **นำเข้าแผน** and select that backup. Inspect the result; an import can
   be undone using **เลิกทำรายการล่าสุด**.

Different websites cannot read each other's localStorage. The migration therefore
preserves the versioned JSON format and validates the imported document instead
of claiming that existing browser data moved automatically. Corrupt/unwritable
storage remains recoverable through the planner's status and backup controls.

## Adding courses to the term being planned

The course list is no longer only what `data/plan-courses.json` ships. The
courses sub-page carries an **＋ เพิ่มรายวิชา** button level with its two view tabs,
which opens one form for one course: code, title, category, company, lecturer,
delivery mode, the periods the company offered and how often the course meets,
plus optional coordinator contact, seats, weeks and notes. A saved course counts
as a course of the term currently being planned and is immediately available to
automatic scheduling, manual placement, conflict explanations, the checklist and
the Excel export. Courses added here are marked **เพิ่มเอง** in the table and can be
edited or removed from the same form; removing one also releases its periods,
and both actions are covered by **เลิกทำรายการล่าสุด**.

Added courses live beside the seed rather than in it, exactly as edited rooms do
— `lib/courses.ts` mirrors `lib/rooms.ts`. `courseEdits.added` holds courses a
person typed in, `courseEdits.removed` hides seeded ones, and `courseOverrides`
still carries corrections to seeded courses. A correction is written to whichever
half owns the course, so one course never has two records to disagree; a seeded
course therefore keeps picking up seed changes for fields nobody edited, and
**คืนค่าเริ่มต้น** restores the bundled list.

The form applies the rules `readCourse` applies to the seed file, said in Thai
instead of thrown at build time: a course code must be unique, and a course
cannot meet more often than the company offered. The company and lecturer names
are required because the scheduler treats them as resources — two courses with
the same lecturer cannot share a period, and blank names would read as one very
busy lecturer. `scripts/elective-plan/check-courses.mjs` covers these rules and
the merge/routing behaviour; it runs as part of `npm run check:planner`, which is
now 126 domain checks, and `npm run check:browser` is 44 scenarios across the two
stores (29 on the bundled plan, 15 on the shared one).

### Sections, one capacity, and one class per room

A course code is no longer an identity on its own: the same course taught to a
second group is a second row with the same code and a different `section`. The
form asks for it, the uniqueness rule is code + section, the id carries the
section from the second one on (`plan-21105801-2`), and the table prints
"ตอน 2" only where there is one — most courses have a single section, and
"ตอน 1" on every row is a word that says nothing.

`minSeats` is gone; `capacity` is the only number. The staff filling the form
know the real seat count, and a separate "smallest room this fits in" was a
second place for the same fact to be wrong. Room fitting, the "room is too
small" conflict and the "reduce the intake" suggestion all read `capacity` now,
and the bundled seed files no longer carry the field. A plan saved while it
still existed opens unchanged — the schema accepts the key and drops it.

Dropping a class into a room that already holds one at that period is refused
where the drop happens, rather than accepted and reported as a conflict
afterwards. Two classes in one room at one time is not a state worth saving,
and `elective_sessions` does not accept the row either.

The paperwork checklist has an eighth step, "สร้างคอร์สใน MCV", between asking
for instructor rights and inviting anyone in — the course has to exist before
anybody can be added to it. The course and company columns became one cell in
both tables to pay for the extra column.

### Plan document version 5

`courseEdits` made the stored plan version 4; renaming a room's `tier` to `type`
makes it version 5, written to `nextlink.plan.v5.<termId>`. Older documents are
read from their own keys — `nextlink.plan.v4.<termId>`, then
`nextlink.plan.v3.<termId>`, then `nextlink.plan.v1` for versions 1 and 2 — shown
with whatever they carried (a v4 room's `tier` is renamed on the way in by
`readStoredRoomPatch`, a v3 document has no added courses), and saved back under
the version 5 key when anything is next saved. The older keys are left in place,
so an older build still open in another tab keeps working from the plan it knows.
Backups exported before this change import unchanged. Plans still belong to the
browser origin: a course added on one machine reaches another only through
**สำรองแผน JSON** and **นำเข้าแผน**.

## The shared plan

The planner now has two stores behind one interface, chosen per process by
`PLAN_SOURCE` and read in `planSource()` (`lib/plan-data.ts`):

| `PLAN_SOURCE` | store | plan lives in |
|---|---|---|
| unset (default) | `RemotePlanStore` | `/api/v1/electives` → postgres |
| `seed` | `PlanStore` | bundled JSON + localStorage |

`seed` is an explicit opt-in, not a fallback: a planner that quietly dropped to a
mock when the API was down would look like it was working while saving nothing.
It is what `check-browser.mjs` drives and what makes the page openable with no
backend running.

**One request per thing changed. When it goes out is `RemoteCommand.scope`.**
The offline store writes the whole document under a lock, which is right for one
writer and wrong for several: the last whole-document write would erase
everything the others did since their read. So nothing here ever writes "the
plan" — every command is one request about one row. `lib/plan-commands.ts` is
that table, one entry per control, and each entry says when it is sent:

| `scope` | which controls | when it reaches the database |
|---|---|---|
| `"now"` | everything except the board — add/edit/delete a course, rooms, room bookings, availability, the paperwork checklist | at the press |
| `"timetable"` | the week board only: place, move, remove, lock, unlock a course's periods, retime, จัดตารางใหม่, ล้างที่ยังไม่ล็อก | at **บันทึก** on the board |

The line is not about risk or size; it is about whether the press is a decision
or a step towards one. Ticking "จดหมายเชิญ: ส่งแล้ว" is a decision, and holding it
back would only invent a second thing to remember to press. Dragging a class to
Wednesday to see how the week looks is not — placing a term is twenty drags where
the first nineteen are thinking out loud, and the room everyone else is reading
should not flicker through nineteen wrong answers first.

Both paths run `apply` at the press, so a drag the rules forbid
(`placeAssignment`, `validateCourseDraft`) is refused there and becomes neither
a request nor a queued move.

**The save bar** is in the board's own heading on the overview —
`TimetableSave` in `components/timetable-save.tsx` — not in the page header,
because what it saves is that one table, and a button in the header of every
page would look like it saved the page. It reads `บันทึกตาราง N รายการ` while
moves are waiting (the list is in its tooltip) and a quiet `บันทึกแล้ว`
otherwise, with **ยกเลิกการแก้ไข** beside it only while there is something to
cancel. ยกเลิก restores the timetable this browser was showing before the first
drag — no request — and it puts back *only* the periods, so a course added or a
box ticked while the board was being worked on is untouched. Closing the tab
loses unsaved moves, so `PlanShell` registers a `beforeunload` warning while
`unsaved > 0` from any planner page.

There is no undo anywhere on the shared plan. Outside the board there is nothing
to undo — it is already saved, and a five-second "เลิกทำ" toast was a worse
answer than the confirmation the control already asks for. On the board, ยกเลิก
sits permanently beside บันทึก instead. `RemoteCommand.inverse` is gone with the
toast that used it.

**Ids, and the one thing the board's queue costs.** The database counts in
integers, every domain id in this app is a string. `lib/plan-api.ts` is the only
place both vocabularies appear; a row drawn before the server has named it gets
a placeholder that `serverId()` refuses, so a request built from one fails here
rather than reaching `/electives/NaN`. Holding moves makes that reachable in a
new way: a period placed and then locked before บันทึก is two queued commands,
and when the second is sent the first has only just been given a real id.
`RemoteCommand.naming` is how a command reports the ids its rows were given once
the server answers, and `CommandContext.id` is how every later command reads
them; `reconcile*` in `lib/plan-state.ts` also rewrites anything in the draft
that named the row by its placeholder. Matching is by the three UNIQUE
constraints in `migrations/electives.sql`.

**A refusal at บันทึก stops the queue** at the move that was refused, leaves it
and everything after it waiting, and leaves the board alone — nothing is thrown
away, and the message is the backend's own words. What it costs is ยกเลิก: once
part of a queue has reached the database the timetable this store remembers from
before the save is half-written, so that case (`blocked`) re-reads from the
server instead of putting anything back. A refusal on a `"now"` command is the
opposite: it *did* go out, so the control goes back to what the server still has.

**ช่วงที่สะดวก is read until แก้ไข.** Each course's grid used to save on every
tick. A company's answer is one answer given in one phone call — "จันทร์เช้าได้
พุธบ่ายก็ได้ อ้อ เสาร์ไม่ได้แล้ว" — and saving the halfway versions of it puts
times on the shared plan that nobody ever offered. So a card is a record until
แก้ไข is pressed, one card at a time, with บันทึก and ยกเลิก under the grid and
one `PUT /{id}/availability` for the whole answer.

**What is hidden on the shared plan**: สำรองแผน JSON, นำเข้าแผน, คืนค่าเริ่มต้น,
and the permanent เลิกทำรายการล่าสุด. A file on one person's disk is not a backup
of a table everyone writes to, and importing one would mean one person's
afternoon replacing everybody's.

The provider stays at the root of the app so that a draft survives a trip to
another screen and back, but the plan is only read once a planner page is on
screen — `PlanShell` calls `plan.load()`.

### Any term, including one that has ended

"ปิดเทอม" means a term is no longer the one being planned. It does not mean the
record is complete: paperwork arrives late, and whole terms get entered after the
fact. So a finished term is now loaded through the same store as the current one
and every control works on it — `_assert_editable` is gone from
`services/elective.py`, and the read-only `ArchivedTerm` path is seed mode's
only.

The term switcher on the course list calls `RemotePlanStore.selectTerm(id)`,
which re-reads the plan for that term; the board, the rooms and the checklist
follow, because they are all reading the one store. Two consequences worth
knowing:

- **Switching is refused while the board has unsaved moves.** They were made
  against the term they were made on, and carrying them across would write one
  term's timetable into another's rows. Save or cancel first. With no term
  picked the course list shows the term the *planner* is on rather than the term
  being planned — otherwise walking from a past term's board to that page would
  ask the store to change term under somebody who only changed page.
- **Finished terms are no longer read on load.** The store used to fetch every
  archived term's whole plan in the background to fill the switcher; it now
  fetches only the term somebody asks for, so a department with twenty terms of
  history costs one request on load instead of twenty-one.

### The board, and why it is fast to drag on

Two things the board does that nothing else on the planner does: it draws three
hundred-odd cells, and it re-renders while the pointer is moving.

- **The drop verdict is one pass, not one per cell.** `cellState` used to be a
  function the table called inside its own loops — 306 times per render, each
  call rebuilding the scheduler's context from the whole course list and
  re-filtering every period placed so far. It is now a `Map` built once per held
  class (`dropStates`), and the conflict list is indexed once (`blockedBy`)
  rather than filtered twice per card.
- **`dragover` only re-renders when the answer changes.** That event fires
  continuously while the pointer is anywhere over a cell — dozens of times a
  second, nearly all of them saying what the last one said — and each one used
  to set `hover` unconditionally.
- **A drag that ends anywhere lets go.** `dragend` on the card covers the
  ordinary case but not a drag that ends outside the window, one the browser
  cancels itself, or a card re-rendered out from under the drag. A board left
  holding a class keeps all 306 periods lit and interactive, which is the
  expensive state to be stuck in, so `window` listeners for `dragend`, `drop`
  and Escape release it too.

Measured on a fixture with 16 rooms and 25 courses (306 cells), in-page around a
real click: picking a class up costs ~165 ms of main thread, putting it down is
free, and a `dragover` that changes the hovered cell is about one frame.

In dark mode the cell and the card were both painted `--ep-surface`, which is
one colour there (`#101418`) — a class in a period was the same shade as the
empty period beside it. The three layers are now pulled apart: the grid sinks to
the page background, the card rises well above it, and the card's border is
bright enough to survive at 12px.

`TermMeta.serverId` carries `elective_terms.id` for this — `TermMeta.id` is the
`"2569-1"` label the router and the storage key use, and no route takes it.

### Setting up a database

```sh
psql -d nextlink -f backend/migrations/init.sql
psql -d nextlink -f backend/migrations/outbox.sql
psql -d nextlink -f backend/migrations/electives.sql
psql -d nextlink -f backend/migrations/elective_seed.sql
```

The last file is what makes the page openable at all: a database with the tables
but no rows has no current term (`GET /plan` answers 404) and no room columns to
drag a class into. It creates the term from the date it is run — Chula's ภาคต้น
starts in August, so January–July still counts as the academic year that began
last August — and the sixteen rooms the department uses every term: จุฬาพัฒน์ 4
and 5 as `ready`, ตึก 3 / ตึก 4 / ตึกร้อยปี as `needs_approval` with estimated
seat counts.

Every insert is `ON CONFLICT DO NOTHING`, so running it again adds nothing and
overwrites nothing: a room whose seat count was corrected in the UI, or that was
taken out of service, stays as the UI left it. It also will not reopen a term
somebody deliberately archived — it says so instead, and points at
`POST /api/v1/electives/terms`. `backend/tests/check_elective.py` covers all
three behaviours.

Room numbers came from `data/plan-rooms.json`, which from here on is the dev
fixture only. The table is the real list; rooms are edited through the planner.

**An existing database** needs one more file, once:

```sh
psql -d nextlink -f backend/migrations/elective_reshape.sql
```

It renames `elective_rooms.tier` to `type` and folds `elective_availability`
from one row per period into one row per course holding a `slots TEXT[]`,
carrying the periods across in reading order. Every step checks whether it is
needed first, so it is safe to run twice, and safe to run against a database
built from `electives.sql` (where it does nothing). A database that has been
through it and one created fresh have identical columns, constraints and
indexes — the psql commands under "Verification" below check exactly that.

`migrations/local/` is not part of either list: those files create tables that
already exist on Neon and are owned by another service. They exist so the
console can be opened on a laptop without connecting to the real database, and
running them against a real one is never right. `line_group_reads.sql` is *not*
among them despite the name — it is this backend's own state and lives on the
`nextlink` database.

## Verification

Run from `frontend/` using Node 22.6+ (the domain scripts use TypeScript stripping):

```sh
npm ci
npm run check:config
npm run check:planner
API_ORIGIN=http://127.0.0.1:18999 npm run build
npx playwright install chromium
npm run check:browser
```

For the backend, from `backend/` against a disposable local database:

```sh
createdb nextlink_check
psql -d nextlink_check -f migrations/init.sql
psql -d nextlink_check -f migrations/outbox.sql
psql -d nextlink_check -f migrations/electives.sql
NEXTLINK_DATABASE_URL=postgresql://postgres@localhost:5432/nextlink_check \
  ELECTIVE_CHECK_WIPE=yes python tests/check_elective.py
```

To check that `elective_reshape.sql` lands a database exactly where
`electives.sql` would have, build one of each and compare their shapes:

```sh
# `migrated` = the old schema plus the reshape; `fresh` = electives.sql today
for db in migrated fresh; do
  psql -q -d $db -t -c "select table_name||'.'||column_name||' '||data_type
    from information_schema.columns
    where table_name in ('elective_availability','elective_rooms') order by 1;" > /tmp/$db.cols
  psql -q -d $db -t -c "select conname from pg_constraint c join pg_class t on t.oid=c.conrelid
    where t.relname in ('elective_availability','elective_rooms') order by 1;" > /tmp/$db.cons
done
diff /tmp/migrated.cols /tmp/fresh.cols && diff /tmp/migrated.cons /tmp/fresh.cons
```

`check:browser` runs both suites: `check-browser.mjs` starts the server with
`PLAN_SOURCE=seed` and drives the bundled plan; `check-browser-api.mjs` starts it
without that variable and drives the shared plan against a fixture API that can
be told to refuse a write. Set `PW_CHROMIUM` to use a browser Playwright did not
install itself.

The browser script starts and stops a local production server on a free port.
All backend API calls are intercepted with local fixtures, including login and
session validation. Unexpected API calls fail the test. It does not log in to a
real service, modify company data or verify a deployment. Results, downloads and
screenshots are written to ignored `output/browser/`.

Full-project ESLint passes with zero errors and 13 pre-existing warnings for
unused imports/variables and the existing image elements. The ActionMenu effect
error on base commit `4eee0df` is fixed as part of the final review.

### Verified result

On 2026-09-12, the integration passed the production Next.js build (including
TypeScript) with blank `API_ORIGIN`, 20 configuration checks, all 78 domain
regression checks, and 23 browser regression scenarios after integrating `fc99739`.
The browser run had no uncaught page errors, failed Next.js assets or unexpected
API requests. See `elective-planner-verification.json` for the recorded scenarios.
Full-project ESLint passes with zero errors and the 13 warnings described above.
The browser suite also checks the final-review fixes below and the updated
`year`/`semester` note workflow in both themes.

Integration-specific issues fixed during verification:

- Standalone viewport margins allowed the timetable to overlap the new sidebar.
  The board and wide course tables now scroll within their console pane.
- The white NextLink wordmark disappeared on the classic surface. Its classic
  appearance now uses a dark wordmark while retaining the original dark-theme asset.
- Native select options retained hardcoded dark colours. They now use website tokens.
- Navigating away could otherwise discard an unsaved planner draft and its undo
  history. The root provider keeps both across console/planner client navigation.
- Mobile navigation could hide the active planner link beyond the scroll area.
  It now brings the active destination into view and provides 44px touch targets.
- Planner room/booking dialogs reset local state in effects, which conflicted
  with the host's React rules. A mounted form now initializes from its target and
  uses an effect only to synchronize the native dialog.

### Final review findings

| Priority | Trigger and issue | Resolution and evidence |
| --- | --- | --- |
| P2 | Shrink an already-open desktop planner to mobile: the active navigation link stayed outside the horizontal viewport because its effect only ran when the selected page changed. | Reproduced against the previous build, then fixed with a ResizeObserver. The browser test resizes the same page and verifies both edges of the active link remain visible. |
| P2 | Import a backup whose file cannot be read: the rejected File.text() promise escaped the event handler without a useful message. | Catch the read failure and report it through the planner store. Fault injection verifies the saved document remains unchanged, a visible error appears and a subsequent valid import works. |
| P3 | ActionMenu reset state inside an effect when disabled, leaving full-project lint failing. | Reset the open state before React commits children. A fixture contact request verifies that a keyboard-triggered pending operation closes the menu and a failed request does not reopen it. |

### Follow-up improvements

- Terms are still a build-time list. Creating a term from the app, closing the
  current one and reading it back as an archive needs the term registry in
  `data/terms/index.json` to become runtime state merged with the seed, the way
  rooms and courses already are, plus a written archive per closed term
  (`ArchivedSession` already records a room's name rather than its id for this).
  Per-term plan documents and course adding — what a new, empty term starts from
  — are in place for it.
- Before using this as a shared operational planner, add an authenticated backend
  for plans with explicit ownership/term boundaries and transactional concurrency.
  Browser-local storage currently has neither account isolation nor device sync.
- Replace the bundled example courses/rooms and archives with an approved data
  source when the operational schema is ready; preserve the visible example-data
  label until that integration is verified.
- Consider loading the initial planner dataset on first entry after measuring the
  login/core-page payload. The current root provider deliberately keeps the draft
  alive across routes and also sends the small seed payload to non-planner pages.

The regression suite above uses API fixtures. Live hosting checks are recorded
separately below; fixture results do not verify the production database.

## Hosting in the frontend owner's account

The separate Vercel project `nano109s-projects/nextlink-console` uses the Next.js
preset and `frontend` as its Root Directory. Production and Preview both set
`API_ORIGIN=https://next-link-backend.vercel.app`, as requested by the owner to
reuse the existing team's API and database. The variable is server-side: requests
to `/api/v1/*` are proxied through Next.js, preserving the existing login flow.

The public API origin was recovered from this repository's history and verified
on 2026-09-12: `/api/v1/health` returned HTTP 200 with `ready=true`; unauthenticated
`/api/v1/auth/me` returned HTTP 401. At that check the health response matched the
API behind the team's existing console, including its process boot identifier.
The Railway project accessible to this owner contains the LINE bot and Postgres;
the LINE bot's hostname returns 404 for the Graph_RAG authentication route and
must not be substituted for `API_ORIGIN`. No database credentials are needed by
the frontend, and this setup does not change the backend or database.

Run deployment commands from the Graph_RAG repository root, where the ignored
`.vercel/project.json` links this checkout to the new project:

```sh
vercel link --yes --project nextlink-console --scope nano109s-projects
vercel deploy --dry --json --scope nano109s-projects
vercel deploy --prod --yes --scope nano109s-projects
```

`.vercelignore` excludes local environment files, dependencies and browser-test
artifacts from CLI uploads. `API_ORIGIN` can explicitly override the backend
origin; it is read at build time. Missing or blank values use
`https://next-link-backend.vercel.app` in production/preview builds and
`http://127.0.0.1:8000` in local development. This preserves the selected shared
team backend while allowing Vercel previews to build without a project variable.
Other backend deployments should set `API_ORIGIN` explicitly. The localhost target
in regression commands is a fixture target, not a hosted backend.

The value must be an absolute HTTP(S) origin without credentials, path, query or
fragment; trailing root slashes are normalized. Invalid values fail with a clear
configuration error that does not echo the supplied value. This fixes the prior
`undefined/api/v1/...` rewrite when the variable was missing. The proxy still
uses the browser's existing `/api/v1/*` contract.

`.github/workflows/frontend-integration.yml` now runs configuration checks,
planner checks, lint, a production build with blank `API_ORIGIN`, and the browser
suite on frontend PRs and pushes. API requests in browser tests use fixtures.
The browser suite includes filtering and editing upstream `year`/`semester`
notes in both website themes.

Automatic Git deployment is not connected: Vercel rejected the attempt to connect
`Pachara2103/NextLink` from this owner's account. CLI deployment can still use the
reviewed local checkout. Do not assume pushing this PR updates the new host.

### Historical live deployment — before the upstream refresh

- Production: https://nextlink-console.vercel.app
- Source: `5b63f3bca3b0fb14cd65e86cb1dcea17ea535428`.
- Deployment: `dpl_FkCH99suAyM7F4aLBtU9AtLYRYUh`, Vercel status **READY**.
- The remote Next.js build and TypeScript check passed.
- Public `/login` returned HTTP 200. The new origin's `/api/v1/health` returned
  HTTP 200 with `status=ok`, `models=true`, and `ready=true`.
- `/api/v1/auth/me` returned HTTP 401 without credentials, preserving the API gate.
- A real browser redirected `/elective-plan` to
  `/login?next=%2Felective-plan`; both theme controls worked, classic persisted
  after reload, and dark persisted when navigating to the planner login link.
- The observed login navigation and theme interactions produced no browser
  console warnings or errors. No API fixtures were used for these live checks.

Authenticated planner/console actions were not exercised on the live backend:
no real account credentials were used and no business records were modified.
The fixture-based regression scenarios remain the evidence for those flows.
See `hosting-verification.json` for the live check record. The original team's
frontend Preview failure is separate from this successful production deployment;
its inaccessible build logs have not been diagnosed.
