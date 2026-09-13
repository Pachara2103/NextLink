-- Synthetic source-side contract fixture. No source application or credentials.
-- The read-view DDL below is copied from LINE migration 023; validate changes
-- against the bot's canonical migrations in a local cross-repository test too.
CREATE TABLE line_groups (
 group_id TEXT PRIMARY KEY,display_name TEXT,picture_url TEXT,status TEXT DEFAULT 'active',
 created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE line_messages (
 message_id TEXT PRIMARY KEY,group_id TEXT REFERENCES line_groups(group_id),
 message_type TEXT DEFAULT 'text',direction TEXT DEFAULT 'inbound',text_content TEXT,
 sent_at TIMESTAMPTZ DEFAULT now(),created_at TIMESTAMPTZ DEFAULT now(),unsent_at TIMESTAMPTZ,is_read BOOLEAN DEFAULT false
);
CREATE TABLE line_unsent_messages(message_id TEXT PRIMARY KEY);
CREATE TABLE line_integration_identity(id BOOLEAN PRIMARY KEY,source_id UUID NOT NULL);
INSERT INTO line_integration_identity VALUES(true,'deaaaaff-80b5-4832-aeca-e83e988e1c38');
CREATE TABLE line_integration_changes(id BIGSERIAL PRIMARY KEY,entity TEXT,entity_id TEXT);
CREATE FUNCTION test_change() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 PERFORM pg_advisory_xact_lock(781245922);
 IF TG_TABLE_NAME='line_groups' THEN
  INSERT INTO line_integration_changes(entity,entity_id) VALUES('group',COALESCE(NEW.group_id,OLD.group_id));
 ELSE
  INSERT INTO line_integration_changes(entity,entity_id) VALUES('message',COALESCE(NEW.message_id,OLD.message_id));
 END IF;
 RETURN NULL;
END $body$;
CREATE TRIGGER test_group AFTER INSERT OR UPDATE OR DELETE ON line_groups FOR EACH ROW EXECUTE FUNCTION test_change();
CREATE TRIGGER test_message AFTER INSERT OR UPDATE OR DELETE ON line_messages FOR EACH ROW EXECUTE FUNCTION test_change();
CREATE TRIGGER test_unsend AFTER INSERT OR UPDATE ON line_unsent_messages FOR EACH ROW EXECUTE FUNCTION test_change();

-- Read contract for NextLink. No message content is replicated by change sync.
-- Keep 021's commit-ordered, key-only log and immutable migration history.
CREATE INDEX IF NOT EXISTS line_integration_changes_entity_version_idx
ON line_integration_changes(entity,entity_id,id DESC);

CREATE OR REPLACE VIEW line_read_identity AS
SELECT source_id, 2 AS contract_version,
       (SELECT COALESCE(MAX(id),0) FROM line_integration_changes) AS watermark
FROM line_integration_identity WHERE id=true;

CREATE OR REPLACE VIEW line_read_changes WITH (security_barrier=true) AS
SELECT c.id AS change_id,c.entity,c.entity_id,v.id AS source_version,
  CASE WHEN g.group_id IS NOT NULL THEN jsonb_build_object(
    'group_id',g.group_id,'display_name',g.display_name,'picture_url',g.picture_url,
    'is_active',g.status='active','created_at',g.created_at,'updated_at',g.updated_at
  ) END AS group_data,
  m.group_id AS message_group_id,
  COALESCE(m.group_id IS NOT NULL AND m.direction='inbound' AND m.message_type='text'
    AND m.text_content IS NOT NULL AND m.unsent_at IS NULL AND u.message_id IS NULL,false) AS eligible,
  COALESCE(m.is_read,false) AS legacy_is_read
FROM line_integration_changes c
CROSS JOIN LATERAL (
  SELECT id FROM line_integration_changes
  WHERE entity=c.entity AND entity_id=c.entity_id ORDER BY id DESC LIMIT 1
) v
LEFT JOIN line_groups g ON c.entity='group' AND g.group_id=c.entity_id
LEFT JOIN line_messages m ON c.entity='message' AND m.message_id=c.entity_id
LEFT JOIN line_unsent_messages u ON c.entity='message' AND u.message_id=c.entity_id;

-- Only group inbound text is readable. No raw payload, direct chat, attachment
-- content, outbound text, user identifiers or old unsent content is exposed.
CREATE OR REPLACE VIEW line_read_messages WITH (security_barrier=true) AS
SELECT m.message_id,m.group_id,m.text_content,m.sent_at,m.created_at,
       v.id AS source_version
FROM line_messages m
CROSS JOIN LATERAL (
  SELECT id FROM line_integration_changes
  WHERE entity='message' AND entity_id=m.message_id ORDER BY id DESC LIMIT 1
) v
WHERE m.group_id IS NOT NULL AND m.direction='inbound' AND m.message_type='text'
  AND m.text_content IS NOT NULL AND m.unsent_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM line_unsent_messages u WHERE u.message_id=m.message_id);

REVOKE ALL ON line_read_identity,line_read_changes,line_read_messages FROM PUBLIC;
-- Provision a dedicated login separately; grant SELECT only on these views.
-- Never give NextLink the bot's owner connection string.
