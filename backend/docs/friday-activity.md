# Friday Activity ที่ใช้ PostgreSQL

Friday ใช้หน้า `/dashboard/friday-activities` ของ NextLink Console และ API `/api/v1/friday-activities` บันทึกลงฐาน NextLink เดียวกับ CRM ผ่าน `nl_db` บริษัทและผู้ติดต่อใช้รหัสเดิม ไม่มีการเขียนตาราง Friday ในฐาน LINE หรือเรียก LLM/Neo4j เพื่อบันทึกกิจกรรม

## ความสามารถชุดแรก

- สร้าง อ่าน แก้กิจกรรม เลือกบริษัท ผู้ประสานงาน วิทยากร และเจ้าหน้าที่ผู้รับผิดชอบ
- เก็บหลายรอบต่อกิจกรรม พร้อมวัน เวลา สถานที่ จำนวนรับ จอง และมาจริง โดยแยก null จากศูนย์
- เปลี่ยนสถานะ draft/contacting/invited/confirmed/in_progress/completed/cancelled ตามกฎ พร้อมเหตุผลและประวัติผู้แก้
- ป้องกันข้อมูลทับกันด้วย revision และสร้างซ้ำด้วย idempotency key ทุกการเขียนกิจกรรมและ audit อยู่ใน transaction เดียว
- นำเข้า CSV/XLSX ผ่าน preview การแก้ข้อมูล การจับคู่บริษัท และการเลือก create/update/skip ก่อน commit พร้อม source provenance และ receipt
- เปิดกิจกรรมเดิมด้วย `?activityId=<id>` ได้หลัง reload/login แม้รายการอยู่นอกเทอมหรือตัวกรองที่กำลังดู
- เพิ่ม/แก้ข้อเท็จจริงและความคิดเห็น แยกเวลาเกิดเหตุกับเวลาบันทึก เก็บแหล่งอ้างอิง ผู้เขียน ผู้แก้ และฉบับก่อนหน้า
- สร้างงานติดตามที่ระบุเจ้าหน้าที่และกำหนดส่ง เปลี่ยน open/done/cancelled พร้อมประวัติ โดยงานเลยกำหนดคำนวณจากวันที่ใน Asia/Bangkok

การกรอกกิจกรรมและ import ใช้บริษัทที่มีอยู่ใน CRM ก่อน หากไม่พบต้องเพิ่มในกระบวนการทะเบียนบริษัท ไม่สร้างหรือรวมบริษัทจากชื่อในไฟล์อัตโนมัติ บริษัทไม่ต้องมี MOU ที่ลงนามแล้วหรือ LINE group จึงใช้อ้างกิจกรรมได้

## เตรียมฐานและสิทธิ์

ใช้ [migration runbook](../migrations/README.md) สำหรับ bootstrap ฐานใหม่ หรือ upgrade ฐานเดิม จากนั้นให้ผู้ดูแลกำหนด role ของบัญชีที่เลือกผ่าน `scripts/grant_friday_access.py` บัญชีเดิมไม่ได้รับสิทธิ์ Friday โดยอัตโนมัติ staff/admin อ่านและแก้ข้อมูลธุรกิจร่วมกันได้ บัญชี inactive ใช้ session ไม่ได้

Migration ไม่ทำงานตอนเปิดแอป ต้องเลือก URL เป้าหมายชัดเจนผ่าน `NEXTLINK_MIGRATION_DATABASE_URL` หรือ argument ของ runner โค้ดรุ่นนี้ต้องมี migration ก่อนเปิดให้ผู้ใช้ล็อกอิน เพราะการตรวจ session เพิ่มเงื่อนไข is_active หาก schema ยังไม่ตรงจะตอบ 503

ก่อนใช้ฐานจริงต้องยืนยันฐาน NextLink ปลายทาง ผู้รับผิดชอบ migration สำเนาสำรอง และบัญชีที่จะให้สิทธิ์ ทดสอบ upgrade กับสำเนาก่อน ไม่ใช้ `--bootstrap` แทนการตรวจ schema ของฐานเดิม

## สัญญาข้อมูล

