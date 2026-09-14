# Dashboard ในเว็บ NextLink

ย้ายหน้าเว็บจาก `nextlink-elective-dashboard` มาอยู่ใน `Graph_RAG/frontend`
ที่ `/dashboard` โดยใช้ login, sidebar, เมนูมือถือ และธีมของเว็บ NextLink ร่วมกัน
สถานะของรอบนี้คือ **ย้าย UI พร้อมข้อมูลทดลอง** ยังไม่ได้ต่อ Dashboard กับ Database v1

## เส้นทางที่ใช้

| หน้า | URL | สิ่งที่ย้ายมา |
| --- | --- | --- |
| ภาพรวม | `/dashboard` | ทางเข้าทั้ง 6 โมดูลและทางลัดงานติดตาม |
| วิชาเลือก | `/dashboard/electives` | ความพร้อมวิชา ที่นั่ง เอกสาร งานติดตาม และแก้ไขรายละเอียด |
| MOU | `/dashboard/mou` | สถานะเอกสาร การตรวจแก้ มอบอำนาจ และรายละเอียดบริษัท |
| ฝึกงาน | `/dashboard/internship` | อันดับบริษัท จำนวนรับรายตำแหน่ง และผลรับจริง |
| สหกิจ | `/dashboard/cooperative` | รายการและจำนวนรับแยกจากฝึกงาน |
| Capstone | `/dashboard/capstone` | หัวข้อ ทีม อันดับ บริษัท–อาจารย์ บันทึก และประวัติ |
| Friday Activity | `/dashboard/friday-activities` | กิจกรรมรายเทอม บริษัท จำนวนคน ผลประเมิน และงานติดตาม (เพิ่มภายหลังรอบย้าย) |

ปี/เทอมและตัวกรองอยู่ใน query string เช่น
`/dashboard/electives?year=2568&term=2&q=Cloud` และกลับมาหน้าเดิมหลัง login ได้
เมนูภายใน Dashboard ชี้ไปยัง `/dashboard/...` ทั้งหมด

Planner ที่ `/elective-plan` เป็นงานที่มีอยู่ก่อนแล้ว รอบนี้ไม่ได้เพิ่มหรือย้าย Planner
และไม่รวม NextPlus ส่วน Friday Activity เพิ่มภายหลังรอบย้าย ตาม [ขอบเขตหน้าใหม่](friday-activity-dashboard.md)

## โครงสร้างสำหรับ dev

| ตำแหน่ง | หน้าที่ |
| --- | --- |
| `src/app/dashboard/` | Routes, metadata, loading/error boundary และ layout |
| `src/features/dashboard/components/dashboard-frame.tsx` | ใช้ RequireAuth/ConsoleFrame และแสดงสถานะข้อมูลทดลอง |
| `src/features/dashboard/components/` | หน้าสรุป ตัวกรอง ตาราง และ dialogs แยกโหลดเมื่อเปิด |
| `src/features/dashboard/lib/` | Types, สถิติ, validation, period mapping และการจัดการข้อมูลทดลอง |
| `src/features/dashboard/data/` | Fixtures ของ Dashboard เดิม |
| `src/features/dashboard/dashboard.css` | CSS ที่จำกัดขอบเขตด้วย `.nextlink-dashboard` และรองรับธีมของเว็บ |
| `scripts/dashboard/` | Regression tests ของข้อมูลและการรวมหน้าเว็บ |

อ้างอิง source commit `bbc04762eb95ac2ff9235761d8f85497821118aa`
ของ `nextlink-elective-dashboard` โดยไม่ได้แก้ repository ต้นทาง
ไม่มี dependency ใหม่ และไม่ย้าย Prisma, ระบบ staff login เดิม หรือ API ของ Dashboard
มาซ้อนกับระบบ NextLink

## ข้อมูลและการบันทึก

- ทั้ง 6 โมดูลใช้ข้อมูลทดลองที่มากับ source แม้เครื่องจะมี `DATABASE_URL`
- การแก้ไขเก็บใน localStorage ภายใต้ `nextlink.dashboard.demo.user-<id>.*`
  แยกบัญชี โมดูล และปี/เทอม และใช้ Web Locks สำหรับการแก้พร้อมกันหลายแท็บ
