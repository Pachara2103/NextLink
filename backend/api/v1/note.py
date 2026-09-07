from fastapi import APIRouter, Depends

from api.deps import current_user
from schemas.base import ListResponse, StatusResponse
from schemas.note import Note, NoteCreate
from schemas.user import AuthUser
from services.note import get_notes, sync_create_note, sync_update_note, sync_delete_note

router = APIRouter(prefix="/notes", tags=["note"])

@router.get("", response_model=ListResponse[Note])
def get_notes_api(user: AuthUser = Depends(current_user)):
    return get_notes()


@router.post("", response_model=StatusResponse)
def create_note_api(payload: NoteCreate, user: AuthUser = Depends(current_user)):
    sync_create_note(payload)
    return StatusResponse()


@router.put("/{id}", response_model=StatusResponse)
def update_note_api(payload: NoteCreate, id: int, user: AuthUser = Depends(current_user)):
    sync_update_note(id, payload)
    return StatusResponse()


@router.delete("/{id}", response_model=StatusResponse)
def delete_note_api(id: int, user: AuthUser = Depends(current_user)):
    sync_delete_note(id)
    return StatusResponse()
