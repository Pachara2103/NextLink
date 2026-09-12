
-- ไม่มี trigger updated_at (trigger ต้องมี function) ทุก UPDATE จึงต้องเขียน
-- `updated_at = now()` ในคำสั่ง SQL เอง เหมือนที่ services/*.py ทำอยู่

-- ==========================================================================
-- ตารางของฝั่ง LINE webhook
--
-- line_* ทั้ง 9 ตารางมีเจ้าของเป็นบริการฝั่ง LINE ไม่ใช่ backend ตัวนี้
-- ไฟล์นี้จึงไม่ประกาศมันไว้ ยกเว้น line_groups ตัวเดียว เพราะเป็นปลายทาง
-- ของ FK จาก 4 ตารางข้างล่าง - บล็อกนี้มีไว้ให้ DB เปล่า ๆ (dev/test) รันไฟล์
-- นี้ผ่านได้เท่านั้น กับ DB จริงที่มีตารางอยู่แล้ว บล็อกนี้จะถูกข้าม
-- ==========================================================================

CREATE TABLE IF NOT EXISTS line_groups (
    group_id TEXT PRIMARY KEY,
    display_name TEXT NULL,
    picture_url TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at TIMESTAMPTZ NULL,
    left_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NULL,
    password TEXT NOT NULL,               -- bcrypt hash
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);



CREATE TABLE IF NOT EXISTS companies (
    id BIGSERIAL PRIMARY KEY,
    -- UNIQUE: หนึ่งกลุ่ม LINE ต่อหนึ่งบริษัท
    -- ON DELETE SET NULL: กลุ่มหายไปแต่บริษัทยังอยู่ แค่ไม่ผูกกับกลุ่มไหน
    group_id TEXT NULL UNIQUE REFERENCES line_groups(group_id) ON DELETE SET NULL,
    company_th TEXT NULL,
    company_en TEXT NULL,
    aliases TEXT[] NULL DEFAULT '{}'::text[],  -- NULL ได้ ไม่ใช่ '{}' บังคับ: UPDATE ใช้ COALESCE บนคอลัมน์นี้
    is_linked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- create_company_pg / update_company_pg เช็คเงื่อนไขนี้ใน Python อยู่แล้ว
    CONSTRAINT ck_companies_has_name CHECK (company_th IS NOT NULL OR company_en IS NOT NULL)
);


CREATE TABLE IF NOT EXISTS employees (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    name_th TEXT NULL,
    name_en TEXT NULL,
    nickname TEXT NULL,
    job_title TEXT NULL,
    phone TEXT NULL,
    email TEXT NULL,
    relevant TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_employees_status
        CHECK (status IN ('pending', 'active', 'resigned', 'transferred', 'inactive')),
    CONSTRAINT ck_employees_relevant
        CHECK (relevant IS NULL OR relevant IN ('mou', 'elective', 'internship', 'coop', 'friday', 'general')),
    -- แถวที่ไม่มีทั้งสามชื่อ อ่านไม่ออกว่าเป็นใคร
    CONSTRAINT ck_employees_has_name
        CHECK (name_th IS NOT NULL OR name_en IS NOT NULL OR nickname IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees (user_id) WHERE user_id IS NOT NULL;
-- partial: หน้ารออนุมัติเปิดบ่อย และ pending เป็นส่วนน้อยของตาราง
CREATE INDEX IF NOT EXISTS idx_employees_pending ON employees (created_at DESC) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS contacts (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nickname TEXT NULL,
    role TEXT NOT NULL DEFAULT 'instructor',
    status TEXT NOT NULL DEFAULT 'active',
    -- TEXT ไม่ใช่ VARCHAR(20): "081-234-5678, 02-123-4567" ยาวเกิน 20 แล้ว
    phone TEXT NULL,
    email TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_contacts_role
        CHECK (role IN ('instructor', 'senior', 'alumni', 'insider')),
    CONSTRAINT ck_contacts_status
        CHECK (status IN ('active', 'resigned', 'transferred', 'inactive')),
    CONSTRAINT ck_contacts_name_not_blank CHECK (btrim(name) <> '')
);

-- services/contact.py::get_contacts (WHERE company_id = %s) + รองรับ FK
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts (company_id);



CREATE TABLE IF NOT EXISTS mous (
    id BIGSERIAL PRIMARY KEY,
    -- UNIQUE เพราะ get_mou_status ทำ db_map[company_id] = row
    -- ถ้าบริษัทเดียวมี 2 แถว แถวหลังจะทับแถวแรกแบบไม่มีใครรู้
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_status TEXT NOT NULL,
    is_authorized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mous_company_id UNIQUE (company_id),
    CONSTRAINT ck_mous_document_status CHECK (
        document_status IN (
            'legal_revision_chula',
            'company_legal_review',
            'authorization',
            'pending_signature',
            'signed',
            'signed_with_university',
            'signed_subsidiary',
            'chula_department_review',
            'rejected',
            'unsigned'
        )
    )
);


CREATE TABLE IF NOT EXISTS notes (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id BIGINT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'mou',
    sentiment TEXT NOT NULL DEFAULT 'neutral',
    source TEXT NOT NULL DEFAULT 'external',
    year INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   
    CONSTRAINT ck_notes_sentiment  CHECK (sentiment IN ('positive', 'neutral', 'warning', 'negative')),
    CONSTRAINT ck_notes_source CHECK (source IN ('internal', 'external')),
    CONSTRAINT ck_notes_semester CHECK (semester IN (1, 2, 3)),
    CONSTRAINT ck_notes_year CHECK (year BETWEEN 2000 AND 2100),
    CONSTRAINT ck_notes_content_not_blank CHECK (btrim(content) <> ''),
    CONSTRAINT ck_notes_type CHECK (type IN ('mou', 'elective', 'internship', 'coop', 'friday','person')),
    CONSTRAINT ck_notes_employee_binding CHECK (
        (type IN ('person') AND employee_id IS NOT NULL) OR (type NOT IN ('person') AND employee_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_notes_company_id ON notes(company_id); --   LEFT JOIN companies c ON c.id = n.company_id
CREATE INDEX IF NOT EXISTS idx_notes_employee_id ON notes(employee_id) WHERE employee_id IS NOT NULL; --   LEFT JOIN employees ON p.id = n.person_id
CREATE INDEX IF NOT EXISTS idx_notes_listing ON notes (year DESC NULLS LAST, semester DESC NULLS LAST, updated_at DESC);



CREATE TABLE IF NOT EXISTS chat_histories (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_chat_histories_role CHECK (role IN ('user', 'ai'))
);
CREATE INDEX IF NOT EXISTS idx_chat_histories_user_created ON chat_histories (user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS token_logs (
    -- BIGSERIAL: ตารางนี้โตเร็วที่สุดในระบบ (1 แถวต่อ 1 การเรียก LLM)
    id BIGSERIAL PRIMARY KEY,
    log_type TEXT NOT NULL,
    step_name TEXT NOT NULL,
    group_id TEXT NULL REFERENCES line_groups(group_id) ON DELETE SET NULL,
    -- NULL ได้: TokenTrackerHandler มี default user_id=0 สำหรับงานที่ระบบ
    -- ทำเอง ไม่ได้มีคนสั่ง
    user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_token_logs_log_type CHECK (log_type IN ('line_group', 'chat')),
    CONSTRAINT ck_token_logs_counts CHECK (
        input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0
    )
);
CREATE INDEX IF NOT EXISTS idx_token_logs_created ON token_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_logs_user_created ON token_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_token_logs_group_created ON token_logs (group_id, created_at DESC) WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS update_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- ไม่ null ตอนอ่านออกไป: get_update_logs ใช้ COALESCE ให้เป็น '{}'
    error_groups TEXT[] NULL DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- services/line.py::get_update_logs - ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_update_logs_created ON update_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_update_logs_user_id ON update_logs (user_id);





-- token_logs: ตารางรายงาน อ่านเป็นช่วงเวลา / รายคน / รายกลุ่ม


-- line_messages เป็นตารางของฝั่ง LINE webhook แต่
-- services/line.py::get_group_messages ยิง query หนักใส่มันทุกครั้งที่กด
-- "อัปเดตข้อมูล":
--   WHERE group_id IS NOT NULL AND is_read = false
--   ORDER BY group_id, created_at ASC FOR UPDATE SKIP LOCKED
-- partial index บนแถวที่ยังไม่ได้อ่านคือของที่ต้องมี เพราะแถว is_read = true
-- จะกองสะสมไปเรื่อย ๆ แต่ query นี้ไม่เคยแตะมันเลย
--
-- เปิดบรรทัดนี้เมื่อรันกับ DB จริงที่มีตาราง line_messages อยู่
-- (ปิดไว้เพราะไฟล์นี้ไม่มี DO block ไว้เช็คว่าตารางมีอยู่ไหม จะพังกับ DB เปล่า)
-- CREATE INDEX IF NOT EXISTS idx_line_messages_unread
--     ON line_messages (group_id, created_at) WHERE is_read = false;


-- ==========================================================================
-- คิวงานเขียนกราฟ (ดูหัวไฟล์ migrations/outbox.sql และ services/outbox.py)
--
-- postgres คือแหล่งความจริง การเขียน Neo4j ทุกครั้งจึงถูกจองไว้ที่นี่ใน
-- transaction เดียวกับข้อมูลจริง ถ้า process ตายก่อนเขียนกราฟสำเร็จ
-- แถวในนี้ยังอยู่ และ replay จะทำต่อให้เอง
-- ==========================================================================

CREATE TABLE IF NOT EXISTS graph_outbox (
    id BIGSERIAL PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    op TEXT NOT NULL,
    payload JSONB NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tries INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    next_try_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- services/outbox.py::replay_pending
CREATE INDEX IF NOT EXISTS idx_graph_outbox_pending ON graph_outbox (next_try_at, id) WHERE status = 'pending';
-- services/outbox.py::flush
CREATE INDEX IF NOT EXISTS idx_graph_outbox_entity ON graph_outbox (entity, entity_id, id) WHERE status = 'pending';
