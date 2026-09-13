# LINE database migration only

This PR moves LINE reads to `NextLink_Line` while NextLink continues writing
business data to `NextLink_DB`. It is an alternative to the broader
`codex/linebot-service-integration` branch, not a dependency on that branch.

## Scope for review

| Area | Change |
| --- | --- |
| LINE source | Separate read-only connection; SQL views only, no HTTP changes API |
| Group JOIN | Copy group metadata to `line_group_refs` and keep the JOIN local |
| Read state | Store message IDs/versions in `line_message_processing` in NextLink_DB |
| Existing extraction | Same AI call, group input, company condition, pending employee inserts and transaction/commit locations |
| Graph | No new graph calls or outbox jobs from LINE extraction |

`services/line.py::update_information` only passes the selected message batch
to its two existing acknowledgement calls. The company/employee helpers, AI
prompt and chain, approval routes, frontend and outbox implementation are unchanged.
Transport reads are paged at 200 messages, but all pending messages for a group
still form one AI input, ordered by source `created_at` as before.

The new source contract exposes current inbound group text and excludes direct
chats, outbound text, attachments and unsent text. Local synchronization stores
no message text, raw payload, image content or file content. It runs on the
existing group refresh route; no additional API route or scheduler is added.

`processed_version` is the local equivalent of acknowledging `is_read`. It is
not a graph completion marker. Already-acknowledged messages stay acknowledged
after edits; no review queue, automatic re-extraction or graph retraction policy
is added. Version checks prevent acknowledging a different source version than
the one selected. Only source transport and local acknowledgement storage change.

## Prerequisites and deployment

This is a code PR, not a production migration. Keep the old consumer stopped
during final state adoption/cutover. Back up and verify both actual runtime
databases and their Neon production branches before executing SQL.

1. In `NextLink_Line`, apply the LINE bot repository's
   `migrations/023_direct_sql_reader.sql` with its canonical migration runner.
   This source-side dependency must be available/applied before enabling this PR;
   do not deploy the broad NextLink branch to obtain it. Earlier bot migrations
   remain unchanged. Never rerun the historical Railway data-copy script.
2. Create a dedicated source login and set its password privately. Grant only
   schema USAGE and SELECT on `line_read_identity`, `line_read_changes`, and
   `line_read_messages`. Do not use an owner role or broad table grants.
3. Run `backend/migrations/line_direct.sql` in `NextLink_DB`. It creates local
   metadata/state and adopts existing group IDs and legacy read flags once.
   A legacy table without `is_read` supplies no read history; do not invent it.
   An existing API projection requires separate review and stops this migration.
4. Deploy this PR's code with the backend-only Production variables below.
   The default `shared` mode preserves the original path until `direct` is set.
5. As an authenticated staff user, refresh `GET /api/v1/line/groups` until it
   succeeds. Each refresh synchronizes at most 1,000 metadata changes. An
   incomplete-catch-up error means refresh again; source failures must be resolved.
6. With the old consumer still stopped, run
   `backend/migrations/line_direct_cutover.sql` in `NextLink_DB`. It checks group
   mappings and catch-up, moves the companies/token_logs FKs to local group
   references, and enables extraction. Until then extraction is blocked.
7. Verify the existing staff extraction/approval flow on the deployed backend.
   Old copied LINE tables are left intact; retirement is a separate operation.

```dotenv
DATABASE_PUBLIC_URL=<NextLink_DB application connection>
LINE_DATA_MODE=direct
LINE_DATABASE_URL=<NextLink_Line dedicated reader, pooled connection with TLS>
LINE_SOURCE_ID=<source_id from line_read_identity in the verified LINE source>
LINE_PG_POOL_MAX=3
```

These variables belong to the backend Vercel project. Keep database credentials
out of the frontend and Git. This PR does not use `LINE_INTEGRATION_URL`,
`LINE_INTEGRATION_API_KEY` or `LINE_INTEGRATION_SOURCE_ID` from the earlier branch.
Environment changes require a new deployment.

## Deliberately separate follow-up work

The original business flow is preserved, including known limitations: creating
another company when an existing company is unlinked can hit its unique group
constraint; the no-contact path does not commit its acknowledgement on its own;
commits between groups release earlier message claims. This PR does not claim to
fix those issues, remove existing summary logs, add per-group advisory locks, or
change approval/graph synchronization. Source and application databases cannot
share an atomic transaction; later source changes are seen on a subsequent sync.
Rollback requires reconciling data/state/FKs, not merely toggling back to a stale
shared database snapshot.

## Verification

`backend/tests/test_line_database_migration.py` uses two disposable PostgreSQL
databases and a SELECT-only source role. AI responses are synthetic. It verifies
group/FK migration, local acknowledgement, unchanged source `is_read`, no copied
bodies, PostgreSQL-only pending records with no graph jobs, full group input
across SQL pages, source failures, and the existing shared/company-link behavior.
The unchanged authentication tests run in the same suite. This is not evidence
of production cutover or a real AI/Neo4j run.
