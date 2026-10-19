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
now 125 domain checks, and `npm run check:browser` is 36 scenarios across the two
stores (29 on the bundled plan, 7 on the shared one).

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

`courseEdits` made the stored plan version 4; renaming a room's `tier` to `type`,
following the column, makes it version 5, written to `nextlink.plan.v5.<termId>`.
A version 4 document is read from `nextlink.plan.v4.<termId>` (version 3 from
`nextlink.plan.v3.<termId>`, version 1/2 from `nextlink.plan.v1`) and its room
edits are renamed on the way in by `readStoredRoomPatch` — one line, in one
place, so the validator stays a statement about the current shape only. Without
it a v4 document would fail validation whole and lose every edit in it over one
renamed field. Each is shown as it is and saved back under the version 5 key when
anything is next saved; the older key is left in place, so an older build still
open in another tab keeps working from the plan it knows. Backups exported before this change
import unchanged. Plans still belong to the browser origin: a course added on one
machine reaches another only through **สำรองแผน JSON** and **นำเข้าแผน**.

## The shared plan

The planner now has two stores behind one interface, chosen per process by
`PLAN_SOURCE` and read in `planSource()` (`lib/plan-data.ts`):

| `PLAN_SOURCE` | store | plan lives in |
|---|---|---|
| unset (default) | `RemotePlanStore` | `/api/v1/electives` → postgres |
| `seed` | `PlanStore` | bundled JSON + localStorage |

### What is sent at the press, and what waits for บันทึก

Every command carries a `scope`. `"now"` is the default and sends at the press;
`"timetable"` draws the change and waits for the board's บันทึก, so it has no
`send` of its own.

| scope | commands | why |
|---|---|---|
| `timetable` | place, move, remove, retime, จัดตารางใหม่, ล้างที่ยังไม่ล็อก | laying out a week is twenty drags that are one decision, and half of those positions are ones the planner is only trying out |
| `now` | course add/edit/delete, availability, rooms, room bookings, checklist, lock/unlock | each is one decision, finished when it is pressed |

บันทึก sends the finished week as **one** request — `PUT /sessions`, the same
transactional swap จัดตารางใหม่ already used, which the server applies whole or
refuses whole. A refusal leaves the edits on screen with the reason beside them,
which is the only state they can be corrected from. ยกเลิก restores the week the
server last confirmed, and only the week: the courses and rooms were saved at the
press and are not that button's to undo. While anything is waiting, the focus
refresh is suppressed — a read would replace the edits with the server's week,
which is the one thing บันทึก exists to prevent.

Locking is `now` even though the control sits on a card: a lock is a statement
about a row the server already has — it is what the bulk swap leaves alone — so
it cannot be applied to a card that has not been saved yet.

There is no เลิกทำ anywhere on the page. A step back was right when the plan was
one person's document with a revision history behind it; on a plan several people
write to, the state it would restore may already have been built on by somebody
else, so the button promised something it could not do. ยกเลิก is the honest
version of the same idea: it discards edits that were never sent.

### Any term, including one that has ended

An ended term is read-only in no sense but the planning one. The backend has no
guard against writing to an `archived` term: backfilling terms that ran before
this page existed is the reason the history is worth reading at all, and
`current`/`archived` now says which term is being planned, not what may be
written. The courses tab keeps its add button on a past term and names that
term's row explicitly (`TermMeta.serverId`), because the store is holding the
term being planned and "the term being looked at" is that page's business alone —
so the new course is written to the right term and read back from the archives
rather than drawn under the wrong term's name. The checklist view still
disappears on a past term: its paperwork was either done or it was not.

`seed` is an explicit opt-in, not a fallback: a planner that quietly dropped to a
mock when the API was down would look like it was working while saving nothing.
It is what `check-browser.mjs` drives and what makes the page openable with no
backend running.

**Every control is one request.** The offline store writes the whole document
under a lock, which is right for one writer and wrong for several: the last
whole-document write would erase everything the others did since their read. On
the shared plan each command changes the screen first (using the same pure rules
— `placeAssignment`, `validateCourseDraft`), sends its one request, folds in
whatever the server decided that the screen could not know (above all the row's
real id), and on failure puts the screen back and says why in the backend's own
words. `lib/plan-commands.ts` is that table, one entry per control.

