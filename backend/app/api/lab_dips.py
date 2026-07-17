from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from app.db.session import get_async_db
from app.models.lab_dip import LabDipRequest, LabDipItem, LabDipLine
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


def _load_full(request_id):
    """Query loading a request with its items→dips and any ungrouped dips."""
    return (
        select(LabDipRequest)
        .options(
            joinedload(LabDipRequest.items).joinedload(LabDipItem.dips),
            joinedload(LabDipRequest.dips),
        )
        .filter(LabDipRequest.id == request_id)
    )


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

    # Per-item groups, each with its own dips.
    for gi, group in enumerate(payload.items):
        item = LabDipItem(lab_dip_request_id=req.id, item_id=group.item_id, order=gi)
        db.add(item)
        await db.flush()
        for i, dip in enumerate(group.dips):
            if dip.color_name.strip():
                db.add(LabDipLine(
                    lab_dip_request_id=req.id,
                    lab_dip_item_id=item.id,
                    color_name=dip.color_name.strip(),
                    color_id=dip.color_id,
                    submission_round=dip.submission_round,
                    recipe_ref=dip.recipe_ref,
                    order=i,
                ))

    # Legacy/ungrouped dips sent at the request level (no item).
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

    result = await db.execute(_load_full(req.id))
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
        .options(
            joinedload(LabDipRequest.items).joinedload(LabDipItem.dips),
            joinedload(LabDipRequest.dips),
        )
        .order_by(LabDipRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.unique().scalars().all()


@router.put("/lab-dips/{request_id}", response_model=LabDipRequestResponse)
async def update_lab_dip_request(
    request_id: str,
    payload: LabDipRequestUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(_load_full(request_id))
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

    # Diff items and their dips. Keep existing rows by id so dip statuses
    # (e.g. APPROVED) survive edits; delete rows dropped from the payload.
    existing_items = {str(it.id): it for it in req.items}
    existing_lines = {str(l.id): l for l in req.dips}

    incoming_item_ids = {str(g.id) for g in payload.items if g.id is not None}
    incoming_line_ids = {
        str(d.id)
        for g in payload.items for d in g.dips if d.id is not None
    } | {str(d.id) for d in payload.dips if d.id is not None}

    # Delete removed lines first (FK points at items), then removed items.
    for lid, line in existing_lines.items():
        if lid not in incoming_line_ids:
            await db.delete(line)
    for iid, item in existing_items.items():
        if iid not in incoming_item_ids:
            await db.delete(item)

    def _upsert_line(dip, order, item_id):
        if dip.id is not None and str(dip.id) in existing_lines:
            line = existing_lines[str(dip.id)]
            line.color_name = dip.color_name.strip()
            line.color_id = dip.color_id
            line.submission_round = dip.submission_round
            line.recipe_ref = dip.recipe_ref
            line.order = order
            line.lab_dip_item_id = item_id
        else:
            db.add(LabDipLine(
                lab_dip_request_id=req.id,
                lab_dip_item_id=item_id,
                color_name=dip.color_name.strip(),
                color_id=dip.color_id,
                submission_round=dip.submission_round,
                recipe_ref=dip.recipe_ref,
                order=order,
            ))

    for gi, group in enumerate(payload.items):
        if group.id is not None and str(group.id) in existing_items:
            item = existing_items[str(group.id)]
            item.item_id = group.item_id
            item.order = gi
        else:
            item = LabDipItem(lab_dip_request_id=req.id, item_id=group.item_id, order=gi)
            db.add(item)
            await db.flush()
        for i, dip in enumerate(group.dips):
            if dip.color_name.strip():
                _upsert_line(dip, i, item.id)

    # Legacy/ungrouped dips (no item).
    for i, dip in enumerate(payload.dips):
        if dip.color_name.strip():
            _upsert_line(dip, i, None)

    await db.commit()

    # expire_on_commit=False keeps the pre-mutation items/dips collections cached on
    # the identity-mapped instance; expire so the reload reflects the diffed state.
    db.expire_all()
    result = await db.execute(_load_full(request_id))
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
