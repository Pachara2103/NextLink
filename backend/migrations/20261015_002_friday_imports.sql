-- Preview provenance is deliberately distinct from business activity records.
CREATE TABLE friday_import_batches (
    id UUID PRIMARY KEY,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    filename TEXT NOT NULL,
    source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
    year_convention TEXT NOT NULL CHECK (year_convention IN ('AD', 'BE')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'committed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE friday_import_rows (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES friday_import_batches(id) ON DELETE RESTRICT,
    row_number INTEGER NOT NULL CHECK (row_number > 0),
    sheet_name TEXT NOT NULL,
    row_identity TEXT NOT NULL,
    raw JSONB NOT NULL,
    normalized JSONB NOT NULL,
    corrections JSONB NOT NULL DEFAULT '{}',
    errors JSONB NOT NULL,
    mapping_status TEXT NOT NULL CHECK (mapping_status IN ('matched', 'needs_mapping')),
    candidates JSONB NOT NULL DEFAULT '[]',
    decision TEXT NOT NULL CHECK (decision IN ('pending', 'create', 'update', 'skip')),
    target_activity_id BIGINT REFERENCES friday_activities(id) ON DELETE RESTRICT,
    target_activity_revision INTEGER,
    committed_activity_id BIGINT REFERENCES friday_activities(id) ON DELETE RESTRICT,
    reviewed_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    UNIQUE(batch_id, sheet_name, row_number)
);
CREATE INDEX friday_import_rows_batch_idx ON friday_import_rows(batch_id, id);

-- A source identity applies to an exact file plus reviewed mapping/content, not
-- a row number. Changed snapshots still need a deliberate reconciliation.
CREATE TABLE friday_import_source_links (
    id BIGSERIAL PRIMARY KEY,
    source_hash TEXT NOT NULL,
    row_identity TEXT NOT NULL,
    mapping_hash TEXT NOT NULL,
    source_key TEXT,
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    import_row_id BIGINT NOT NULL REFERENCES friday_import_rows(id) ON DELETE RESTRICT,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_hash, row_identity, mapping_hash)
);
CREATE INDEX friday_import_source_key_idx ON friday_import_source_links(source_key) WHERE source_key IS NOT NULL;

CREATE TABLE friday_import_receipts (
    id UUID PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES friday_import_batches(id) ON DELETE RESTRICT,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL,
    review_revision INTEGER NOT NULL,
    selected_hash TEXT NOT NULL,
    receipt JSONB NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(actor_user_id, idempotency_key)
);

CREATE TABLE friday_import_audit (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES friday_import_batches(id) ON DELETE RESTRICT,
    row_id BIGINT REFERENCES friday_import_rows(id) ON DELETE RESTRICT,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    operation TEXT NOT NULL CHECK (operation IN ('preview', 'review', 'commit')),
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