- API ใช้ camelCase ตาม `ApiBaseModel` IDs เป็น string ของ BIGINT ปีการศึกษาเป็น ค.ศ. เช่น 2026 และ term FIRST/SECOND/SUMMER ส่วน UI แสดง พ.ศ. +543 และแปลงครั้งเดียวที่ adapter
- วันของรอบเป็น Gregorian ISO date เวลาเป็น HH:MM ใน Asia/Bangkok ข้อมูลเก่าไม่ทราบวัน/เวลาเก็บ null ไม่สร้างเวลาเที่ยงคืน
- จำนวนคนเป็นจำนวนเต็มไม่ติดลบ มาจริงเกินจำนวนรับได้ ยอดรวมหลายรอบเป็นคนครั้ง ไม่ใช่คนไม่ซ้ำ
- กิจกรรม completed ต้องมีรอบ held อย่างน้อยหนึ่งรอบและไม่มี planned ค้าง วันที่ผ่านไปไม่เปลี่ยนสถานะเอง การขาดจำนวนคนไม่บังคับให้ใส่ศูนย์
- PUT ส่ง expectedRevision ของกิจกรรมทั้งชุด การแก้ผู้เกี่ยวข้องหรือรอบใช้ lock/revision เดียวกับกิจกรรม คำตอบ 409 ไม่เขียนข้อมูลทับ และ frontend เก็บ draft ให้ตรวจฉบับล่าสุด
- POST สร้างและ import commit ใช้ idempotency key เดิมสำหรับ retry ของคำสั่งเดิม key เดิมกับข้อมูล/รุ่นอื่นถูกปฏิเสธ
- FK รักษาประวัติ Friday การลบผู้ติดต่อหรือพนักงานที่ถูกอ้างจะได้ 409 แทนการลบข้อมูลตาม CASCADE

## API หลัก

| Method | Path ต่อท้าย `/api/v1/friday-activities` | หน้าที่ |
| --- | --- | --- |
| GET | collection | รายการ ตัวกรอง pagination และ summary ของ scope เดียวกัน |
| GET | `/options` | บริษัท ผู้ติดต่อ/พนักงาน เจ้าหน้าที่ และเทอม |
| POST | collection | สร้าง draft พร้อมบริษัท ผู้เกี่ยวข้อง และรอบ |
| GET/PUT | `/{id}` | อ่านหรือแก้กิจกรรมทั้งชุดด้วย revision |
| POST | `/{id}/transitions` | เปลี่ยนสถานะอย่างชัดเจน |
| GET | `/{id}/history` | อ่านประวัติและผู้แก้ |
| GET/POST | `/{id}/notes` | อ่านแบบแบ่งหน้า / เพิ่มข้อเท็จจริงหรือความคิดเห็น |
| PUT | `/{id}/notes/{noteId}` | แก้บันทึกพร้อมเหตุผล เก็บฉบับเดิม |
| GET | `/{id}/notes/{noteId}/versions` | อ่านฉบับก่อนหน้าพร้อมผู้แก้และเหตุผล |
| GET/POST | `/{id}/tasks` | อ่านแบบแบ่งหน้า / สร้างงานติดตาม |
| PUT | `/{id}/tasks/{taskId}` | แก้รายละเอียด ผู้รับผิดชอบ กำหนดส่ง หรือสถานะงาน |
| POST | `/imports/preview` | รับ multipart file และ yearConvention AD/BE |
| GET | `/imports/{batchId}` | อ่าน preview และ receipt |
| PATCH | `/imports/{batchId}/rows/{rowId}` | ตรวจ/แก้ข้อมูลและ mapping ด้วย expectedBatchRevision |
| POST | `/imports/{batchId}/commit` | บันทึกชุดที่เลือกด้วย expectedBatchRevision และ idempotencyKey |

OpenAPI ของ router เป็นรายละเอียด authoritative ของชื่อฟิลด์และ validation แต่ละ endpoint ตรวจ active staff ฝั่ง server หน้าเว็บไม่ส่ง actor หรือ role มาเป็นคำตัดสินสิทธิ์

## บันทึกและงานติดตาม (F2A)

ใช้ migration ใหม่ `20261019_001_friday_followups.sql` ต่อจาก F0/F1 โดยไม่แก้ migration ที่เคยใช้แล้ว เพิ่ม `friday_notes`, `friday_note_versions`, `friday_tasks` และ detail ของ audit เดิม ข้อมูลกับ receipt เก่าคงเดิม ไม่มีการย้าย CRM notes หรือส่งบันทึก Friday เข้า graph/AI

การเขียน notes/tasks ทุกครั้งส่ง `expectedRevision` ของกิจกรรมและ `idempotencyKey` ใช้ parent lock เดียวกับการแก้กิจกรรม/รอบ รวมข้อมูล เวอร์ชัน revision audit และ receipt ใน transaction เดียว key เดิมต้องเป็นคำสั่งเดิมรวม activity/item/revision; exact retry คืนคำตอบเดิม แม้มีการแก้รายการภายหลัง การใช้ key กับคำสั่งอื่นได้ 409

