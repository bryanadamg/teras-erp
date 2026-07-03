from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from app.db.session import get_async_db
from app.models.lab_dip import LabDipRequest, LabDipLine
from app.schemas import (
    LabDipRequestCreate, LabDipRequestUpdate, LabDipRequestResponse, LabDipLineResponse,
)
from app.models.auth import User
from app.api.auth import get_current_user, require_permission
from app.services import audit_service
from datetime import datetime, date

router = APIRouter()


def _parse_date(value, default=None):
    return date.fromisoformat(value) if value else default


@router.post("/lab-dips", response_model=LabDipRequestResponse)
async def create_lab_dip_request(
    payload: LabDipRequestCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    count_result = await db.execute(select(func.count()).select_from(LabDipRequest))
    count = count_result.scalar_one()
    code = f"LD-{datetime.now().year}-{str(count + 1).zfill(5)}"

    now = datetime.utcnow()
    req = LabDipRequest(
        code=code,
        customer_id=payload.customer_id,
        base_item_id=payload.base_item_id,
        approved_recipe_id=payload.approved_recipe_id,
        color_id=payload.color_id,
        request_date=_parse_date(payload.request_date, date.today()),
        season=payload.season,
        customer_article_code=payload.customer_article_code,
        internal_article_code=payload.internal_article_code,
        substrate=payload.substrate,
        color_standard=payload.color_standard,
        request_type=payload.request_type,
        due_date=_parse_date(payload.due_date),
        estimated_completion_date=_parse_date(payload.estimated_completion_date),
        notes=payload.notes,
        status="DRAFT",
        updated_at=now,
    )
    db.add(req)
    await db.flush()

    for i, dip in enumerate(payload.dips):
        if dip.color_name.strip():
            db.add(LabDipLine(
                lab_dip_request_id=req.id,
                color_name=dip.color_name.strip(),
                color_id=dip.color_id,
                submission_round=dip.submission_round,
                recipe_ref=dip.recipe_ref,
                order=i,
            ))

    await db.commit()

    result = await db.execute(
        select(LabDipRequest).options(joinedload(LabDipRequest.dips)).filter(LabDipRequest.id == req.id)
    )
    req = result.unique().scalars().first()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="LabDipRequest",
        entity_id=str(req.id),
        details=f"Created Lab Dip Request {req.code}",
        changes={"code": req.code, "color_standard": req.color_standard},
    )
    return req


@router.get("/lab-dips", response_model=list[LabDipRequestResponse])
async def get_lab_dips(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LabDipRequest)
        .options(joinedload(LabDipRequest.dips))
        .order_by(LabDipRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.unique().scalars().all()


@router.get("/lab-dips/{request_id}", response_model=LabDipRequestResponse)
async def get_lab_dip(
    request_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LabDipRequest).options(joinedload(LabDipRequest.dips)).filter(LabDipRequest.id == request_id)
    )
    req = result.unique().scalars().first()
    if not req:
        raise HTTPException(status_code=404, detail="Lab dip request not found")
    return req


