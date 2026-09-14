# NextLink

เว็บสำหรับเจ้าหน้าที่ NextLink ใช้ดูแลความร่วมมือระหว่างมหาวิทยาลัยกับบริษัท รวบรวมข้อมูลกลุ่ม LINE บริษัท ผู้ประสานงาน และโน้ต พร้อมผู้ช่วย AI **คุณขวัญใจ**, Dashboard และเครื่องมือจัดตารางวิชาเลือกไว้ในเว็บเดียว

เข้าใช้ด้วยบัญชีเจ้าหน้าที่ที่ผู้ดูแลจัดเตรียมให้ หากยังไม่มีบัญชีให้ติดต่อผู้ดูแลระบบ

## ระบบทำอะไรได้บ้าง

| ส่วนงาน | ความสามารถ |
| --- | --- |
| สรุปข้อมูลจาก LINE | ดึงข้อความที่ยังไม่ได้ประมวลผล ให้ AI สกัดข้อมูลบริษัทและผู้ประสานงาน แล้วให้เจ้าหน้าที่ตรวจและยืนยัน |
| กลุ่ม LINE และบริษัท | เชื่อมกลุ่มกับบริษัท จัดการชื่อบริษัท ชื่อย่อ และข้อมูลติดต่อ |
| ผู้ติดต่อและบุคคลในบริษัท | ค้นหา เพิ่ม และแก้ข้อมูลบุคคล แยกตามบริษัท พร้อมสถานะการติดต่อหรือการทำงาน |
| โน้ต | บันทึกเหตุการณ์และข้อมูลของบริษัท แยกประเภท ปีการศึกษา และภาคเรียน |
| คุณขวัญใจ | สนทนากับ AI ที่ใช้เครื่องมือค้นข้อมูลบริษัท บุคคล และโน้ตจากกราฟ |
| Dashboard | ดูภาพรวมและรายละเอียดความร่วมมือ 6 โมดูล พร้อมทะเบียนบริษัทและประวัติร่วมของข้อมูลทดลอง |
| จัดตารางวิชาเลือก | เพิ่มรายวิชา จัดตารางอัตโนมัติหรือด้วยตนเอง จัดการห้อง ตรวจตารางชน สำรองแผน JSON และส่งออก Excel |

ทุกส่วนใช้ระบบเข้าสู่เว็บ เมนูหลัก และธีมสว่าง/มืดร่วมกัน

## หน้า Dashboard

Dashboard ปัจจุบันเป็น **mock สำหรับรีวิวหน้าจอและขั้นตอนการทำงาน** ใช้ข้อมูลสมมติ ยังไม่เชื่อมข้อมูลธุรกิจของ Dashboard กับฐานข้อมูลส่วนกลาง

| หน้า | ข้อมูลที่แสดง |
| --- | --- |
| ภาพรวม | ทางเข้าโมดูล งานติดตาม และทางเข้าทะเบียนบริษัท |
| วิชาเลือก | รายวิชา บริษัท ผู้สอน ผู้ประสานงาน จำนวนที่นั่ง เอกสาร และความพร้อมของงาน |
| MOU | สถานะเอกสาร การตรวจแก้ การมอบอำนาจ เลขอ้างอิง และงานที่ต้องติดตาม |
| ฝึกงาน | บริษัท/ตำแหน่ง จำนวนรับ อันดับความสนใจ ชั้นปี/รอบ ผลจับคู่–ตอบรับ–เริ่มฝึก ผลประเมิน และ Case ล่าสุด |
| สหกิจ | รายการและสถิติแยกชุดจากฝึกงาน |
| Capstone | หัวข้อ บริษัท ทีม อันดับ ที่ปรึกษา Milestone และประวัติการแก้ไข |
| Friday Activity | กิจกรรมและบริษัทแยกเทอม ผู้ประสานงาน จำนวนรับ/จอง/มาจริง และผลประเมิน |
| ทะเบียนบริษัท | ผู้ติดต่อหลายคน บทบาท สถานะ ประวัติความร่วมมือ และ Case ข้ามโมดูลในชุดทดลอง |

หัวข้อหลักอ้างอิง requirement และตัวอย่างเอกสารที่ทีมรวบรวมไว้ การรองรับหน้าจอเหล่านี้ยังไม่เท่ากับนำเข้าข้อมูลจริงหรือรองรับทุกคอลัมน์ในไฟล์ต้นทาง ดูรายละเอียดใน [ขอบเขตและความคืบหน้า Dashboard](frontend/docs/dashboard-requirements-progress.md)