บันทึกต้องระบุ `kind=fact|comment` และ body; reference กับ occurredAt เป็น optional ค่าว่างไม่สร้างเวลาเทียม occurredAt ต้องเป็น ISO datetime พร้อม timezone UI รับเวลาไทยและส่ง +07:00 ส่วน recordedAt/ผู้เขียนมาจากเซิร์ฟเวอร์ การแก้ต้องมีเหตุผล ผู้เขียนเดิมไม่เปลี่ยนและอ่าน snapshot ทุกฉบับได้ ข้อเท็จจริงเป็นข้อมูลที่เจ้าหน้าที่จัดประเภท ยังไม่มี workflow ตรวจรับกรณีปัญหา

งานใหม่เริ่ม open มี title, assigneeUserId ของเจ้าหน้าที่ที่ active และ dueDate แบบ ISO date การยกเลิกหรือเปลี่ยนสถานะจาก done/cancelled ต้องมีเหตุผล ผู้รับผิดชอบเดิมที่ถูก deactivate ยังอยู่ในประวัติและแก้งานเดิมได้ แต่ไม่รับการมอบหมายใหม่ ไม่มี endpoint ลบข้อความหรืองานทิ้ง

History, notes และ tasks อ่านครั้งละ 50 รายการ (limit สูงสุด 100) ใช้ nextCursor ส่งกลับเป็น beforeId เพื่ออ่านเก่าลงไป; note versions ใช้ beforeVersion วิธีนี้ไม่ซ้ำรายการเมื่อมีคนเพิ่มข้อความระหว่างอ่านหลายหน้า

หน้าเว็บรักษาร่างเมื่อเจอ 409 และให้ตรวจรายการปัจจุบันก่อนยอมรับ revision ใหม่ ถ้าไม่ทราบผลการเขียนเพราะเครือข่ายหรือ 5xx จะพักช่องแก้และให้ retry คำสั่งเดิมก่อน ชุดนี้เก็บคำสั่งค้างในหน้าจอปัจจุบัน ผู้ใช้ควรตรวจผลก่อนปิดหรือ reload หน้า

## การนำเข้า

ดาวน์โหลด CSV template จากหน้า import ใช้ UTF-8 หรือ Excel `.xlsx` หนึ่งชีต รองรับไม่เกิน 5 MB, 1,000 แถว และ 40 คอลัมน์ต่อไฟล์ รุ่นแรกเป็นการนำเข้ากิจกรรมกับหนึ่งรอบต่อแถว กิจกรรมปลายทางที่มีหลายรอบต้องแก้ผ่านหน้ารายละเอียด

หัวคอลัมน์มาตรฐานคือ sourceKey, academicYear, term, title, companyId/companyName, sessionDate, startTime, endTime, location, format, capacity, booked, attended และ status เลือก AD/BE สำหรับปีการศึกษาตอน preview วันที่ ISO ยังคงเป็น ค.ศ. ค่า status ต้องระบุชัด ไม่มีการเดาว่าจัดแล้วจากวันที่

Preview เก็บ raw value, hash, แถวต้นทาง, ข้อผิดพลาด และผลจับคู่ โดยยังไม่สร้างกิจกรรม การแก้ mapping บริษัทไม่เปลี่ยนค่าจำนวน/วันที่ที่ผิดเป็น null เงียบ ๆ ผู้ใช้ต้องแก้หรือเลือกข้าม คำว่า create/update/skip เป็นการตัดสินใจของผู้ตรวจ

ทั้งชุดแถวที่เลือกใช้ transaction เดียว รวมข้อมูลธุรกิจ provenance audit และ receipt หากแถวใดล้มจะ rollback ทั้งชุด แถวที่ยังตรวจไม่เสร็จคงอยู่ใน preview และรับต่อภายหลังได้ด้วย revision/key ใหม่ แถวที่ commit แล้วแก้ซ้ำจาก preview ไม่ได้

ไฟล์เดิมกับ mapping เดิมไม่สร้างกิจกรรมซ้ำ snapshot ใหม่หรือไฟล์ที่จัดแถวใหม่ต้องเลือก create/update/skip อย่างชัดเจน ระบบเสนอรายการที่อาจตรง แต่ไม่ upsert จากชื่อกิจกรรมหรือชื่อบริษัทเพียงอย่างเดียว

