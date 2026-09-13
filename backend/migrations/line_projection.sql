-- Additive preparation. Run against NextLink's database, never the LINE database.
BEGIN;
CREATE TABLE IF NOT EXISTS line_group_refs (
    group_id TEXT PRIMARY KEY, display_name TEXT, picture_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false, deleted BOOLEAN NOT NULL DEFAULT false,
    source_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS line_message_refs (
    message_id TEXT PRIMARY KEY, group_id TEXT, message_type TEXT,
    direction TEXT, text_content TEXT, unsent_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_version BIGINT NOT NULL DEFAULT 0,
    deleted BOOLEAN NOT NULL DEFAULT false,
    is_read BOOLEAN NOT NULL DEFAULT false,
    needs_review BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS line_message_refs_unread ON line_message_refs(group_id,created_at)
WHERE NOT is_read AND NOT deleted;
CREATE TABLE IF NOT EXISTS line_sync_state (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), source_id UUID,
    cursor BIGINT NOT NULL DEFAULT 0, synced_at TIMESTAMPTZ
);
INSERT INTO line_sync_state(id) VALUES (true) ON CONFLICT (id) DO NOTHING;
-- Preserve existing mappings and consumer state before the shared DB is split.
DO $$ BEGIN
    IF to_regclass('line_groups') IS NOT NULL THEN
        INSERT INTO line_group_refs(group_id,display_name,is_active,created_at,updated_at)
        SELECT group_id,display_name,status='active',created_at,updated_at FROM line_groups
        ON CONFLICT(group_id) DO NOTHING;
    END IF;
    IF to_regclass('line_messages') IS NOT NULL THEN
        INSERT INTO line_message_refs(message_id,group_id,message_type,direction,text_content,unsent_at,sent_at,created_at,is_read)
        SELECT message_id,group_id,message_type,direction,
            CASE WHEN unsent_at IS NULL AND direction='inbound' AND message_type='text' THEN text_content END,
            unsent_at,sent_at,created_at,is_read FROM line_messages
        WHERE group_id IS NOT NULL ON CONFLICT(message_id) DO NOTHING;
    END IF;
END $$;
COMMIT;
