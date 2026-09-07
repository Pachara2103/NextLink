from pydantic import Field

from schemas.api import ApiBaseModel
from schemas.base import BaseTimestamp
from schemas.enums import ContactRole, ContactStatus


class ContactBase(ApiBaseModel):
    """The fields a human types into the form.

    `name` and `role` are the two the table declares NOT NULL, so they are the
    two without a default here — everything else is genuinely optional and
    stores as NULL when it is left blank.
    """

    name: str = Field(description="ชื่อผู้ติดต่อ")
    nickname: str | None = Field(None, description="ชื่อเล่น")
    role: ContactRole = Field(
        ContactRole.INSTRUCTOR, description="ความเกี่ยวข้องของผู้ติดต่อกับภาควิชา"
    )
    phone: str | None = Field(None, description="เบอร์โทรศัพท์")
    email: str | None = Field(None, description="อีเมล")


class ContactCreate(ContactBase):
    """Body of `POST /contacts`.

    status is deliberately absent: a contact that has just been added is active
    by definition, and the column defaults to it — offering the choice at create
    time would only invite someone to file a resigned contact.
    """

    company_id: int = Field(description="บริษัทที่ผู้ติดต่อคนนี้สังกัด")


class ContactUpdate(ContactBase):
    """Body of `PUT /contacts/{id}`.

    company_id is not here on purpose: moving a contact to another company is a
    different operation from correcting their details, and this route is the
    latter. status is, because whether someone still works there is exactly the
    thing that changes over time.
    """

    status: ContactStatus = Field(
        ContactStatus.ACTIVE, description="สถานะของผู้ติดต่อในบริษัทนี้"
    )


class Contact(ContactBase, BaseTimestamp):
    """One row of `contacts` as the API returns it."""

    id: int
    company_id: int
    status: ContactStatus
