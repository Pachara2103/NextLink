"""รูปร่างข้อมูลของหน้า "จัดตารางวิชาเลือก" ที่วิ่งข้ามสาย API

หน้าเว็บพูดเป็น "คาบ" (พุธเช้า) ไม่ใช่วันที่ และพูดถึงคนด้วย "ชื่อ" ไม่ใช่ id
ไฟล์นี้จึงมีสองฝั่ง: ฝั่ง `*Write` คือสิ่งที่หน้าเว็บส่งมาได้จริง (ชื่อคน
เปล่า ๆ ก็พอ - services/elective.py จะไปหา/สร้างแถวใน employees ให้เอง) และ
ฝั่งที่ไม่มี suffix คือสิ่งที่ฐานข้อมูลตอบกลับ ซึ่งมี id ครบแล้ว
"""

from datetime import time
from typing import Literal

from pydantic import Field

from schemas.api import ApiBaseModel
from schemas.base import BaseTimestamp
from schemas.enums import (
    DeliveryMode,
    DoneStatus,
    ElectiveSlot,
    ReceiptStatus,
    RoomTier,
    SessionSource,
    TermStatus,
)

# --------------------------------------------------------------------------- #
# เทอม
# --------------------------------------------------------------------------- #


class ElectiveTermCreate(ApiBaseModel):
    year: int = Field(ge=2500, le=2700, description="ปีการศึกษา พ.ศ. เช่น 2569")
    semester: Literal[1, 2, 3] = Field(description="1 = ต้น, 2 = ปลาย, 3 = ฤดูร้อน")


class ElectiveTerm(ElectiveTermCreate, BaseTimestamp):
    id: int
    status: TermStatus


# --------------------------------------------------------------------------- #
# ห้อง
# --------------------------------------------------------------------------- #


class ElectiveRoomBlock(ApiBaseModel):
    """คาบที่ห้องถูกใช้ไปแล้วด้วยเรื่องอื่น - reason คือข้อความที่ขึ้นในช่องนั้น"""

    slot: ElectiveSlot
    reason: str = Field(min_length=1, max_length=200)


class ElectiveRoomBase(ApiBaseModel):
    name: str = Field(min_length=1, max_length=100)
    building: str = Field(min_length=1, max_length=100)
    floor: str = Field(max_length=50)
    seats: int = Field(ge=1, le=2000)
    seats_is_estimated: bool = Field(
        False, description="true = ตัวเลขจากการสังเกต ระบบถือเป็นขอบล่างและแสดงเป็น ~40"
    )
    tier: RoomTier = RoomTier.NEEDS_APPROVAL
    is_active: bool = True


class ElectiveRoomWrite(ElectiveRoomBase):
    blocked_slots: list[ElectiveRoomBlock] = Field(default_factory=list)


class ElectiveRoom(ElectiveRoomBase, BaseTimestamp):
    id: int
    blocked_slots: list[ElectiveRoomBlock] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# วิชา
# --------------------------------------------------------------------------- #


class ElectivePerson(ApiBaseModel):
    """ผู้สอน/ผู้ประสานงานอย่างที่หน้าเว็บรู้จัก - อาจมีแค่ชื่อ

    หน้าจัดตารางกรอกชื่อวิทยากรจากอีเมลที่บริษัทส่งมา ไม่ได้เลือกจากรายชื่อ
    employees ที่มีอยู่ ถ้าหาไม่เจอในบริษัทนั้น service จะสร้างแถวใหม่ให้
    (relevant = elective, job_title = lecturer) แทนที่จะปฏิเสธทั้งวิชา
    """

    id: int | None = Field(None, description="ถ้ารู้ว่าเป็นใครใน employees ให้ส่ง id มาเลย")
    name: str | None = Field(None, max_length=200)
    email: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=100)


class ElectiveBase(ApiBaseModel):
    course_code: str = Field(min_length=1, max_length=50)
    section: int = Field(1, ge=1, le=99, description="ตอนเรียน")
    elective_name: str = Field(min_length=1, max_length=300)
    category: str = Field(max_length=100)
    delivery_mode: DeliveryMode = DeliveryMode.ON_SITE
    capacity: int = Field(ge=0, le=10000, description="จำนวนที่รับ ใช้เป็นเกณฑ์เลือกห้องด้วย")
    sessions_per_week: int = Field(1, ge=1, le=18)
    weeks: int = Field(10, ge=1, le=52)
    application_form_url: str | None = None
    course_syllabus_url: str | None = None
    notes: str | None = None


