"""/api/v1/electives - หน้า "จัดตารางวิชาเลือก"

จัดกลุ่มตามสิ่งที่คนกดบนหน้าจอ ไม่ใช่ตามตาราง: ช่วงที่สะดวกกับเช็กลิสต์เป็น
ของที่ถูกกดทีละช่องในตารางของมันเอง จึงมี endpoint ของตัวเอง แทนที่จะให้ส่ง
ทั้งวิชากลับมาเพื่อเปลี่ยนช่องเดียว
"""

from fastapi import APIRouter, Depends, Query

from api.deps import current_user
from schemas.base import ListResponse, StatusResponse
from schemas.elective import (
    Elective,
    ElectiveChecklist,
    ElectiveChecklistUpdate,
    ElectivePlan,
    ElectiveRoom,
    ElectiveRoomBlock,
    ElectiveRoomWrite,
    ElectiveSession,
    ElectiveSessionWrite,
    ElectiveTerm,
    ElectiveTermCreate,
    ElectiveWrite,
)
from schemas.enums import ElectiveSlot
from schemas.user import AuthUser
from services.elective import (
    archive_term,
    create_elective,
    create_room,
    create_term,
    delete_elective,
    delete_room,
    delete_session,
    get_checklist,
    get_current_term,
    get_elective,
    get_plan,
    list_electives,
    list_rooms,
    list_terms,
    place_session,
    replace_sessions,
    set_availability,
    set_room_blocks,
    update_checklist,
    update_elective,
    update_room,
    update_session,
)

router = APIRouter(prefix="/electives", tags=["elective"])

# --------------------------------------------------------------------------- #
# ชื่อ query parameter เป็น camelCase เหมือนทุกฟิลด์ใน body และ response
#
# ตัวอื่นในไฟล์นี้แปลงให้เองด้วย ApiBaseModel (alias_generator=to_camel) แต่
# query parameter เป็นอาร์กิวเมนต์ของฟังก์ชัน FastAPI จึงใช้ชื่อ python ตรง ๆ
# ถ้าไม่ตั้ง alias
#
# ต้องตั้ง เพราะ FastAPI **ไม่ฟ้อง** query ที่ไม่รู้จัก: หน้าเว็บส่ง ?termId=1
# มา แล้ว term_id เป็น None เงียบ ๆ /plan จึงตอบ "เทอมที่กำลังจัด" กลับไปทุก
# ครั้งที่ถูกถามถึงเทอมที่ปิดไปแล้ว - หน้ารายวิชาเอาข้อมูลเทอมปัจจุบันไปแสดง
# ใต้ชื่อเทอมเก่าโดยไม่มีอะไรพัง
# --------------------------------------------------------------------------- #
TermIdQuery = Query(None, alias="termId", description="ไม่ส่ง = เทอมที่กำลังจัดอยู่")


# --------------------------------------------------------------------------- #
# ทั้งหน้าในครั้งเดียว
# --------------------------------------------------------------------------- #

@router.get("/plan", response_model=ElectivePlan)
def get_plan_api(
    term_id: int | None = TermIdQuery,
    user: AuthUser = Depends(current_user),
):
    return get_plan(term_id)


# --------------------------------------------------------------------------- #
# เทอม
# --------------------------------------------------------------------------- #

@router.get("/terms", response_model=ListResponse[ElectiveTerm])
def list_terms_api(user: AuthUser = Depends(current_user)):
    return list_terms()


@router.get("/terms/current", response_model=ElectiveTerm)
def get_current_term_api(user: AuthUser = Depends(current_user)):
    return get_current_term()


@router.post("/terms", response_model=ElectiveTerm)
def create_term_api(payload: ElectiveTermCreate, user: AuthUser = Depends(current_user)):
    """เปิดเทอมใหม่ - เทอมที่กำลังจัดอยู่จะถูกปิดไปพร้อมกัน"""
    return create_term(payload)


@router.post("/terms/{id}/archive", response_model=ElectiveTerm)
def archive_term_api(id: int, user: AuthUser = Depends(current_user)):
    return archive_term(id)


# --------------------------------------------------------------------------- #
# ห้อง
# --------------------------------------------------------------------------- #