- ฝึกงานกับสหกิจใช้คนละชุดการแก้ไข การคืนค่าหน้าหนึ่งไม่กระทบอีกหน้า
- การแก้ไขทดลองไม่ส่งไปยัง API ของบริษัท ผู้ติดต่อ LINE หรือ AI
  ConsoleFrame ยังอ่านข้อมูลเดิมสำหรับตัวเลขในเมนูตามพฤติกรรมของเว็บ
- ข้อมูลทดลองไม่ซิงก์ข้ามเครื่องและไม่ใช่ข้อมูลร่วมของเจ้าหน้าที่
  การแยกชื่อ key ตามบัญชีมีไว้แยกงานทดลอง ไม่ใช่การป้องกันข้อมูลจากผู้ใช้เครื่องเดียวกัน
- localStorage ของเว็บไซต์ Dashboard เดิมไม่ได้ถูกย้ายอัตโนมัติ และไม่ได้ลบต้นฉบับ
  เบราว์เซอร์แยกข้อมูลตาม origin หากต้องย้ายข้อมูลแก้จริงจากเว็บเดิม ต้องทำ import ที่ตรวจสอบได้

รูปแบบ patch, การตรวจข้อมูล, การแจ้ง conflict, recovery และ undo ของข้อมูลทดลองยังอยู่
Dialog ที่เปลี่ยนรายการจะเริ่ม draft ใหม่ และเตือนก่อนทิ้งข้อมูลที่ยังไม่บันทึก

## จุดที่ต้องทำเมื่อต่อข้อมูลจริง

1. สร้าง domain APIs ใน FastAPI และ migration ตาม schema ที่ตกลงกับทีม
   โดยตรวจความเข้ากันได้กับ NextLink_DB ก่อน ไม่รัน reference SQL ทั้งชุดแทน migration
2. เปลี่ยนแหล่งข้อมูลใน feature เป็น service adapter ที่ใช้ session เดิมของเว็บ
   และบังคับสิทธิ์ที่ API ทุกคำขอ รวมถึงการอ่าน แก้ และ export
3. ตอนนี้ RequireAuth ป้องกันการแสดงหน้าเว็บ แต่ fixtures อาจอยู่ใน JavaScript/RSC payload
   จึงห้ามแทน fixtures ด้วยข้อมูลส่วนบุคคลจริงโดยพึ่ง client guard เพียงอย่างเดียว
4. เพิ่ม optimistic concurrency ด้วย revision และ audit ผู้แก้/เวลาแก้ที่ฝั่ง server
   การแก้ใน localStorage ไม่ใช้แทนการบันทึกจริง
5. ทดสอบด้วยฐานข้อมูลทดสอบและบัญชีจริงที่จัดไว้ ก่อนเปิดใช้ข้อมูลส่วนกลาง

## ผลตรวจรอบย้าย

ตรวจบน local production build วันที่ 14 กันยายน 2569:

| คำสั่งจาก `frontend/` | ขอบเขต |
| --- | --- |
| `npm run build` | Build และตรวจ TypeScript ของเว็บทั้งหมด |
| `npm run check:dashboard` | 46 tests: ตัวเลข ความสัมพันธ์ ปี/เทอม แยกฝึกงาน–สหกิจ และการแก้ข้อมูลพร้อมกัน |
| `npm run check:dashboard:browser` | 11 กลุ่มทดสอบบน Chromium ใช้ API fixtures ใน browser context ที่แยกไว้ |

Browser checks ครอบคลุม login/deep links, ทุกหน้าในสองธีม, มือถือ 390/820 px,
เปิด dialog และบันทึกทั้ง 5 โมดูล, reload, query filters, แยกบัญชี,
การคืนค่า, unsaved edits, กลับไป AI/Planner และกรณี session หมดอายุ/ยืนยันสิทธิ์ไม่ได้
Lint ของ feature, routes, scripts และ shared layout ที่แก้ไม่มี error
มี warning เดิม 2 จุดเรื่อง `<img>` โลโก้ใน Sidebar
หลักฐาน local อยู่ใน `output/playwright/dashboard/` ซึ่งไม่ถูก commit

