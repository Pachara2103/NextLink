# แยกฐาน LINE integration ออกจาก Graph_RAG

โหมดเดิม `LINE_DATA_MODE=shared` ยังเป็นค่าเริ่มต้นเพื่อให้ deploy โค้ดก่อน cutover ได้ โหมดใหม่ใช้ฐาน PostgreSQL ของ NextLink เองและรับข้อมูลจาก API ของ LINE bot

1. สำรองและตรวจฐานที่ runtime ใช้ก่อนรัน `migrations/line_projection.sql` ในฐาน NextLink ขั้นนี้เพิ่มตารางและคัดลอกสถานะอ่านเดิม ไม่ย้าย/ลบตาราง LINE
2. ตั้ง `LINE_DATA_MODE=api`, `LINE_INTEGRATION_URL=https://<bot-domain>`, `LINE_INTEGRATION_API_KEY` (ตรงกับ bot `INTEGRATION_API_KEY`) และ `LINE_INTEGRATION_SOURCE_ID` ที่ตรวจจาก bot แล้ว ห้ามใช้ LINE channel token หรือ connection string ของ bot แทน
3. เรียก `POST /api/v1/line/sync` ด้วย session ของ staff จน `has_more=false` (สูงสุด 1,000 changes ต่อครั้ง) ระบบตรวจ source UUID และบันทึกแต่ละ page พร้อม cursor ใน transaction เดียว
4. หยุด backend รุ่นที่อ่าน shared tables แล้วรัน `migrations/line_projection_cutover.sql` เพื่อเปลี่ยน FK ของ `companies.group_id` และ `token_logs.group_id` มาอ้าง `line_group_refs` ตรวจกลุ่มและบริษัทเดิมก่อนเปิดใช้งาน
5. `GET /api/v1/line/groups` JOIN สำเนาใน NextLink ส่วนปุ่มอัปเดต AI sync ก่อน อ่านเฉพาะ inbound text ที่ยังไม่ unsend และทำเครื่องหมายอ่านเฉพาะ ID/version ที่ประมวลผลจริง ไม่เขียน `line_messages.is_read` ของ bot

การ sync เป็น eventual consistency: GET กลุ่มอ่านสำเนา จึงต้องเรียก `/line/sync` เป็นรอบหรือก่อน refresh; ปุ่มอัปเดต AI ทำขั้นนี้ให้แล้ว ยังไม่ได้สร้าง scheduler หรือแก้ frontend ในชุดนี้

เมื่อ AI สร้างบริษัท/บุคคล โหมดใหม่บันทึก `graph_outbox` ใน transaction เดียวกับข้อมูลและสถานะอ่านข้อความ เพื่อให้กลไก replay ของ Graph_RAG ส่งต่อไป Neo4j ภายหลัง การทดสอบนี้ยืนยันคิวใน PostgreSQL ไม่ได้เรียก Neo4j จริง

รูป/ไฟล์ไม่ถูกส่งให้ AI เมื่อข้อความที่เคยอ่านแล้วถูกแก้/unsend สำเนาจะปรับ/ล้างเนื้อหาและตั้ง `needs_review=true` เพื่อให้ตรวจผล AI เดิม แต่ยังไม่มี provenance สำหรับลบ/แก้ employee หรือกราฟย้อนหลังอัตโนมัติ และยังไม่มีหน้าจอจัดการ flag นี้ ห้ามอ้างว่า unsend ลบผล AI เก่าให้แล้ว

Cutover SQL แยกจาก additive migration เพราะ backend รุ่นเก่ายังอ้าง `line_groups` หากย้อนกลับ shared ต้องเติมข้อมูลใหม่กลับฐานเก่าและตรวจ FK ก่อน ไม่เปลี่ยน env อย่างเดียว

ทดสอบด้วย `backend/requirements-test.txt` และฐาน localhost ชื่อขึ้นต้น `nextlink_security_test`; รัน `pytest backend/tests` ครอบคลุม source mismatch, atomic cursor, read-state preservation, unsend, FK cutover และข้อความที่เข้าระหว่าง AI ทำงาน โดยใช้ AI จำลอง
