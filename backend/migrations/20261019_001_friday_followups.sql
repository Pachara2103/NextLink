-- Append-only migration. Notes stay in Friday, outside CRM notes/graph projection.
CREATE TABLE friday_notes (
    id BIGSERIAL PRIMARY KEY,
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN ('fact', 'comment')),
    body TEXT NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 10000),
    reference TEXT NULL CHECK (length(reference) <= 2000),
    occurred_at TIMESTAMPTZ NULL,
    author_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX friday_notes_activity ON friday_notes(activity_id, id DESC);
CREATE TABLE friday_note_versions (
    note_id BIGINT NOT NULL REFERENCES friday_notes(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    editor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT NULL,
    snapshot JSONB NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (note_id, version)
);
CREATE TABLE friday_tasks (
    id BIGSERIAL PRIMARY KEY,
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 500),
    description TEXT NULL CHECK (length(description) <= 10000),
    assignee_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
    author_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX friday_tasks_activity ON friday_tasks(activity_id, id DESC);
CREATE INDEX friday_tasks_assignee_due ON friday_tasks(assignee_user_id, due_date) WHERE status = 'open';
ALTER TABLE friday_audit_events ADD COLUMN detail JSONB NULL;
CREATE INDEX friday_audit_events_cursor ON friday_audit_events(activity_id, id DESC);