การทดสอบ browser จำลองคำตอบของ API จึงไม่ใช่หลักฐานว่าทดสอบบัญชี production
หรือเชื่อม Database v1 แล้ว งานย้าย UI ถูก push ใน branch `codex/dashboard-web-integration`
ที่ commit `0fd8792` ส่วนการเปลี่ยน UX/UI ด้านล่างรวมอยู่ในงานเพิ่ม Friday Activity
บน branch เดียวกัน โดยยังไม่ได้ยืนยัน deployment


## ปรับ UX/UI วันที่ 14 กันยายน 2569

ตรวจหน้าเว็บจริงด้วยบัญชีและ API จำลองบนเครื่อง ครอบคลุมเมนูโมดูล การค้นหา
ผลลัพธ์ว่าง รายละเอียด และแบบฟอร์มแก้ไข โดยยังใช้ข้อมูลทดลองเดิม

| ขั้นตอน | สิ่งที่พบ | สิ่งที่ปรับ |
| --- | --- | --- |
| เลือกโมดูล | เมนูซ่อนในชื่อหน้าและบังเนื้อหาบนมือถือ | แสดงลิงก์ทั้ง 6 หน้าเสมอ ระบุหน้าปัจจุบัน และคงปี/เทอมเมื่อสลับโมดูล รวมถึงหน้า loading/error |
| อ่านบริบท | ข้อความ MOCK DATA, dataset และข้อจำกัดการบันทึกซ้ำหลายจุด | รวมข้อจำกัดไว้ในแถบข้อมูลทดลองที่ขยายอ่านได้ และระบุวันที่เป็นวันที่ของข้อมูลตัวอย่าง |
| ค้นหา | ผลลัพธ์ในทะเบียนอยู่หลังงานติดตามและกราฟ | เพิ่มปุ่มดูผลการค้นหา และกด Enter จากช่องค้นหาเพื่อไปยังทะเบียนพร้อมย้าย keyboard focus |
| อ่านการ์ดบนมือถือ | select สถานะกว้าง 147 px ในคอลัมน์ประมาณ 126 px จนซ้อนจำนวนนิสิต | จำกัด select ตามคอลัมน์ และตรวจซ้ำที่ 320/390/820 px |
| เปิดรายละเอียด | ปุ่มแก้ไขถูกบีบและแย่งพื้นที่ชื่อรายการบนมือถือ | จัดปุ่มแก้ไขไว้ใต้ชื่อ แยกปุ่มปิดด้านขวาบน โดยปุ่มบันทึกยังอยู่ใน footer ที่มองเห็นได้ |

ผลตรวจหลังปรับ: build/TypeScript ผ่าน, lint ของ Dashboard/routes/scripts ผ่านโดยไม่มี warning,
46 domain tests ผ่าน และ browser checks **13 กลุ่มผ่าน** (เพิ่มจาก 11 กลุ่มรอบย้าย)
รวมการทดสอบลิงก์โมดูล ปี/เทอม การค้นหาและผลว่างทุกโมดูล โฟกัสคีย์บอร์ด
ช่องสถานะไม่ซ้อน และปุ่มบันทึกมือถืออยู่ในจอ

หลักฐานรอบ UX/UI อยู่ใน `output/dashboard-ux/review.md` พร้อมภาพก่อนและหลังจาก
Codex in-app browser ส่วนผลทดสอบอัตโนมัติอยู่ใน `output/playwright/dashboard/results.json`
ไฟล์ใน output เป็นหลักฐานบนเครื่อง ไม่ถูก commit

ยังไม่ได้ทดสอบกับเจ้าหน้าที่จริง, VoiceOver, มือถือจริง/คีย์บอร์ดบนจอ หรือฐานข้อมูล production
รอบนี้ไม่ได้เพิ่ม Planner, NextPlus หรือปรับกฎธุรกิจและการบันทึกส่วนกลาง
