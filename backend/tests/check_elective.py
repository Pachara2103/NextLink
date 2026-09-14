"""ทดสอบ services/elective.py กับ postgres ของจริง

ไม่ใช่ unit test: ทุกกฎที่ไฟล์นั้นพึ่งพาอยู่เป็นกฎของฐานข้อมูล (UNIQUE บน
(term, room, slot), FK คู่ (id, company_id), CASCADE ตอนลบวิชา) การ mock
connection จึงทดสอบแค่ว่าเราเขียน SQL ที่สะกดถูก ไม่ได้ทดสอบว่ากฎทำงาน

**สคริปต์นี้ล้างข้อมูลในฐานที่ชี้ไป** จึงรันได้เฉพาะฐานบนเครื่องตัวเอง และ
ต้องยืนยันด้วย ELECTIVE_CHECK_WIPE=yes อีกชั้น

รัน:
    createdb nextlink_check
    psql -d nextlink_check -f migrations/init.sql
    psql -d nextlink_check -f migrations/outbox.sql
    psql -d nextlink_check -f migrations/electives.sql
    NEXTLINK_DATABASE_URL=postgresql://postgres:<รหัส>@localhost:5432/nextlink_check \
    ELECTIVE_CHECK_WIPE=yes python tests/check_elective.py
"""

import os
import sys
import types
import pathlib
from urllib.parse import urlsplit

# neo4j ไม่ได้ติดตั้งในเครื่องที่รันสคริปต์นี้ - core.db import มันไว้ตอนโหลด
# โมดูล แต่ทุกอย่างที่ทดสอบที่นี่ไม่แตะกราฟเลย
if "neo4j" not in sys.modules:
    fake = types.ModuleType("neo4j")
    class _Driver:  # noqa: D401
        pass
    fake.GraphDatabase = types.SimpleNamespace(driver=lambda *a, **k: _Driver())
    fake.Driver = _Driver
    fake.exceptions = types.ModuleType("neo4j.exceptions")
    fake.basic_auth = lambda *a, **k: None
    sys.modules["neo4j"] = fake
    sys.modules["neo4j.exceptions"] = fake.exceptions

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import psycopg2

from core.exceptions import AppException, BadRequestError, NotFoundError
from schemas.elective import (
    ElectiveChecklistUpdate,
    ElectivePerson,
    ElectiveRoomBlock,
    ElectiveRoomWrite,
    ElectiveSessionWrite,
    ElectiveTermCreate,
    ElectiveWrite,
)
from schemas.enums import DeliveryMode, ElectiveSlot, RoomTier, SessionSource, TermStatus
import services.elective as svc

DSN = os.environ["NEXTLINK_DATABASE_URL"]
USER_ID = 1

_host = urlsplit(DSN).hostname or ""
if _host not in ("localhost", "127.0.0.1", "::1", "host.docker.internal"):
    raise SystemExit(f"ปฏิเสธที่จะรัน: {_host} ไม่ใช่ฐานบนเครื่องตัวเอง")
if os.environ.get("ELECTIVE_CHECK_WIPE") != "yes":
    raise SystemExit("สคริปต์นี้ล้างข้อมูลทั้งฐาน ตั้ง ELECTIVE_CHECK_WIPE=yes ถ้าแน่ใจ")

# กราฟถูกตัดออก: enqueue ยังเขียน graph_outbox จริง (นั่นคือสิ่งที่อยากเทส)
# ส่วน flush ที่จะไปคุยกับ neo4j ไม่ต้องทำ
svc._flush_people = lambda pending: None

checks = 0


def check(name, fn):
    global checks
    fn()
    checks += 1
    print("  ✓ " + name)


def expect(kind, message_part, fn):
    try:
        fn()
    except AppException as e:
        assert isinstance(e, kind), f"ได้ {type(e).__name__} แทน {kind.__name__}: {e.message}"
        assert message_part in e.message, f"ข้อความไม่ตรง: {e.message!r}"
        return e
    raise AssertionError(f"ควรจะพังด้วย {kind.__name__} แต่ผ่านไปได้")