@router.put("/lab-dips/{request_id}", response_model=LabDipRequestResponse)
async def update_lab_dip_request(
    request_id: str,
    payload: LabDipRequestUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(LabDipRequest).options(joinedload(LabDipRequest.dips)).filter(LabDipRequest.id == request_id)
    )
    req = result.unique().scalars().first()
    if not req:
        raise HTTPException(status_code=404, detail="Lab dip request not found")

    req.customer_id = payload.customer_id
    req.base_item_id = payload.base_item_id
    req.approved_recipe_id = payload.approved_recipe_id
    req.color_id = payload.color_id
    req.request_date = _parse_date(payload.request_date, date.today())
    req.season = payload.season
    req.customer_article_code = payload.customer_article_code
    req.internal_article_code = payload.internal_article_code
    req.substrate = payload.substrate
    req.color_standard = payload.color_standard
    req.request_type = payload.request_type
    req.due_date = _parse_date(payload.due_date)
    req.estimated_completion_date = _parse_date(payload.estimated_completion_date)
    req.notes = payload.notes
    req.updated_at = datetime.utcnow()

    # Dips diff: keep existing ids, delete removed, update kept, insert new
    incoming_ids = {str(d.id) for d in payload.dips if d.id is not None}
    for existing in list(req.dips):
        if str(existing.id) not in incoming_ids:
            await db.delete(existing)

    for i, dip in enumerate(payload.dips):
        if not dip.color_name.strip():
            continue
        if dip.id is not None:
            line_result = await db.execute(select(LabDipLine).filter(LabDipLine.id == dip.id))
            existing = line_result.scalars().first()
            if existing:
                existing.color_name = dip.color_name.strip()
                existing.color_id = dip.color_id
                existing.submission_round = dip.submission_round
                existing.recipe_ref = dip.recipe_ref
                existing.order = i
        else:
            db.add(LabDipLine(
                lab_dip_request_id=req.id,
                color_name=dip.color_name.strip(),
                color_id=dip.color_id,
                submission_round=dip.submission_round,
                recipe_ref=dip.recipe_ref,
                order=i,
            ))

    await db.commit()

    result = await db.execute(
        select(LabDipRequest).options(joinedload(LabDipRequest.dips)).filter(LabDipRequest.id == request_id)
    )
    req = result.unique().scalars().first()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="LabDipRequest",
        entity_id=request_id,
        details=f"Updated Lab Dip Request {req.code}",
        changes={"color_standard": req.color_standard},
    )
    return req


@router.put("/lab-dips/{request_id}/status")
async def update_lab_dip_status(
    request_id: str,
    status: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(select(LabDipRequest).filter(LabDipRequest.id == request_id))
    req = result.scalars().first()
    if not req:
        raise HTTPException(status_code=404, detail="Lab dip request not found")

    valid_statuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    previous_status = req.status
    req.status = status
    req.updated_at = datetime.utcnow()
    await db.commit()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE_STATUS",
        entity_type="LabDipRequest",
        entity_id=request_id,
        details=f"Updated Lab Dip {req.code} status from {previous_status} to {status}",
        changes={"status": status, "previous_status": previous_status},
    )
    return {"status": "success", "message": f"Lab dip request updated to {status}"}


@router.put("/lab-dips/{request_id}/dips/{line_id}/status", response_model=LabDipLineResponse)
async def update_dip_status(
    request_id: str,
    line_id: str,
    status: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(LabDipLine).filter(LabDipLine.id == line_id, LabDipLine.lab_dip_request_id == request_id)
    )
    line = result.scalars().first()
    if not line:
        raise HTTPException(status_code=404, detail="Dip not found")

    valid_statuses = ["PENDING", "APPROVED", "REJECTED", "RESUBMIT"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    if line.status == "APPROVED":
        raise HTTPException(status_code=400, detail="Approved dip status cannot be changed")

    previous_status = line.status
    line.status = status

    parent_result = await db.execute(select(LabDipRequest).filter(LabDipRequest.id == request_id))
    parent = parent_result.scalars().first()
    if parent:
        parent.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(line)

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE_DIP_STATUS",
        entity_type="LabDipLine",
        entity_id=line_id,
        details=f"Updated dip '{line.color_name}' status from {previous_status} to {status}",
        changes={"status": status, "previous_status": previous_status},
    )
    return line


@router.delete("/lab-dips/{request_id}")
async def delete_lab_dip_request(
    request_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(select(LabDipRequest).filter(LabDipRequest.id == request_id))
    req = result.scalars().first()
    if not req:
        raise HTTPException(status_code=404, detail="Lab dip request not found")

    code = req.code
    await db.delete(req)
    await db.commit()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="LabDipRequest",
        entity_id=request_id,
        details=f"Deleted Lab Dip Request {code}",
        changes={"code": code},
    )
    return {"status": "success"}