## ข้อมูลแต่ละส่วนเก็บที่ไหน

| ส่วนงาน | แหล่งข้อมูลและการบันทึกปัจจุบัน |
| --- | --- |
| CRM / LINE / โน้ต / บัญชี | Frontend เรียก FastAPI ซึ่งเชื่อม PostgreSQL และ Neo4j ตามการตั้งค่าของ backend |
| Dashboard | ชุดข้อมูลสมมติใน frontend; การแก้ไขเก็บใน `localStorage` แยกบัญชี โดยข้อมูลรายเทอมแยกตามช่วงการศึกษา ยังไม่ซิงก์กับ CRM จริงหรือระหว่างเครื่อง |
| Planner | ข้อมูลตัวอย่างและแผนที่แก้ใน `localStorage` แยกตามเทอม แต่ **ยังไม่แยกตามบัญชีผู้ใช้**; ย้ายแผนระหว่างเครื่องด้วยไฟล์ JSON |

การย้ายเว็บไซต์หรือเปลี่ยนโดเมนจะไม่ย้าย `localStorage` ตามไปด้วย สำหรับ Planner ให้สำรอง JSON ก่อนเปลี่ยนเว็บไซต์ และใช้ browser profile แยกกันเมื่อหลายคนใช้เครื่องเดียวกัน

งานถัดไปของ Dashboard คือเชื่อม API/ฐานข้อมูล นำเข้าเอกสารจริง และยืนยันกติกาข้อมูลที่ยังค้าง เช่น ที่นั่งร่วมของชั้นปี 2–3 และรายละเอียดเฉพาะสหกิจ

## โครงสร้างระบบ

```text
NextLink/
├── frontend/
│   ├── src/app/                   หน้าเว็บและ routes ของ Next.js
│   ├── src/components/            Login, CRM, เมนู และ UI ร่วม
│   ├── src/features/dashboard/    Dashboard, ข้อมูลสมมติ และการบันทึกใน browser
│   ├── src/features/elective-plan/ Planner และตัวจัดตาราง
│   ├── src/lib/services/          ตัวเรียก backend API
│   ├── scripts/                   ชุดตรวจ frontend และ browser
│   └── docs/                      ขอบเขตการรวมระบบและวิธีตรวจ
├── backend/
│   ├── app.py                     จุดเริ่ม FastAPI
│   ├── api/v1/                    HTTP endpoints
│   ├── services/                  งานบริษัท บุคคล โน้ต บัญชี และ graph outbox
│   ├── ai/                        AI graph, chains และเครื่องมือค้นข้อมูล
│   ├── core/                      Config, การเชื่อมฐานข้อมูล และ auth
│   ├── migrations/                SQL สำหรับ schema แต่ละส่วน
│   └── tests/                     Regression tests ของ backend
└── .github/workflows/             GitHub Actions
```

| เทคโนโลยี | หน้าที่ |
| --- | --- |
| Next.js 16, React 19, TypeScript, Tailwind CSS 4 | หน้าเว็บและ API proxy |
| FastAPI / Python | API และ logic ของระบบ |
| PostgreSQL — `NEXTLINK_DATABASE_URL` | บริษัท บุคคล โน้ต บัญชี session สถานะประมวลผล และงานเขียนกราฟที่รอส่ง |
| PostgreSQL — `LINE_DATABASE_URL` | ฐานข้อมูลต้นทางของกลุ่มและข้อความ LINE |
| Neo4j | ความสัมพันธ์บริษัท/บุคคล/โน้ตและการค้นข้อมูลสำหรับ AI |
| Gemini และ LangChain/LangGraph | สกัดข้อมูลและทำงานของผู้ช่วย AI |
| Vercel / GitHub Actions / Playwright | Hosting, CI และทดสอบผ่าน browser |

Browser เรียก `/api/v1/*` ผ่าน Next.js แล้ว proxy ไป FastAPI ตาม `API_ORIGIN` ส่วนการรับ LINE webhook อยู่ในโปรเจกต์ LINE bot แยกจาก repository นี้

## เริ่มพัฒนาบนเครื่อง

### สิ่งที่ต้องเตรียม

- Node.js 22.6 ขึ้นไปในสาย 22 และ npm — CI frontend ใช้ Node.js 22
- Python — CI backend tests ใช้ Python 3.13
- Backend สำหรับพัฒนา พร้อม schema และบัญชีที่ทีมจัดเตรียมไว้ หากต้องการใช้ login และ CRM
- หากรัน backend เอง ต้องมี PostgreSQL ของ NextLink และ LINE, Neo4j และ API key สำหรับโมเดล

