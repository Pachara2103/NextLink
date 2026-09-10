
CREATE TABLE IF NOT EXISTS graph_outbox (
    id BIGSERIAL PRIMARY KEY,
    -- 'employee' | 'company' | 'note' - ดูค่าคงที่ใน services/outbox.py
    entity TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    -- 'upsert' | 'delete'
    op TEXT NOT NULL,
    -- สิ่งที่ query ฝั่งกราฟต้องใช้ (delete ไม่ต้องมี จึง NULL ได้)
    payload JSONB NULL,
    -- 'pending' | 'done' - งานที่ยังไม่สำเร็จคงเป็น pending เสมอ แล้วถอยเวลา
    -- ด้วย next_try_at ไม่มีสถานะ 'failed' ถาวร เพราะงานที่ยอมแพ้เงียบ ๆ
    -- คือความไม่ตรงกันที่ไม่มีใครรู้ ซึ่งเป็นปัญหาที่ตารางนี้มีไว้แก้
    status TEXT NOT NULL DEFAULT 'pending',
    tries INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    next_try_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- services/outbox.py::replay_pending
--   WHERE status = 'pending' AND next_try_at <= now() ORDER BY id
CREATE INDEX IF NOT EXISTS idx_graph_outbox_pending
    ON graph_outbox (next_try_at, id) WHERE status = 'pending';

-- services/outbox.py::flush - งานที่ค้างของ entity เดียว เรียงตาม id
CREATE INDEX IF NOT EXISTS idx_graph_outbox_entity
    ON graph_outbox (entity, entity_id, id) WHERE status = 'pending';
