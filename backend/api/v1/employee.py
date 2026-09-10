from fastapi import APIRouter, Depends

from api.deps import current_user
from schemas.employee import Employee, EmployeeBase
from schemas.base import ListResponse, StatusResponse
from schemas.user import AuthUser
from services.employee import (
    get_employees,
    approve_employee,
    delete_employee_pg,
    update_employee_pg,
    sync_update_employee,
    sync_create_employee,
    sync_delete_employee,
)

router = APIRouter(prefix="/employees", tags=["employee"])

@router.get("", response_model=ListResponse[Employee])
def get_employees_api(user: AuthUser = Depends(current_user)):
    return get_employees()

@router.post("/{id}/approve", response_model=StatusResponse)
def approve_employee_api(id: int, user: AuthUser = Depends(current_user)):
    approve_employee(id, user.id)
    return StatusResponse()

@router.post("", response_model=StatusResponse)
def sync_create_employee_api(payload: EmployeeBase, user: AuthUser = Depends(current_user)):
    sync_create_employee(payload, user.id)
    return StatusResponse()

@router.delete("/{id}", response_model=StatusResponse)
def decline_employee_api(id: int, user: AuthUser = Depends(current_user)):
    """ปฏิเสธแถวที่ยัง pending - ลบใน Postgres เท่านั้น

    แถวที่ยัง pending ยังไม่มี node ใน graph จึงไม่มีอะไรต้องลบอีกฝั่ง
    ถ้าจะลบคนที่อนุมัติแล้วให้ใช้ DELETE /{id}/sync
    """
    delete_employee_pg(id)
    return StatusResponse()

@router.put("/{id}", response_model=StatusResponse)
def update_employee_pg_api(payload: EmployeeBase, id: int, user: AuthUser = Depends(current_user)):
    update_employee_pg(payload, id=id, user_id=user.id)
    return StatusResponse()

@router.put("/{id}/sync", response_model=StatusResponse)
def sync_update_employee_api(payload: EmployeeBase, id: int, user: AuthUser = Depends(current_user)):
    sync_update_employee(payload, id=id, user_id=user.id)
    return StatusResponse()

@router.delete("/{id}/sync", response_model=StatusResponse)
def sync_delete_employee_api(id: int, user: AuthUser = Depends(current_user)):
    """ลบคนที่อนุมัติแล้ว - ลบทั้ง Postgres และ Neo4j ใน transaction เดียว

    sync_delete_employee มีอยู่ใน services แล้วแต่ยังไม่มี route มาก่อน
    หน้า ผู้ติดต่อและบุคคลในบริษัท ต้องใช้ตรงนี้: คนที่อนุมัติแล้วมี node
    อยู่ใน graph ถ้าลบด้วย DELETE /{id} เฉย ๆ graph จะเหลือ node ค้างที่
    ฐานข้อมูลหลักไม่มีแล้ว
    """
    sync_delete_employee(id)
    return StatusResponse()