def reset():
    with psycopg2.connect(DSN) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                TRUNCATE elective_sessions, elective_availability, elective_checklists,
                         elective_room_blocks, electives, elective_rooms, elective_terms,
                         graph_outbox RESTART IDENTITY CASCADE;
                DELETE FROM employees;
                DELETE FROM companies;
                DELETE FROM users;
            """)
            cur.execute(
                "INSERT INTO users (id, username, password) VALUES (1, 'tester', 'x') "
                "ON CONFLICT (id) DO NOTHING;"
            )
            cur.execute(
                "INSERT INTO companies (id, company_th) VALUES (1, 'บริษัทหนึ่ง'), (2, 'บริษัทสอง');"
            )
            cur.execute("SELECT setval('companies_id_seq', 2);")
        conn.commit()


def rooms_seed():
    a = svc.create_room(ElectiveRoomWrite(
        name="301", building="จุฬาพัฒน์ 14", floor="3", seats=40,
        tier=RoomTier.READY,
        blocked_slots=[ElectiveRoomBlock(slot=ElectiveSlot.MON_AM, reason="วิชาบังคับ")],
    ))
    b = svc.create_room(ElectiveRoomWrite(
        name="ENG-201", building="วิศวฯ 4", floor="2", seats=80, seats_is_estimated=True,
    ))
    return a, b


def course(code="2110123", section=1, mode=DeliveryMode.ON_SITE, company_id=1,
           lecturer="อาจารย์สมชาย", availability=None, sessions_per_week=1, capacity=40,
           coordinator=None, term_id=None):
    return ElectiveWrite(
        term_id=term_id, company_id=company_id, course_code=code, section=section,
        elective_name="วิชาทดสอบ", category="เทคโนโลยี", delivery_mode=mode,
        capacity=capacity, sessions_per_week=sessions_per_week, weeks=10,
        lecturer=ElectivePerson(name=lecturer),
        coordinator=coordinator,
        availability=availability if availability is not None else [ElectiveSlot.MON_AM, ElectiveSlot.WED_PM],
    )


print("เทอม")
reset()


def _terms():
    term = svc.create_term(ElectiveTermCreate(year=2568, semester=2))
    assert term.status == TermStatus.CURRENT and term.id == 1
    later = svc.create_term(ElectiveTermCreate(year=2569, semester=1))
    assert later.status == TermStatus.CURRENT
    assert svc.get_current_term().id == later.id
    listed = svc.list_terms()
    assert [t.year for t in listed.items] == [2569, 2568], listed
    assert [t.status for t in listed.items] == [TermStatus.CURRENT, TermStatus.ARCHIVED]


check("เปิดเทอมใหม่แล้วเทอมเก่าถูกปิดให้ใน transaction เดียว", _terms)


def _dup_term():
    expect(BadRequestError, "เคยเปิดเทอมนี้ไปแล้ว",
           lambda: svc.create_term(ElectiveTermCreate(year=2568, semester=2)))
    # ปิดเทอมเก่าไปแล้วก็ยังต้องมีเทอมที่จัดอยู่เหลืออยู่หนึ่ง
    assert svc.get_current_term().year == 2569


check("เปิดเทอมซ้ำปี/ภาคเดิมถูกปฏิเสธ และเทอมปัจจุบันไม่หายไป", _dup_term)


def _no_current():
    svc.archive_term(svc.get_current_term().id)
    expect(NotFoundError, "ยังไม่มีเทอมที่กำลังจัด", svc.get_current_term)
    svc.create_term(ElectiveTermCreate(year=2569, semester=2))


check("ไม่มีเทอมที่จัดอยู่ = 404 พร้อมบอกว่าต้องเปิดเทอมก่อน", _no_current)


print("ห้อง")


def _rooms():
    a, b = rooms_seed()
    assert [x.slot for x in a.blocked_slots] == [ElectiveSlot.MON_AM]
    assert a.tier == RoomTier.READY and b.seats_is_estimated is True
    listed = svc.list_rooms()
    assert [r.name for r in listed.items] == ["301", "ENG-201"], [r.name for r in listed.items]
    expect(BadRequestError, "มีห้องชื่อนี้ในอาคารนี้อยู่แล้ว", lambda: svc.create_room(
        ElectiveRoomWrite(name="301", building="จุฬาพัฒน์ 14", floor="9", seats=10)))


check("สร้างห้องพร้อมคาบที่ติดงานอื่น และชื่อซ้ำในอาคารเดียวถูกปฏิเสธ", _rooms)


def _room_blocks():
    room = svc.list_rooms().items[0]
    updated = svc.set_room_blocks(room.id, [
        ElectiveRoomBlock(slot=ElectiveSlot.FRI_PM, reason="สอบกลางภาค"),
        ElectiveRoomBlock(slot=ElectiveSlot.TUE_AM, reason="งานคณะ"),
    ])
    # เขียนทับทั้งชุด และเรียงตามลำดับการอ่านตาราง (อังคารมาก่อนศุกร์)
    assert [b.slot for b in updated.blocked_slots] == [ElectiveSlot.TUE_AM, ElectiveSlot.FRI_PM]


check("แก้คาบที่ห้องติดงานอื่นคือเขียนทับทั้งชุด และคืนมาเรียงตามสัปดาห์", _room_blocks)


print("วิชากับคนของบริษัท")


def _create_course():
    created = svc.create_elective(course(), USER_ID)
    assert created.lecturer_name == "อาจารย์สมชาย"
    assert created.company_th == "บริษัทหนึ่ง"
    assert created.availability == [ElectiveSlot.MON_AM, ElectiveSlot.WED_PM]
    assert created.coordinator_id is None

    with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT relevant, job_title, status, company_id FROM employees WHERE id = %s;",
                    (created.lecturer_id,))
        assert cur.fetchone() == ("elective", "lecturer", "pending", 1)
        cur.execute("SELECT entity, entity_id, op FROM graph_outbox;")
        assert cur.fetchall() == [("employee", created.lecturer_id, "upsert")]
        # เช็กลิสต์เกิดพร้อมวิชาเสมอ
        cur.execute("SELECT count(*) FROM elective_checklists WHERE elective_id = %s;",
                    (created.id,))
        assert cur.fetchone()[0] == 1


check("อาจารย์ที่ยังไม่มีในบริษัทถูกสร้างเป็นแถวใหม่ + เข้าคิวกราฟ + มีเช็กลิสต์ทันที", _create_course)


def _reuse_person():
    before = svc.list_electives().items[0]
    second = svc.create_elective(course(code="2110124", lecturer="  อาจารย์สมชาย  "), USER_ID)
    # ชื่อเดียวกันในบริษัทเดียวกัน = คนเดิม ไม่ใช่แถวใหม่
    assert second.lecturer_id == before.lecturer_id
    other_company = svc.create_elective(
        course(code="2110125", company_id=2, lecturer="อาจารย์สมชาย"), USER_ID)
    # ...แต่ชื่อเดียวกันคนละบริษัทคือคนละคน
    assert other_company.lecturer_id != before.lecturer_id


check("ชื่อเดิมในบริษัทเดิมใช้แถวเดิม ส่วนบริษัทอื่นได้แถวของตัวเอง", _reuse_person)


def _cross_company_person():
    stranger = svc.list_electives().items[-1].lecturer_id
    expect(NotFoundError, "ในบริษัทที่เปิดวิชานี้", lambda: svc.create_elective(
        ElectiveWrite(
            company_id=1, course_code="2110126", elective_name="x", category="y",
            capacity=10, lecturer=ElectivePerson(id=stranger),
        ), USER_ID))


check("อ้าง id ของคนจากบริษัทอื่นถูกปฏิเสธก่อนถึง FK", _cross_company_person)


def _duplicate_code():
    expect(BadRequestError, "รหัสวิชาและตอนเรียนนี้อยู่แล้ว",
           lambda: svc.create_elective(course(code="2110123", section=1), USER_ID))
    # ตอนเรียนต่างกันคือคนละวิชา
    assert svc.create_elective(course(code="2110123", section=2), USER_ID).section == 2


check("รหัสวิชาซ้ำในตอนเดิมถูกปฏิเสธ แต่คนละตอนเปิดได้", _duplicate_code)


def _update_course():
    target = [e for e in svc.list_electives().items if e.course_code == "2110124"][0]
    updated = svc.update_elective(target.id, course(
        code="2110124", lecturer="อาจารย์สมหญิง", capacity=25,
        availability=[ElectiveSlot.SAT_EVE],
        coordinator=ElectivePerson(name="คุณประสาน", email="coord@example.com"),
    ), USER_ID)
    assert updated.lecturer_name == "อาจารย์สมหญิง" and updated.capacity == 25
    assert updated.availability == [ElectiveSlot.SAT_EVE]
    assert updated.coordinator_name == "คุณประสาน"
    # อีเมล/เบอร์ต้องอ่านกลับมาด้วย ไม่ใช่แค่ชื่อ - ฟอร์มแก้วิชาแสดงสามช่องนี้
    # เป็นชุดเดียวกัน ถ้าได้กลับมาแค่ชื่อ การกดบันทึกครั้งต่อไปจะลบอีกสองช่อง
    assert updated.coordinator_email == "coord@example.com"
    assert updated.coordinator_phone is None
    with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT job_title, email FROM employees WHERE id = %s;",
                    (updated.coordinator_id,))
        assert cur.fetchone() == ("coordinator", "coord@example.com")


check("แก้วิชาแทนที่ช่วงที่สะดวกทั้งชุด และสร้างผู้ประสานงานให้ถ้ายังไม่มี", _update_course)


def _availability_only():
    target = [e for e in svc.list_electives().items if e.course_code == "2110124"][0]
    changed = svc.set_availability(target.id, [ElectiveSlot.WED_PM, ElectiveSlot.MON_AM, ElectiveSlot.MON_AM])
    assert changed.availability == [ElectiveSlot.MON_AM, ElectiveSlot.WED_PM]
    assert changed.capacity == 25, "แก้ช่วงที่สะดวกต้องไม่แตะช่องอื่น"


check("แก้ช่วงที่สะดวกอย่างเดียว - ตัดค่าซ้ำ เรียงให้ และไม่แตะช่องอื่น", _availability_only)


print("ผลการจัด")


def _place():
    room = svc.list_rooms().items[0]
    target = [e for e in svc.list_electives().items if e.course_code == "2110123" and e.section == 1][0]
    placed = svc.place_session(ElectiveSessionWrite(
        elective_id=target.id, slot=ElectiveSlot.MON_AM, room_id=room.id))
    assert placed.start_time.isoformat() == "09:00:00"
    assert placed.end_time.isoformat() == "12:00:00"
    assert placed.term_id == target.term_id and placed.source == SessionSource.MANUAL


check("วางคาบแล้วได้ขอบเวลาของคาบนั้นมาเอง และ term ตามวิชา", _place)


def _room_clash():
    room = svc.list_rooms().items[0]
    other = [e for e in svc.list_electives().items if e.course_code == "2110124"][0]
    expect(BadRequestError, "ห้องนี้มีคลาสอยู่แล้วในคาบนี้", lambda: svc.place_session(
        ElectiveSessionWrite(elective_id=other.id, slot=ElectiveSlot.MON_AM, room_id=room.id)))


check("ห้องเดียว คาบเดียว สองคลาส = ข้อความเดียวกับที่หน้าเว็บพูด", _room_clash)


def _quota():
    room = svc.list_rooms().items[1]
    target = [e for e in svc.list_electives().items if e.course_code == "2110123" and e.section == 1][0]
    expect(BadRequestError, "ถูกจัดครบจำนวนคาบแล้ว", lambda: svc.place_session(
        ElectiveSessionWrite(elective_id=target.id, slot=ElectiveSlot.WED_PM, room_id=room.id)))


check("วิชาที่ต้องการสัปดาห์ละคาบเดียว วางคาบที่สองไม่ได้", _quota)


def _online():
    online = svc.create_elective(course(code="2110130", mode=DeliveryMode.ONLINE), USER_ID)
    room = svc.list_rooms().items[0]
    expect(BadRequestError, "วิชาออนไลน์ไม่ใช้ห้องเรียน", lambda: svc.place_session(
        ElectiveSessionWrite(elective_id=online.id, slot=ElectiveSlot.MON_AM, room_id=room.id)))
    # ...และวางคาบเดียวกับคนอื่นได้ เพราะไม่ได้กินห้อง
    placed = svc.place_session(ElectiveSessionWrite(elective_id=online.id, slot=ElectiveSlot.MON_AM))
    assert placed.room_id is None

    onsite = svc.create_elective(course(code="2110131"), USER_ID)
    expect(BadRequestError, "ต้องมีห้องเรียน", lambda: svc.place_session(
        ElectiveSessionWrite(elective_id=onsite.id, slot=ElectiveSlot.WED_PM)))


check("ออนไลน์ห้ามมีห้อง (และไม่ชนใคร) ส่วนวิชาในห้องต้องมีห้อง", _online)


def _move():
    room_a, room_b = svc.list_rooms().items
    target = [e for e in svc.list_electives().items if e.course_code == "2110123" and e.section == 1][0]
    session = [s for s in svc.get_plan().sessions if s.elective_id == target.id][0]

    # ย้ายไปคาบอื่น = เวลากลับไปเป็นขอบคาบใหม่
    moved = svc.update_session(session.id, ElectiveSessionWrite(
        elective_id=target.id, slot=ElectiveSlot.WED_PM, room_id=room_a.id))
    assert moved.start_time.isoformat() == "13:00:00"

    # เปลี่ยนเวลาเองในคาบเดิม แล้วเปลี่ยนแค่ห้อง - เวลาที่ตั้งเองต้องอยู่
    import datetime
    retimed = svc.update_session(session.id, ElectiveSessionWrite(
        elective_id=target.id, slot=ElectiveSlot.WED_PM, room_id=room_a.id,
        start_time=datetime.time(13, 30), end_time=datetime.time(15, 30)))
    assert retimed.start_time.isoformat() == "13:30:00"
    kept = svc.update_session(session.id, ElectiveSessionWrite(
        elective_id=target.id, slot=ElectiveSlot.WED_PM, room_id=room_b.id))
    assert kept.start_time.isoformat() == "13:30:00", "เปลี่ยนห้องอย่างเดียวไม่ควรลบเวลาที่ตั้งเอง"


check("ย้ายคาบรีเซ็ตเวลา แต่เปลี่ยนห้องอย่างเดียวเก็บเวลาที่ตั้งเองไว้", _move)


def _locked():
    room_a, room_b = svc.list_rooms().items
    target = [e for e in svc.list_electives().items if e.course_code == "2110123" and e.section == 1][0]
    session = [s for s in svc.get_plan().sessions if s.elective_id == target.id][0]
    svc.update_session(session.id, ElectiveSessionWrite(
        elective_id=target.id, slot=session.slot, room_id=session.room_id, is_locked=True))
    expect(BadRequestError, "ปลดล็อกคาบนี้ก่อนย้าย", lambda: svc.update_session(
        session.id, ElectiveSessionWrite(
            elective_id=target.id, slot=ElectiveSlot.THU_AM, room_id=room_a.id, is_locked=True)))
    expect(BadRequestError, "ปลดล็อกคาบนี้ก่อนเอาออก", lambda: svc.delete_session(session.id))


check("คาบที่ล็อกไว้ย้ายไม่ได้และลบไม่ได้", _locked)


def _replace():
    plan = svc.get_plan()
    room_a, room_b = svc.list_rooms().items
    locked = [s for s in plan.sessions if s.is_locked]
    assert len(locked) == 1
    free = [e for e in plan.electives if e.course_code in ("2110125", "2110131")]

    result = svc.replace_sessions(None, [
        ElectiveSessionWrite(elective_id=e.id, slot=ElectiveSlot.FRI_AM if i else ElectiveSlot.TUE_PM,
                             room_id=room_b.id, source=SessionSource.AUTO)
        for i, e in enumerate(free)
    ])
    ids = {s.id for s in result.items}
    assert locked[0].id in ids, "คาบที่ล็อกไว้ต้องรอด"
    assert len(result.items) == 3, [(_s.elective_id, _s.slot) for _s in result.items]
    assert sorted(s.source for s in result.items) == ["auto", "auto", "manual"]


check("จัดตารางใหม่ทิ้งเฉพาะคาบที่ไม่ได้ล็อก", _replace)


def _replace_rejects_all_or_nothing():
    before = {s.id for s in svc.get_plan().sessions}
    plan = svc.get_plan()
    room_b = svc.list_rooms().items[1]
    free = [e for e in plan.electives if e.course_code in ("2110125", "2110131")]
    # สองวิชาลงห้องเดียวคาบเดียว - ต้องพังทั้งชุด ไม่ใช่ได้ครึ่งเดียว
    expect(BadRequestError, "ห้องนี้มีคลาสอยู่แล้วในคาบนี้", lambda: svc.replace_sessions(None, [
        ElectiveSessionWrite(elective_id=e.id, slot=ElectiveSlot.SAT_AM, room_id=room_b.id)
        for e in free
    ]))
    assert {s.id for s in svc.get_plan().sessions} == before, "ตารางเดิมต้องไม่หายไปครึ่งหนึ่ง"


check("ชุดใหม่ที่ชนกันเองถูกปฏิเสธทั้ง transaction ตารางเดิมอยู่ครบ", _replace_rejects_all_or_nothing)


def _replace_respects_quota():
    before = {s.id for s in svc.get_plan().sessions}
    room_a = svc.list_rooms().items[0]
    target = [e for e in svc.get_plan().electives if e.course_code == "2110125"][0]
    expect(BadRequestError, "ต้องการสัปดาห์ละ 1 คาบ", lambda: svc.replace_sessions(None, [
        ElectiveSessionWrite(elective_id=target.id, slot=slot, room_id=room_a.id)
        for slot in (ElectiveSlot.THU_PM, ElectiveSlot.THU_EVE)
    ]))
    assert {s.id for s in svc.get_plan().sessions} == before


check("จัดตารางใหม่ที่ให้คาบเกินที่วิชาต้องการถูกปฏิเสธทั้งชุด", _replace_respects_quota)


print("เช็กลิสต์")


def _checklist():
    target = svc.list_electives().items[0]
    first = svc.update_checklist(target.id, ElectiveChecklistUpdate(invite_letter="IN_PROGRESS"))
    assert first.invite_letter == "IN_PROGRESS" and first.create_mcv == "NOT_DONE"
    second = svc.update_checklist(target.id, ElectiveChecklistUpdate(mcv_join_code="ABC123"))
    assert second.invite_letter == "IN_PROGRESS", "ช่องที่ไม่ได้ส่งต้องไม่ถูกล้าง"
    assert second.mcv_join_code == "ABC123"
    assert svc.get_checklist(target.id).mcv_join_code == "ABC123"


check("PATCH เช็กลิสต์แตะเฉพาะช่องที่ส่งมา", _checklist)


print("ทั้งหน้า")


def _plan():
    plan = svc.get_plan()
    assert plan.term.status == TermStatus.CURRENT
    assert len(plan.rooms) == 2
    assert len(plan.electives) == len(plan.checklists), "ทุกวิชาต้องมีเช็กลิสต์"
    known = {e.id for e in plan.electives}
    assert all(s.elective_id in known for s in plan.sessions)
    room_ids = {r.id for r in plan.rooms} | {None}
    assert all(s.room_id in room_ids for s in plan.sessions)


check("get_plan คืนเทอม ห้อง วิชา คาบ และเช็กลิสต์ที่อ้างถึงกันได้ครบ", _plan)


def _plan_keeps_retired_room():
    room = svc.list_rooms().items[1]
    svc.update_room(room.id, ElectiveRoomWrite(
        name=room.name, building=room.building, floor=room.floor, seats=room.seats,
        is_active=False))
    assert room.id not in {r.id for r in svc.list_rooms().items}
    assert room.id in {r.id for r in svc.get_plan().rooms}, "ห้องที่ปิดแต่ยังมีคลาสต้องอยู่ในตาราง"


check("ห้องที่ถูกปิดแต่ยังมีคลาสของเทอมนี้ ยังอยู่ในตาราง", _plan_keeps_retired_room)


def _delete_room_in_use():
    room = svc.list_rooms(include_inactive=True).items[1]
    expect(BadRequestError, "กรุณาย้ายคลาสออกก่อนลบห้อง", lambda: svc.delete_room(room.id))


check("ลบห้องที่ยังมีคลาสไม่ได้ (ON DELETE SET NULL จะทำให้ตารางผิดแบบเงียบ ๆ)", _delete_room_in_use)


def _delete_course():
    target = [e for e in svc.list_electives().items if e.course_code == "2110131"][0]
    svc.delete_elective(target.id)
    with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
        for table in ("elective_sessions", "elective_availability", "elective_checklists"):
            cur.execute(f"SELECT count(*) FROM {table} WHERE elective_id = %s;", (target.id,))
            assert cur.fetchone()[0] == 0, table
    expect(NotFoundError, "ไม่พบวิชา", lambda: svc.get_elective(target.id))


check("ลบวิชาแล้วคาบ ช่วงที่สะดวก และเช็กลิสต์ตามไปด้วย", _delete_course)


print("เทอมที่ปิดแล้ว")


def _archived_is_read_only():
    plan = svc.get_plan()
    old = svc.archive_term(plan.term.id)
    assert old.status == TermStatus.ARCHIVED
    target = plan.electives[0]
    expect(BadRequestError, "เทอมนี้ปิดไปแล้ว", lambda: svc.delete_elective(target.id))
    expect(BadRequestError, "เทอมนี้ปิดไปแล้ว",
           lambda: svc.set_availability(target.id, [ElectiveSlot.MON_PM]))
    expect(BadRequestError, "เทอมนี้ปิดไปแล้ว", lambda: svc.update_checklist(
        target.id, ElectiveChecklistUpdate(create_mcv="DONE")))
    expect(BadRequestError, "เทอมนี้ปิดไปแล้ว", lambda: svc.replace_sessions(plan.term.id, []))
    # แต่ยังอ่านได้ตามปกติ
    assert svc.get_plan(plan.term.id).term.id == plan.term.id
    assert len(svc.list_electives(plan.term.id).items) == len(plan.electives)


check("เทอมที่ปิดแล้วอ่านได้แต่เขียนไม่ได้ ทุกทางเข้า", _archived_is_read_only)

print("สคริปต์ตั้งค่าเริ่มต้น")

SEED_SQL = pathlib.Path(__file__).resolve().parent.parent / "migrations" / "elective_seed.sql"


def run_seed():
    """รันไฟล์ทั้งไฟล์อย่างที่ psql รัน - รวม BEGIN/COMMIT และบล็อก DO ข้างท้าย"""
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(SEED_SQL.read_text(encoding="utf-8"))
    finally:
        conn.close()


def rooms_now():
    with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT building, name, seats, tier, is_active FROM elective_rooms ORDER BY building, name;")
        return cur.fetchall()


def _seed_opens_an_empty_database():
    reset()
    expect(NotFoundError, "ยังไม่มีเทอมที่กำลังจัด", svc.get_current_term)

    run_seed()
    term = svc.get_current_term()
    assert term.status == TermStatus.CURRENT
    rooms = svc.list_rooms().items
    assert len(rooms) == 16, len(rooms)
    ready = [room for room in rooms if room.tier == RoomTier.READY]
    assert len(ready) == 6
    assert all(room.building.startswith("จุฬาพัฒน์") for room in ready), "ห้องของภาคคือจุฬาพัฒน์"
    assert {room.building for room in rooms if room.tier != RoomTier.READY} == {
        "ตึก 3 (คณะวิศวะ)", "ตึก 4 (คณะวิศวะ)", "ตึกร้อยปี (คณะวิศวะ)",
    }
    # ที่นั่งของห้องคณะเป็นตัวเลขประมาณ หน้าเว็บจะแสดงเป็น ~40
    assert all(room.seats_is_estimated for room in rooms if room.tier != RoomTier.READY)
    # คาบที่ห้องติดงานอื่นต้องติดมาด้วย ไม่ใช่แค่ตัวห้อง
    blocked = [(room.name, block.slot, block.reason) for room in rooms for block in room.blocked_slots]
    assert blocked == [("จุฬาพัฒน์ 5 ห้อง 203", ElectiveSlot.TUE_AM, "วิชาบังคับของภาคใช้อยู่")], blocked


check("ฐานเปล่า + สคริปต์ตั้งค่า = เปิดหน้าจัดตารางได้ทันที (16 ห้อง + เทอมที่กำลังจัด)", _seed_opens_an_empty_database)


def _seed_is_idempotent_and_keeps_edits():
    before = svc.get_current_term()
    room = [item for item in svc.list_rooms().items if item.name == "ตึก 3 ชั้น 4 ห้อง 405"][0]
    svc.update_room(room.id, ElectiveRoomWrite(
        name=room.name, building=room.building, floor=room.floor, seats=99,
        seats_is_estimated=False, tier=RoomTier.READY, is_active=False,
    ))
    svc.set_room_blocks(room.id, [ElectiveRoomBlock(slot=ElectiveSlot.MON_PM, reason="ซ่อมแอร์")])

    run_seed()

    assert svc.get_current_term().id == before.id, "รันซ้ำต้องไม่เปิดเทอมใหม่"
    assert len(rooms_now()) == 16, "รันซ้ำต้องไม่เพิ่มห้องซ้ำ"
    after = [item for item in svc.list_rooms(include_inactive=True).items if item.id == room.id][0]
    # ของที่คนแก้ผ่านหน้าเว็บต้องชนะสคริปต์ตั้งค่าเสมอ
    assert after.seats == 99 and after.is_active is False and after.tier == RoomTier.READY
    assert [block.reason for block in after.blocked_slots] == ["ซ่อมแอร์"]


check("รันสคริปต์ซ้ำไม่เพิ่มห้องซ้ำ และไม่ทับสิ่งที่คนแก้ผ่านหน้าเว็บ", _seed_is_idempotent_and_keeps_edits)


def _seed_does_not_reopen_a_closed_term():
    svc.archive_term(svc.get_current_term().id)
    run_seed()
    # ปี/ภาคนี้เคยเปิดแล้ว สคริปต์จึงไม่ทำอะไร - การตั้งค่าไม่ควรเปิดเทอมที่คน
    # ตั้งใจปิด บล็อก DO ท้ายไฟล์เป็นตัวบอกคนที่รันว่าต้องไปเปิดเองที่ไหน
    expect(NotFoundError, "ยังไม่มีเทอมที่กำลังจัด", svc.get_current_term)
    assert len(svc.list_terms().items) == 1


check("สคริปต์ไม่เปิดเทอมที่คนตั้งใจปิดกลับมาเอง", _seed_does_not_reopen_a_closed_term)


print(f"\n{checks} elective service checks passed")