### Frontend

จาก root ของ repository:

```sh
cd frontend
npm ci
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) โดย dev server ใช้ backend ที่ `http://127.0.0.1:8000` เป็นค่าเริ่มต้น

หากใช้ backend สำหรับพัฒนาที่ host อื่น ให้ตั้ง `API_ORIGIN` ใน `frontend/.env.local` เป็น origin ของ backend นั้น ตัวแปรนี้ใช้ฝั่ง Next.js และต้องไม่มี `/api/v1` ต่อท้าย ดูกติกาที่ [config/api-origin.ts](frontend/config/api-origin.ts)

### Backend

จาก root เปิดอีก terminal:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

สร้าง `backend/.env` ด้วยค่าของ environment สำหรับพัฒนาที่ได้รับจากทีม:

| ตัวแปร | ค่าที่ต้องเตรียม |
| --- | --- |
| `NEXTLINK_DATABASE_URL` | Connection string ของ PostgreSQL ฝั่ง NextLink |
| `LINE_DATABASE_URL` | Connection string ของ PostgreSQL ต้นทาง LINE |
| `NEO4J_URI` | URI ของ Neo4j |
| `NEO4J_USERNAME` / `NEO4J_PASSWORD` | บัญชีเชื่อม Neo4j |
| `NEO4J_DATABASE` | ชื่อฐาน Neo4j หาก environment กำหนด |
| `GOOGLE_API_KEY` | API key สำหรับ Gemini |
| `AUTH_SECRET` | Secret สำหรับ session ของ environment นั้น |
| `LLM_MODEL` | เปลี่ยนชื่อโมเดลหากต้องการใช้ต่างจากค่าเริ่มต้นใน config |

ดูตัวแปรและค่าเริ่มต้นทั้งหมดใน [backend/core/config.py](backend/core/config.py) ไฟล์ `.env` เก็บเฉพาะเครื่องและถูก ignore จาก Git

ต้องเตรียม schema และบัญชีให้ตรงกับ backend ก่อนใช้ login; การเริ่มแอปไม่ได้สร้างฐานข้อมูลทั้งหมดให้อัตโนมัติ ให้ใช้ [migrations](backend/migrations/) ตามฐานข้อมูลเป้าหมายที่ทีมกำหนด แล้วรัน:

```sh
python app.py
```

API ใช้ `http://127.0.0.1:8000` เป็นค่าเริ่มต้น และเปิด [API docs](http://127.0.0.1:8000/docs) ได้ขณะรัน backend

### Build สำหรับรัน frontend บนเครื่อง

```sh
cd frontend
API_ORIGIN=http://127.0.0.1:8000 npm run build
npm start
```

`API_ORIGIN` ถูกใช้ตอน build สำหรับ API rewrites หาก production build ไม่ได้ตั้งค่านี้ จะใช้ backend ของทีมที่กำหนดใน [config/api-origin.ts](frontend/config/api-origin.ts)

## การตรวจสอบ

รันจาก `frontend/` หลัง `npm ci`:

```sh
npm run check:config
npm run check:planner
npm run check:dashboard
npm run lint
API_ORIGIN=http://127.0.0.1:8000 npm run build
npx playwright install chromium
npm run check:browser
npm run check:dashboard:browser
```

Browser tests เปิด production build บน localhost และจำลอง API รวมถึง login ภายใน browser ทดสอบ จึงไม่ต้องใช้บัญชีจริงหรือ backend จริง ผลผ่านของชุดนี้ไม่ได้ยืนยันการเชื่อมข้อมูล production

Backend tests ใช้ PostgreSQL ทดสอบแยก ดูการตั้งค่าที่ [Authentication security regression](.github/workflows/auth-security.yml) ส่วนชุดตรวจ frontend อยู่ที่ [Frontend integration](.github/workflows/frontend-integration.yml) และ [API routing](.github/workflows/frontend-routing.yml)

## เอกสารเพิ่มเติม

- [ภาพรวมการรวม Dashboard เข้า NextLink](frontend/docs/dashboard-integration.md)
- [สิ่งที่ Dashboard รองรับ ข้อจำกัด และวิธีทดลอง](frontend/docs/dashboard-requirements-progress.md)
- [Friday Activity และแหล่งอ้างอิงข้อมูล](frontend/docs/friday-activity-dashboard.md)
- [Planner: การบันทึก แผน JSON และการทดสอบ](frontend/docs/elective-planner-integration.md)
- [ผล CI และประวัติการทำงานบน GitHub](https://github.com/Pachara2103/NextLink/actions)
