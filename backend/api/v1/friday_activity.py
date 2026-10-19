"""Assigned staff API for the shared Friday activity database."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from api.deps import friday_staff
from schemas.friday_activity import (
    ActivityStatus, FridayActivity, FridayActivityCreate, FridayActivityList,
    FridayActivityUpdate, FridayHistory, FridayOptions, FridayTransition, Term,
)
from schemas.friday_followup import FollowupResult, NoteList, NoteVersionList, NoteWrite, TaskList, TaskWrite
from services import friday_followup as followup
from services import friday_activity as service
from services.sessions import SessionIdentity

router = APIRouter(prefix="/friday-activities", tags=["friday-activity"])
ActivityId = Annotated[str, Path(pattern=r"^[1-9][0-9]{0,18}$", max_length=19)]


@router.get("", response_model=FridayActivityList)
def list_activities(
    user: SessionIdentity = Depends(friday_staff),
    academic_year: int | None = Query(default=None, alias="academicYear", ge=2000, le=2100),
    term: Term | None = None,
    status: ActivityStatus | None = None,
    company_id: str | None = Query(default=None, alias="companyId", pattern=r"^[1-9][0-9]{0,18}$"),
    search: str | None = Query(default=None, max_length=500),
    page: int = Query(default=1, ge=1, le=2147483647),
    page_size: int = Query(default=25, alias="pageSize", ge=1, le=100),
):
    return service.list_activities(academic_year=academic_year,term=term,status=status,
        company_id=company_id,search=search,page=page,page_size=page_size)


@router.get("/options", response_model=FridayOptions)
def options(user: SessionIdentity = Depends(friday_staff)):
    return service.get_options()


@router.post("", response_model=FridayActivity, status_code=201)
def create_activity(payload: FridayActivityCreate, user: SessionIdentity = Depends(friday_staff)):
    return service.create_activity(payload,user.id)


@router.get("/{activity_id}", response_model=FridayActivity)
def get_activity(activity_id: ActivityId, user: SessionIdentity = Depends(friday_staff)):
    return service.get_activity(activity_id)


@router.put("/{activity_id}", response_model=FridayActivity)
def update_activity(activity_id: ActivityId, payload: FridayActivityUpdate, user: SessionIdentity = Depends(friday_staff)):
    return service.update_activity(activity_id,payload,user.id)


@router.post("/{activity_id}/transitions", response_model=FridayActivity)
def transition_activity(activity_id: ActivityId, payload: FridayTransition, user: SessionIdentity = Depends(friday_staff)):
    return service.transition_activity(activity_id,payload,user.id)


@router.get("/{activity_id}/history", response_model=FridayHistory)
def history(activity_id: ActivityId, user: SessionIdentity = Depends(friday_staff),
    before_id: str | None = Query(default=None, alias="beforeId", pattern=r"^[1-9][0-9]{0,18}$"),
    limit: int = Query(default=50, ge=1, le=100)):
    return service.get_history(activity_id,before_id,limit)


@router.get("/{activity_id}/notes", response_model=NoteList)
def notes(activity_id: ActivityId, user: SessionIdentity = Depends(friday_staff),
    before_id: str | None = Query(default=None, alias="beforeId", pattern=r"^[1-9][0-9]{0,18}$"),
    limit: int = Query(default=50, ge=1, le=100)):
    return followup.list_items(activity_id,"note",before_id,limit)


@router.post("/{activity_id}/notes", response_model=FollowupResult, status_code=201)
def create_note(activity_id: ActivityId, payload: NoteWrite, user: SessionIdentity = Depends(friday_staff)):
    return followup.write_item(activity_id,"note",payload,user.id)


@router.put("/{activity_id}/notes/{note_id}", response_model=FollowupResult)
def update_note(activity_id: ActivityId, note_id: ActivityId, payload: NoteWrite, user: SessionIdentity = Depends(friday_staff)):
    return followup.write_item(activity_id,"note",payload,user.id,note_id)


@router.get("/{activity_id}/notes/{note_id}", response_model=FollowupResult)
def get_note(activity_id: ActivityId, note_id: ActivityId, user: SessionIdentity = Depends(friday_staff)):
    return followup.get_item(activity_id,"note",note_id)


@router.get("/{activity_id}/notes/{note_id}/versions", response_model=NoteVersionList)
def note_versions(activity_id: ActivityId, note_id: ActivityId, user: SessionIdentity = Depends(friday_staff),
    before_version: int | None = Query(default=None, alias="beforeVersion", ge=1, le=2147483647),
    limit: int = Query(default=50, ge=1, le=100)):
    return followup.note_versions(activity_id,note_id,before_version,limit)


@router.get("/{activity_id}/tasks", response_model=TaskList)
def tasks(activity_id: ActivityId, user: SessionIdentity = Depends(friday_staff),
    before_id: str | None = Query(default=None, alias="beforeId", pattern=r"^[1-9][0-9]{0,18}$"),
    limit: int = Query(default=50, ge=1, le=100)):
    return followup.list_items(activity_id,"task",before_id,limit)


@router.post("/{activity_id}/tasks", response_model=FollowupResult, status_code=201)
def create_task(activity_id: ActivityId, payload: TaskWrite, user: SessionIdentity = Depends(friday_staff)):
    return followup.write_item(activity_id,"task",payload,user.id)


@router.put("/{activity_id}/tasks/{task_id}", response_model=FollowupResult)
def update_task(activity_id: ActivityId, task_id: ActivityId, payload: TaskWrite, user: SessionIdentity = Depends(friday_staff)):
    return followup.write_item(activity_id,"task",payload,user.id,task_id)


@router.get("/{activity_id}/tasks/{task_id}", response_model=FollowupResult)
def get_task(activity_id: ActivityId, task_id: ActivityId, user: SessionIdentity = Depends(friday_staff)):
    return followup.get_item(activity_id,"task",task_id)
