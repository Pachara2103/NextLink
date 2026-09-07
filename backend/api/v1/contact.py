from fastapi import APIRouter, Depends, Query

from api.deps import current_user
from schemas.base import ListResponse, StatusResponse
from schemas.contact import Contact, ContactCreate, ContactUpdate
from schemas.user import AuthUser
from services.contact import (
    create_contact,
    delete_contact,
    get_contacts,
    update_contact,
)

router = APIRouter(prefix="/contacts", tags=["contact"])


@router.get("", response_model=ListResponse[Contact])
def get_contacts_api(
    company_id: int | None = Query(
        None, alias="companyId", description="กรองเฉพาะผู้ติดต่อของบริษัทนี้"
    ),
    user: AuthUser = Depends(current_user),
):
    return get_contacts(company_id)


# The created row goes back rather than a bare status: the client needs the id
# and the server-side defaults (status, timestamps) to render the new card, and
# a second GET for one row it just wrote would be a wasted trip.
@router.post("", response_model=Contact)
def create_contact_api(payload: ContactCreate, user: AuthUser = Depends(current_user)):
    return create_contact(payload)


@router.put("/{id}", response_model=Contact)
def update_contact_api(
    payload: ContactUpdate, id: int, user: AuthUser = Depends(current_user)
):
    return update_contact(id, payload)


@router.delete("/{id}", response_model=StatusResponse)
def delete_contact_api(id: int, user: AuthUser = Depends(current_user)):
    delete_contact(id)
    return StatusResponse()