class ElectiveWrite(ElectiveBase):
    term_id: int | None = Field(None, description="ไม่ส่ง = เทอมที่กำลังจัดอยู่")
    company_id: int
    lecturer: ElectivePerson
    coordinator: ElectivePerson | None = None
    availability: list[ElectiveSlot] = Field(
        default_factory=list, description="คาบที่บริษัทแจ้งว่าสอนได้"
    )


class Elective(ElectiveBase, BaseTimestamp):
    """วิชาหนึ่งอย่างที่ตารางแสดง - ชื่อบริษัทและชื่อคนติดมาด้วย

    ไม่ได้สืบจาก CompanyName แม้จะมีสองช่องซ้ำกัน เพราะ `aliases` ที่ติดมากับ
    มันไม่มีความหมายในตารางเรียนและจะเป็น null ในทุกแถวตลอดไป
    """

    id: int
    term_id: int
    company_id: int
    company_th: str | None = None
    company_en: str | None = None
    lecturer_id: int
    lecturer_name: str | None = None
    coordinator_id: int | None = None
    coordinator_name: str | None = None
    availability: list[ElectiveSlot] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# ผลการจัด
# --------------------------------------------------------------------------- #


class ElectiveSessionWrite(ApiBaseModel):
    elective_id: int
    slot: ElectiveSlot
    room_id: int | None = Field(None, description="null = วิชาออนไลน์ หรือยังไม่ได้ห้อง")
    # ไม่ส่งมา = ใช้ขอบคาบ (เช้า 09:00-12:00) ซึ่งเป็นค่าที่ถูกในเกือบทุกครั้ง
    start_time: time | None = None
    end_time: time | None = None
    is_locked: bool = False
    source: SessionSource = SessionSource.MANUAL


class ElectiveSession(BaseTimestamp):
    id: int
    elective_id: int
    term_id: int
    slot: ElectiveSlot
    room_id: int | None
    start_time: time
    end_time: time
    is_locked: bool
    source: SessionSource


# --------------------------------------------------------------------------- #
# เช็กลิสต์งานเอกสาร
# --------------------------------------------------------------------------- #


class ElectiveChecklistUpdate(ApiBaseModel):
    """PATCH: ส่งมาเฉพาะช่องที่กด ช่องที่ไม่ได้ส่งคือช่องที่ไม่ได้แตะ

    ทั้งตารางเป็นช่องเล็ก ๆ ที่คนกดทีละช่อง การให้ส่งทั้งแถวกลับมาแปลว่า
    สองคนที่กดคนละช่องพร้อมกันจะลบงานของกันและกัน
    """

    invite_letter: ReceiptStatus | None = None
    instruction_letter: ReceiptStatus | None = None
    inform_lecturer: DoneStatus | None = None
    create_mcv: DoneStatus | None = None
    invite_mentor: DoneStatus | None = None
    invite_lecturer: DoneStatus | None = None
    invite_students: DoneStatus | None = None
    mcv_join_code: str | None = Field(None, max_length=100)


class ElectiveChecklist(BaseTimestamp):
    elective_id: int
    invite_letter: ReceiptStatus
    instruction_letter: ReceiptStatus
    inform_lecturer: DoneStatus
    create_mcv: DoneStatus
    invite_mentor: DoneStatus
    invite_lecturer: DoneStatus
    invite_students: DoneStatus
    mcv_join_code: str


# --------------------------------------------------------------------------- #
# ทั้งหน้าในหนึ่งคำตอบ
# --------------------------------------------------------------------------- #


class ElectivePlan(ApiBaseModel):
    """ทุกอย่างที่หน้า "จัดตารางวิชาเลือก" ต้องใช้ ในการอ่านครั้งเดียว

    หน้านี้ไม่มีโหมดที่แสดงวิชาโดยไม่มีห้อง หรือมีตารางโดยไม่มีเช็กลิสต์ -
    ผู้ใช้สลับแท็บไปมาระหว่างทั้งสามมุมของข้อมูลชุดเดียวกัน การแยกเป็น 5
    endpoint แปลว่าหน้าแรกต้องรอ 5 รอบ และมีโอกาสได้ภาพที่ไม่ตรงกันเอง
    """

    term: ElectiveTerm
    rooms: list[ElectiveRoom] = Field(default_factory=list)
    electives: list[Elective] = Field(default_factory=list)
    sessions: list[ElectiveSession] = Field(default_factory=list)
    checklists: list[ElectiveChecklist] = Field(default_factory=list)