@router.get("/rooms", response_model=ListResponse[ElectiveRoom])
def list_rooms_api(
    include_inactive: bool = Query(False, alias="includeInactive"),
    user: AuthUser = Depends(current_user),
):
    return list_rooms(include_inactive)


@router.post("/rooms", response_model=ElectiveRoom)
def create_room_api(payload: ElectiveRoomWrite, user: AuthUser = Depends(current_user)):
    return create_room(payload)


@router.put("/rooms/{id}", response_model=ElectiveRoom)
def update_room_api(id: int, payload: ElectiveRoomWrite, user: AuthUser = Depends(current_user)):
    return update_room(id, payload)


@router.put("/rooms/{id}/blocks", response_model=ElectiveRoom)
def set_room_blocks_api(
    id: int, payload: list[ElectiveRoomBlock], user: AuthUser = Depends(current_user)
):
    return set_room_blocks(id, payload)


@router.delete("/rooms/{id}", response_model=StatusResponse)
def delete_room_api(id: int, user: AuthUser = Depends(current_user)):
    delete_room(id)
    return StatusResponse()


# --------------------------------------------------------------------------- #
# ผลการจัด
#
# ประกาศก่อน /{id} เพราะ FastAPI จับ route ตามลำดับ - "sessions" จะถูกอ่านเป็น
# id ของวิชาถ้าอยู่ทีหลัง
# --------------------------------------------------------------------------- #

@router.post("/sessions", response_model=ElectiveSession)
def place_session_api(payload: ElectiveSessionWrite, user: AuthUser = Depends(current_user)):
    return place_session(payload)


@router.put("/sessions/{id}", response_model=ElectiveSession)
def update_session_api(
    id: int, payload: ElectiveSessionWrite, user: AuthUser = Depends(current_user)
):
    return update_session(id, payload)


@router.delete("/sessions/{id}", response_model=StatusResponse)
def delete_session_api(id: int, user: AuthUser = Depends(current_user)):
    delete_session(id)
    return StatusResponse()


@router.put("/sessions", response_model=ListResponse[ElectiveSession])
def replace_sessions_api(
    payload: list[ElectiveSessionWrite],
    term_id: int | None = TermIdQuery,
    user: AuthUser = Depends(current_user),
):
    """ผลของปุ่ม "จัดตารางใหม่" - คาบที่ล็อกไว้ไม่ถูกแตะ"""
    return replace_sessions(term_id, payload)


# --------------------------------------------------------------------------- #
# วิชา
# --------------------------------------------------------------------------- #

@router.get("", response_model=ListResponse[Elective])
def list_electives_api(
    term_id: int | None = TermIdQuery,
    user: AuthUser = Depends(current_user),
):
    return list_electives(term_id)


@router.post("", response_model=Elective)
def create_elective_api(payload: ElectiveWrite, user: AuthUser = Depends(current_user)):
    return create_elective(payload, user.id)


@router.get("/{id}", response_model=Elective)
def get_elective_api(id: int, user: AuthUser = Depends(current_user)):
    return get_elective(id)


@router.put("/{id}", response_model=Elective)
def update_elective_api(id: int, payload: ElectiveWrite, user: AuthUser = Depends(current_user)):
    return update_elective(id, payload, user.id)


@router.delete("/{id}", response_model=StatusResponse)
def delete_elective_api(id: int, user: AuthUser = Depends(current_user)):
    delete_elective(id)
    return StatusResponse()


@router.put("/{id}/availability", response_model=Elective)
def set_availability_api(
    id: int, payload: list[ElectiveSlot], user: AuthUser = Depends(current_user)
):
    return set_availability(id, payload)


# --------------------------------------------------------------------------- #
# เช็กลิสต์งานเอกสาร
# --------------------------------------------------------------------------- #

@router.get("/{id}/checklist", response_model=ElectiveChecklist)
def get_checklist_api(id: int, user: AuthUser = Depends(current_user)):
    return get_checklist(id)


@router.patch("/{id}/checklist", response_model=ElectiveChecklist)
def update_checklist_api(
    id: int, payload: ElectiveChecklistUpdate, user: AuthUser = Depends(current_user)
):
    return update_checklist(id, payload)
