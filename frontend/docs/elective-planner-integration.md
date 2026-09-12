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

The full-project lint currently includes an existing `react-hooks/set-state-in-effect`
error in `src/components/ui/ActionMenu.tsx` (present on base commit `4eee0df`) and
pre-existing unused import/image warnings. The migrated feature and new theme/frame
components have no lint errors. Keep this baseline separate from integration checks.

### Verified result

On 2026-09-12, the integration passed the production Next.js build (including
TypeScript), all 78 domain regression checks, and 19 browser regression scenarios.
The browser run had no uncaught page errors, failed Next.js assets or unexpected
API requests. See `elective-planner-verification.json` for the recorded scenarios.
Changed-file ESLint passed with four existing `<img>` warnings in the login and
sidebar components. Full-project ESLint still reports the unrelated ActionMenu
baseline described above.

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

No deployment or real-backend verification was performed.
