CREATE TABLE IF NOT EXISTS line_group_reads (
    group_id text PRIMARY KEY,
    last_read_at TIMESTAMPTZ NULL DEFAULT NULL
);