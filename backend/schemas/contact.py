from pydantic import Field
from schemas.api import ApiBaseModel
from schemas.base import BaseTimestamp
from schemas.enums import ContactRole, ContactStatus


class ContactBase(ApiBaseModel):
    name: str 
    role: ContactRole 
    nickname: str | None
    phone: str | None = Field(None, description="เบอร์โทรศัพท์")
    email: str | None = Field(None, description="อีเมล")

class ContactCreate(ContactBase):
    company_id: int

class ContactUpdate(ContactBase):
    status: ContactStatus

class Contact(ContactBase, BaseTimestamp):
    id: int
    company_id: int
    status: ContactStatus
