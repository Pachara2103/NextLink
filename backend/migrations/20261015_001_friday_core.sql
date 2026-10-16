-- Applied explicitly by scripts/migrate.py, never during application startup.
-- Existing accounts intentionally remain unassigned until an operator grants a role.
ALTER TABLE users ADD COLUMN role TEXT NULL;
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IS NULL OR role IN ('admin', 'staff'));

CREATE TABLE academic_periods (
    id BIGSERIAL PRIMARY KEY,
    academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 2000 AND 2100),
    term TEXT NOT NULL CHECK (term IN ('FIRST', 'SECOND', 'SUMMER')),
    UNIQUE (academic_year, term)
);

CREATE TABLE friday_activities (
    id BIGSERIAL PRIMARY KEY,
    period_id BIGINT NOT NULL REFERENCES academic_periods(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    description TEXT NULL,
    domain TEXT NULL,
    format TEXT NOT NULL DEFAULT 'unknown'
        CHECK (format IN ('talk', 'workshop', 'visit', 'hackathon', 'other', 'unknown')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'contacting', 'invited', 'confirmed', 'in_progress', 'completed', 'cancelled')),
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX friday_activities_period_status ON friday_activities(period_id, status, id DESC);
CREATE INDEX friday_activities_owner ON friday_activities(owner_user_id);

CREATE TABLE friday_activity_companies (
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    PRIMARY KEY (activity_id, company_id)
);
CREATE INDEX friday_activity_companies_company ON friday_activity_companies(company_id, activity_id);

CREATE TABLE friday_activity_people (
    id BIGSERIAL PRIMARY KEY,
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    namespace TEXT NOT NULL CHECK (namespace IN ('employee', 'contact', 'guest')),
    employee_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    contact_id BIGINT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
    name_snapshot TEXT NOT NULL CHECK (btrim(name_snapshot) <> ''),
    role TEXT NOT NULL CHECK (role IN ('speaker', 'coordinator')),
    CONSTRAINT ck_friday_people_namespace CHECK (
        (namespace = 'employee' AND employee_id IS NOT NULL AND contact_id IS NULL)
        OR (namespace = 'contact' AND contact_id IS NOT NULL AND employee_id IS NULL)
        OR (namespace = 'guest' AND employee_id IS NULL AND contact_id IS NULL)
    )
);
CREATE INDEX friday_activity_people_activity ON friday_activity_people(activity_id);
CREATE INDEX friday_activity_people_employee ON friday_activity_people(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX friday_activity_people_contact ON friday_activity_people(contact_id) WHERE contact_id IS NOT NULL;

CREATE TABLE friday_sessions (
    id BIGSERIAL PRIMARY KEY,
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    session_date DATE NULL,
    start_time TIME NULL,
    end_time TIME NULL,
    location TEXT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'held', 'cancelled')),
    capacity INTEGER NULL CHECK (capacity >= 0),
    booked INTEGER NULL CHECK (booked >= 0),
    attended INTEGER NULL CHECK (attended >= 0),
    CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);
CREATE INDEX friday_sessions_activity ON friday_sessions(activity_id, id);
CREATE INDEX friday_sessions_date ON friday_sessions(session_date, id);

CREATE TABLE friday_audit_events (
    id BIGSERIAL PRIMARY KEY,
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    operation TEXT NOT NULL CHECK (btrim(operation) <> ''),
    reason TEXT NULL,
    before_data JSONB NULL,
    after_data JSONB NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX friday_audit_events_activity ON friday_audit_events(activity_id, recorded_at DESC, id DESC);
CREATE INDEX friday_audit_events_actor ON friday_audit_events(actor_user_id);

CREATE TABLE friday_mutation_receipts (
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    operation TEXT NOT NULL CHECK (btrim(operation) <> ''),
    idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> '' AND length(idempotency_key) <= 200),
    request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
    activity_id BIGINT NOT NULL REFERENCES friday_activities(id) ON DELETE RESTRICT,
    response_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_user_id, operation, idempotency_key)
);
CREATE INDEX friday_mutation_receipts_activity ON friday_mutation_receipts(activity_id);
