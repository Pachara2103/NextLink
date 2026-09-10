"""เครื่องมือดูแลความตรงกันของ postgres กับ neo4j

สามอย่างที่ทำได้จากที่นี่:
- ดูว่ามีงานเขียนกราฟค้างอยู่ไหม และค้างเพราะอะไร  (GET  /admin/graph/outbox)
- สั่งทำงานที่ค้างเดี๋ยวนี้ ไม่ต้องรอรอบถัดไป        (POST /admin/graph/replay)
- เทียบสองฐานว่าตรงกันไหม และสั่งซ่อม               (POST /admin/graph/reconcile)

ต้องล็อกอิน (Depends(current_user)) เหมือนทุก endpoint ที่แตะข้อมูล
"""

from fastapi import APIRouter, Depends

from api.deps import current_user
from schemas.user import AuthUser
from services import outbox
from services.reconcile import reconcile

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/graph/outbox")
def outbox_status_api(user: AuthUser = Depends(current_user)):
    """งานเขียนกราฟที่ยังค้าง - ค่าปกติคือ pending = 0"""
    return outbox.pending_summary()


@router.post("/graph/replay")
def outbox_replay_api(limit: int = 200, user: AuthUser = Depends(current_user)):
    """ทำงานที่ค้างทั้งหมดเดี๋ยวนี้ (worker เบื้องหลังก็ทำให้อยู่แล้วทุก ๆ รอบ)"""
    return outbox.replay_pending(limit=limit)


@router.post("/graph/reconcile")
def reconcile_api(apply: bool = False, user: AuthUser = Depends(current_user)):
    """เทียบ pg กับ neo4j

    `apply=false` (ค่าเริ่มต้น) = รายงานอย่างเดียว ไม่แตะอะไร
    `apply=true`  = ซ่อมให้ตรงกับ postgres โดยส่งงานผ่าน outbox ตามทางเดินปกติ
    """
    return reconcile(apply=apply)
