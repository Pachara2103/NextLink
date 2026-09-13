-- NextLink_DB only, with the old consumer stopped and a verified backup.
-- Group JOIN references and local acknowledgements. No message text is copied.
BEGIN;
CREATE TABLE IF NOT EXISTS line_group_refs (
    group_id TEXT PRIMARY KEY, display_name TEXT, picture_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false, deleted BOOLEAN NOT NULL DEFAULT false,
    source_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS line_message_processing (
    message_id TEXT PRIMARY KEY, group_id TEXT,
    source_version BIGINT NOT NULL DEFAULT 0 CHECK (source_version >= 0),
    processed_version BIGINT, eligible BOOLEAN NOT NULL DEFAULT false,
    legacy_read BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS line_message_processing_pending
ON line_message_processing(group_id,source_version,message_id)
WHERE eligible AND processed_version IS NULL;
CREATE TABLE IF NOT EXISTS line_direct_sync_state (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), source_id UUID,
    cursor BIGINT NOT NULL DEFAULT 0, bootstrap_watermark BIGINT,
    synced_at TIMESTAMPTZ, caught_up BOOLEAN NOT NULL DEFAULT false,
    cutover_ready BOOLEAN NOT NULL DEFAULT false
);
-- Bootstrap only once. Re-running after sync must not re-import stale read flags.
DO $$ BEGIN
  IF to_regclass('line_message_refs') IS NOT NULL THEN
    RAISE EXCEPTION 'Existing LINE API projection requires a separate migration review';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM line_direct_sync_state WHERE id=true) THEN
    INSERT INTO line_direct_sync_state(id) VALUES (true);
    IF to_regclass('line_groups') IS NOT NULL THEN
      INSERT INTO line_group_refs(group_id,display_name,picture_url,is_active,created_at,updated_at)
      SELECT group_id,display_name,picture_url,status='active',created_at,updated_at FROM line_groups
      ON CONFLICT(group_id) DO NOTHING;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('line_messages')
        AND attname='is_read' AND NOT attisdropped) THEN
      INSERT INTO line_message_processing(message_id,group_id,legacy_read)
      SELECT message_id,group_id,is_read FROM line_messages WHERE group_id IS NOT NULL
      ON CONFLICT(message_id) DO NOTHING;
    END IF;
  END IF;
END $$;
COMMIT;
