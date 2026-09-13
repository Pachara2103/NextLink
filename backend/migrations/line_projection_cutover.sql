-- Run only after API catch-up and runtime-target verification, in a maintenance
-- window with the old shared-DB consumer stopped. No source tables are dropped.
BEGIN;
DO $$
DECLARE fk RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM line_sync_state WHERE source_id IS NOT NULL AND synced_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Synchronize the LINE projection before switching foreign keys';
  END IF;
  IF EXISTS (SELECT 1 FROM companies c LEFT JOIN line_group_refs g USING(group_id) WHERE c.group_id IS NOT NULL AND g.group_id IS NULL)
    OR EXISTS (SELECT 1 FROM token_logs c LEFT JOIN line_group_refs g USING(group_id) WHERE c.group_id IS NOT NULL AND g.group_id IS NULL) THEN
    RAISE EXCEPTION 'Missing projected group IDs; preserve company/token-log mappings first';
  END IF;
  FOR fk IN SELECT c.conrelid::regclass AS target,c.conname FROM pg_constraint c
    WHERE c.contype='f' AND c.confrelid=to_regclass('line_groups')
      AND c.conrelid IN ('companies'::regclass,'token_logs'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.target,fk.conname);
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='companies'::regclass AND conname='companies_line_ref_fkey') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_line_ref_fkey FOREIGN KEY(group_id) REFERENCES line_group_refs(group_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='token_logs'::regclass AND conname='token_logs_line_ref_fkey') THEN
    ALTER TABLE token_logs ADD CONSTRAINT token_logs_line_ref_fkey FOREIGN KEY(group_id) REFERENCES line_group_refs(group_id) ON DELETE SET NULL;
  END IF;
END $$;
COMMIT;
