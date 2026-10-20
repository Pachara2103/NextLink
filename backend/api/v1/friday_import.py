"""Only assigned active staff may upload, review, or commit previews."""
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Path, UploadFile
from fastapi.responses import Response

from api.deps import friday_staff
from schemas.friday_import import ImportBatch, ImportCommit, ImportReview
from services import friday_import as service
from services.sessions import SessionIdentity

router = APIRouter(prefix="/friday-activities/imports", tags=["friday-import"])
RowId = Annotated[str, Path(pattern=r"^[1-9][0-9]{0,18}$", max_length=19)]


@router.get("/template.csv")
def template(user: SessionIdentity = Depends(friday_staff)):
    return Response(",".join(service.HEADERS) + "\r\n", media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="friday-activity-template.csv"'})


@router.post("/preview", response_model=ImportBatch, status_code=201)
def preview(file: UploadFile = File(...), year_convention: Literal["AD", "BE"] = Form(default="AD", alias="yearConvention"),
            user: SessionIdentity = Depends(friday_staff)):
    content = file.file.read(service.MAX_FILE_BYTES + 1)
    return service.preview_import(content, file.filename or "", year_convention, user.id)


@router.get("/{batch_id}", response_model=ImportBatch)
def get_batch(batch_id: UUID, user: SessionIdentity = Depends(friday_staff)):
    return service.get_import(str(batch_id))


@router.patch("/{batch_id}/rows/{row_id}", response_model=ImportBatch)
def review(batch_id: UUID, row_id: RowId, payload: ImportReview, user: SessionIdentity = Depends(friday_staff)):
    return service.review_import_row(str(batch_id), row_id, payload, user.id)


@router.post("/{batch_id}/commit", response_model=ImportBatch)
def commit(batch_id: UUID, payload: ImportCommit, user: SessionIdentity = Depends(friday_staff)):
    return service.commit_import(str(batch_id), payload, user.id)