**Ids.** The database counts in integers, every domain id in this app is a
string. `lib/plan-api.ts` is the only place both vocabularies appear; a row
drawn before the server has named it gets a placeholder that `serverId()`
refuses, so a request built from one fails here rather than reaching
`/electives/NaN`. `reconcile*` in `lib/plan-state.ts` then swaps in the real row,
matched by the three UNIQUE constraints in `migrations/electives.sql`.

**Undo** is one step, offered in the toast that confirms the change. A permanent
button was right when the plan was one person's document with a revision history
behind it; on a shared plan there is no history to walk back, only the step just
taken and only while nobody has built on it. `RemoteCommand.inverse` builds that
step *after* the server has answered, and returns null where taking it back
honestly is not possible — deleting a course takes its periods and paperwork
with it.

**What is hidden on the shared plan**: สำรองแผน JSON, นำเข้าแผน, คืนค่าเริ่มต้น,
and the permanent เลิกทำรายการล่าสุด. A file on one person's disk is not a backup
of a table everyone writes to, and importing one would mean one person's
afternoon replacing everybody's.

The provider stays at the root of the app so that an edit which could not be
saved survives a trip to another screen and back, but the plan is only read once
a planner page is on screen — `PlanShell` calls `plan.load()`.

### Setting up a database

The quickest route is `docker compose up -d` from the repo root, which brings up
`nextlink-postgres` (5432, database `nextlink`), `nextlink-line-db` (5433,
database `line`) and `nextlink-neo4j` (7474/7687) and runs the migrations on
first start. By hand, the order matters:

```sh
psql -d nextlink -f backend/migrations/init.sql
psql -d nextlink -f backend/migrations/security.sql
psql -d nextlink -f backend/migrations/electives.sql
psql -d nextlink -f backend/migrations/elective_seed.sql
```

`electives.sql` references `companies` and `employees`, and the seed references
the `elective_*` tables, so alphabetical order fails on the first file — which is
exactly what the postgres image does with `/docker-entrypoint-initdb.d`, and why
`docker/nextlink-init.sh` is the one place that decides the order.

`backend/migrations/local/` is separate on purpose: `line_local.sql` creates
cut-down `line_groups` / `line_messages` tables so the console opens without
Neon, and the real LINE database already has those names under a different
schema. It must never be run against it. See that folder's README.

The `.env` values for this stack (`backend/.env`):

```ini
NEXTLINK_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nextlink
LINE_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/line
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=nextlink-dev
NEO4J_DATABASE=neo4j
PG_POOL_MIN=1
PG_POOL_MAX=10
CORS_ORIGINS=http://localhost:3000
HOST=127.0.0.1
PORT=8000
AUTH_SECRET=<any long random string>
GOOGLE_API_KEY=<kept as it is>
```

### An account to sign in with

The seed creates rooms and a term, not a user, so a fresh database has nothing
to sign in as. `users.password` holds a **bcrypt hash** and
`services/user.py::login` compares with `bcrypt.checkpw`, so a row inserted with
a plain-text password does not fail as "wrong password" — it fails as a 500 with
`stored hash is unusable`, which is a much harder thing to work out from the
login screen. Use the script rather than SQL:

```sh
cd backend
.venv/Scripts/python create_user.py admin --display "เจ้าหน้าที่ภาค"
```

It asks for the password twice without echoing it, enforces the same eight-
character minimum `update_password` does (so an account created today can
change its own password tomorrow), and reports a name that is already taken as
exactly that. `--password-from-env NAME` reads it from the environment instead,
for a machine-setup script.

`NEO4J_URI` is `bolt://` rather than `neo4j+s://`: the local container speaks
plain bolt with no certificate, and the `+s` scheme fails the handshake. The two
database URLs must point at different ports — that is why the LINE container is
published on 5433 rather than sharing 5432, so `LINE_DATABASE_URL` can never
quietly end up on the `nextlink` database.

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
