# Friday Activity workspace and reporting

The live Friday dashboard follows the internship module's three-tab card-board
design: overview, evaluations, and the central activity registry. The selected
tab, period, registry filters, evaluation kind/page, and provisional-data choice
are URL state. Registry/import/detail writes retain their existing services,
revision checks, receipts, notes and audit history. Reports are read only.

## API

Both routes use the existing Friday session dependency and validate the same
`academicYear` (CE), `term`, `status`, `companyId`, and literal `search` filters
as the registry. Static routes are registered before `/{activity_id}`.

- `GET /api/v1/friday-activities/analytics`: whole-filter summary, activity
  status/format counts, top ten companies with held sessions, monthly held and
  planned session counts, undated sessions, and four comparable academic years.
- `GET /api/v1/friday-activities/evaluations`: anonymous student score summary
  and paged source reports (`page`, `pageSize`, optional `kind`), with an explicit
  `includeProvisional=false` default. `kind` filters report rows, not the summary.

Each response uses one repeatable-read, read-only PostgreSQL snapshot. Reports
do not calculate totals from one registry page. Sessions are aggregated apart
from company links, so multiple companies do not multiply attendance. Company
frequency counts distinct activities with a held session; a joint activity
counts for each participating company. Cancelled activities/sessions are omitted
from attendance and held/planned session charts. Activity status counts retain
cancelled activities. Format counts omit cancelled activities.

Missing attendance stays null and includes a missing-session count. A missing
historical academic period stays null rather than becoming a fabricated zero.
Year comparisons use the same term and filters; incomplete attendance is not
shown as a percentage change or a complete sparkline point. Only the visible
report is fetched; opening the overview does not fetch paged registry rows.

## Existing workbook evaluations

The October 20 intake saved six anonymous student summaries and company
responses as versioned Friday notes. This API decodes only its documented
`legacy-workbook-notes-v1` format, requiring the known filename, sheet/row
provenance and SHA256 reference. It does not turn ordinary free-text notes into
scores, mutate the source, create student records, or require a migration.

For each of the four student dimensions, the decoder verifies response count,
score total, rounded reported mean, and all five histogram bins. Their counts
and weighted sum must agree. Combined means are total score / answered count,
not an average of activity means. Source-table reported scores remain separate
from response-derived scores. Company responses remain qualitative text.

Provisional activity/date mappings are visible but excluded by default. The
explicit test-data toggle includes otherwise valid, completed provisional
reports and marks the resulting statistics as provisional. Invalid reports,
cross-activity source conflicts, cancelled/unfinished activity feedback, and
unmatched company notes never enter score statistics. Exact source duplicates
are collapsed to the newest note, and their exclusion count is reported.
Unmatched CRM notes are scoped to their stored academic year/semester and
company/search, have no guessed activity link, and remain outside score totals.

The response includes source references, exclusion reasons, source note IDs,
mapping state and update time. It omits individual student names/IDs. Evaluation
reporting currently accepts the existing reviewed note format; a new general
evaluation entry/import workflow is separate work. More than 5,000 candidate
reports in one scope produces a validation error asking for narrower filters,
rather than silently returning partial statistics.

## Verification

`backend/tests/test_friday_reporting.py` exercises real PostgreSQL aggregation,
more than one registry page, session/company fanout, missing vs zero values,
same-term history, weighted means, invalid/provisional reports, duplicate and
conflicting sources, unmatched company notes, pagination, filters and session
authorization. `frontend/scripts/friday/check-workspace.mjs` extends the guarded
real-database browser suite with the three tabs, report controls, provenance,
chart navigation, responsive themes, pagination focus, real report failures and
delayed-response protection. The existing lifecycle/import/concurrency suite
still runs before it.
