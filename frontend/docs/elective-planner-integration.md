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

## Verification

Run from `frontend/` using Node 22.6+ (the domain scripts use TypeScript stripping):

```sh
npm ci
npm run check:planner
API_ORIGIN=http://127.0.0.1:18999 npm run build
npx playwright install chromium
npm run check:browser
```

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
TypeScript), all 78 domain regression checks, and 22 browser regression scenarios.
The browser run had no uncaught page errors, failed Next.js assets or unexpected
API requests. See `elective-planner-verification.json` for the recorded scenarios.
Full-project ESLint passes with zero errors and the 13 warnings described above.
The browser suite also checks the three final-review fixes below.

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

- Before using this as a shared operational planner, add an authenticated backend
  for plans with explicit ownership/term boundaries and transactional concurrency.
  Browser-local storage currently has neither account isolation nor device sync.
- Replace the bundled example courses/rooms and archives with an approved data
  source when the operational schema is ready; preserve the visible example-data
  label until that integration is verified.
- Run the existing domain, build and browser checks in CI so later host-console
  changes cannot silently break planner navigation or theme isolation.
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
artifacts from CLI uploads. The project's production `API_ORIGIN` must be set
before building; the localhost target in the regression commands is a fixture
target and is not a deployment configuration.

Automatic Git deployment is not connected: Vercel rejected the attempt to connect
`Pachara2103/NextLink` from this owner's account. CLI deployment can still use the
reviewed local checkout. Do not assume pushing this PR updates the new host.
