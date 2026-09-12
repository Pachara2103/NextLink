-- Apply after init.sql and before deploying the session-aware backend.
-- Existing stateless tokens intentionally stop working: users must sign in again.
BEGIN;
CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions (expires_at);
CREATE TABLE IF NOT EXISTS auth_login_buckets (
    bucket_key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_login_buckets_expiry ON auth_login_buckets (expires_at);
COMMIT;