เมื่อคำสั่ง commit timeout หรือเซิร์ฟเวอร์ไม่ตอบ ห้ามแก้คำสั่งแล้วส่ง key ใหม่ทันที ให้ลองคำสั่งเดิมหรืออ่าน receipt ล่าสุด UI เก็บ key ต่อคำสั่งและแยก receipt ใหม่จากของรอบก่อน

## การทดสอบ

Backend tests ใช้ PostgreSQL ที่ผู้รันทดสอบเลือกชัดเจน URL ต้องเป็น loopback และชื่อฐานขึ้นต้นด้วย `nextlink_security_test` ใช้ฐานทิ้งได้เท่านั้น

```sh
python -m pip install -r backend/requirements-test.txt
TEST_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" \
NEXTLINK_DATABASE_URL="$LOCAL_TEST_DATABASE_URL" \
PYTHON_DOTENV_DISABLED=1 \
python -m pytest backend/tests -q
```

`backend/tests/friday_live_app.py` เป็น app สำหรับตรวจ browser ในเครื่องเท่านั้น มี auth/Friday/import จริงผ่าน PostgreSQL แต่ไม่โหลดโมเดลหรือ replay graph และไม่ให้ใช้ URL ฐาน production Health ของ harness ไม่ใช่ readiness ของ production API

Backend regressions ครอบคลุม lost update, concurrent create retry, audit rollback, lifecycle/reopen, nullable metrics, identity namespaces, CRM DELETE conflict, migration checksum/upgrade/transaction และ import mapping/partial continuation/idempotence

F2A เพิ่มการตรวจการแก้ note แข่งกับ activity, retry พร้อมกัน, note version/author, อ้างรายการคนละกิจกรรม, rollback เมื่อ audit ล้ม, สิทธิ์ที่ถูกถอน, pagination และ upgrade จาก F1 ที่มีข้อมูล/receipt เดิม

การทดสอบเปิดสองบัญชีพร้อมกันพบ burst ที่ใช้ connection pool เต็ม จึงเพิ่ม bounded wait ใน PostgresPool ร่วม: จำนวน connection ยังใช้ PG_POOL_MAX เดิม (ค่าเริ่มต้น 10) แต่รอคิวได้ไม่เกิน PG_POOL_WAIT_SECONDS (ค่าเริ่มต้น 5 วินาที) แล้วตอบ 503 หากยังเต็ม ทุกเส้นทางรวม checkout/transaction failure คืน capacity มี regression ด้วย pool ขนาดหนึ่ง connection และทดสอบ browser สองบัญชีด้วยค่าเริ่มต้นจริง

การตรวจ browser จริงใช้ `frontend/scripts/friday/check-live.mjs` ซึ่งตรวจชื่อและพอร์ตฐานจาก health ก่อนเขียน ต้อง build frontend ด้วย `API_ORIGIN=http://127.0.0.1:<harness-port>` อย่างชัดเจน; ค่า production ปริยายชี้ backend ของทีมและใช้กับการทดสอบนี้ไม่ได้ ตั้ง `FRIDAY_LIVE_BASE_URL`, `TEST_DATABASE_URL`, `FRIDAY_TEST_PYTHON`, `FRIDAY_QA_OUTPUT` ให้ตรง harness และฐานทิ้งได้ สามารถตั้ง `FRIDAY_QA_RESET=1` เฉพาะฐาน fixture เดิมที่ต้องการล้างแล้วรันใหม่

## งานที่ยังอยู่นอกชุดนี้

ยังไม่เพิ่ม timeline รวมรายบริษัท/กรณีปัญหาที่ผ่านการตรวจรับ (F2B), รายชื่อนิสิต/check-in แบบรายบุคคล ผลประเมินสองฝั่งและสถิติ Feedback, export ข้อมูลกิจกรรมจริง, ระบบจองห้องร่วมกับวิชาเลือก, Google Forms/Sheets sync, LINE reminder หรือ AI retrieval ของ Friday หน้าจอ live จึงไม่แสดงข้อสรุป MOU/Feedback จาก fixture เดิม

ข้อมูลจากการทดสอบ browser เป็นข้อมูลสมมติในฐานแยก การผ่าน build/tests ไม่ยืนยัน migration/grants/ข้อมูลจริง/deployment ของ production การเปิดใช้งานจริงเป็นขั้น release แยกจากการเตรียมโค้ดนี้
