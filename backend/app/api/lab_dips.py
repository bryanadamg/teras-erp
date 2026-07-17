from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import joinedload
from app.db.session import get_async_db
from app.models.lab_dip import LabDipRequest, LabDipItem, LabDipLine
from app.models.color import Color
from app.models.attribute import Attribute, AttributeValue
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
            joinedload(LabDipRequest.items).joinedload(LabDipItem.item),
            joinedload(LabDipRequest.dips),
        )
        .filter(LabDipRequest.id == request_id)
    )


def _variant_letter(seq: int) -> str:
    """0 → A, 1 → B, … 25 → Z, 26 → AA (spreadsheet-column style)."""
    s = ""
    n = seq + 1
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _decorate(req: LabDipRequest) -> LabDipRequest:
    """Attach the derived variant_code (e.g. '00001-A') and denormalized item name/code."""
    seq_part = req.code.rsplit("-", 1)[-1] if req.code else ""
    for it in (req.items or []):
        it.variant_code = f"{seq_part}-{_variant_letter(it.variant_seq)}"
        # Full approved code appends the free-text "set" captured at approval.
        it.approved_color_code = f"{it.variant_code}-{it.approved_set}" if it.approved_set else None
        it.item_code = it.item.code if it.item else None
        it.item_name = it.item.name if it.item else None
    return req


async def _next_code(db: AsyncSession) -> str:
    """Mint the next request code from a persistent DB sequence.

    A plain COUNT(*)+1 (or max+1) frees a number when a request is deleted, so a
    later create can reuse it — colliding with the UNIQUE constraint (deleting a
    middle row) or silently reissuing an old item code (deleting the top row).
    `lab_dip_request_seq` only ever advances, so a number is never handed out
    twice regardless of deletions, and nextval is atomic under concurrency.
    """
    result = await db.execute(text("SELECT nextval('lab_dip_request_seq')"))
    n = result.scalar_one()
    return f"LD-{datetime.now().year}-{str(n).zfill(5)}"


@router.post("/lab-dips", response_model=LabDipRequestResponse)
async def create_lab_dip_request(
    payload: LabDipRequestCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    code = await _next_code(db)

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

    # Per-item groups, each with its own dips. New request → variant_seq == position.
    for gi, group in enumerate(payload.items):
        item = LabDipItem(lab_dip_request_id=req.id, item_id=group.item_id, order=gi, variant_seq=gi)
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
    return _decorate(req)


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
            joinedload(LabDipRequest.items).joinedload(LabDipItem.item),
            joinedload(LabDipRequest.dips),
        )
        .order_by(LabDipRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [_decorate(r) for r in result.unique().scalars().all()]


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

    # New items get a fresh variant_seq above every kept item's, so letters never
    # collide with or reshuffle existing ones (stable assignment).
    kept_seqs = [existing_items[str(g.id)].variant_seq for g in payload.items
                 if g.id is not None and str(g.id) in existing_items]
    next_seq = (max(kept_seqs) + 1) if kept_seqs else 0

    for gi, group in enumerate(payload.items):
        if group.id is not None and str(group.id) in existing_items:
            item = existing_items[str(group.id)]
            item.item_id = group.item_id
            item.order = gi
        else:
            item = LabDipItem(lab_dip_request_id=req.id, item_id=group.item_id, order=gi, variant_seq=next_seq)
            next_seq += 1
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
    return _decorate(req)


@router.put("/lab-dips/{request_id}/items/{item_id}/status")
async def update_lab_dip_item_status(
    request_id: str,
    item_id: str,
    status: str,
    set_value: str | None = None,
    notes: str | None = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(LabDipItem).filter(LabDipItem.id == item_id, LabDipItem.lab_dip_request_id == request_id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Lab dip item not found")

    valid_statuses = ["PENDING", "IN_PROGRESS", "APPROVED", "REJECTED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    # APPROVED / REJECTED are terminal — a decided variant can never be re-opened.
    if item.status in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail=f"Variant is {item.status} and locked; its status cannot be changed")

    parent_result = await db.execute(select(LabDipRequest).filter(LabDipRequest.id == request_id))
    parent = parent_result.scalars().first()

    minted_color_code = None
    if status == "APPROVED":
        set_value = (set_value or "").strip()
        if not set_value:
            raise HTTPException(status_code=400, detail="A set index is required to approve a variant")

        seq_part = parent.code.rsplit("-", 1)[-1] if parent and parent.code else ""
        code = f"{seq_part}-{_variant_letter(item.variant_seq)}-{set_value}"

        dup = await db.execute(select(Color).filter(Color.code == code))
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail=f"Color code '{code}' already exists in the library")

        color = Color(
            code=code,
            name=code,  # the code is the shade identity; a friendly name is optional.
            notes=(notes or None),
            status="active",
        )
        db.add(color)
        await db.flush()

        # Option-A mirror: create + link a `Color Code` (labdip_color) AttributeValue so the
        # legacy LabDip color dropdown keeps resolving during the transition to the library.
        attr_id = (await db.execute(
            select(Attribute.id).filter(Attribute.system_role == "labdip_color")
        )).scalars().first()
        if attr_id is not None:
            av = AttributeValue(attribute_id=attr_id, value=code)
            db.add(av)
            await db.flush()
            color.attribute_value_id = av.id

        item.approved_set = set_value
        item.approved_color_id = color.id
        minted_color_code = code

    previous_status = item.status
    item.status = status

    if parent:
        parent.updated_at = datetime.utcnow()

    await db.commit()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE_ITEM_STATUS",
        entity_type="LabDipItem",
        entity_id=item_id,
        details=f"Updated lab dip item variant status from {previous_status} to {status}"
                + (f"; minted color {minted_color_code}" if minted_color_code else ""),
        changes={"status": status, "previous_status": previous_status, "approved_color_code": minted_color_code},
    )
    return {"status": "success", "color_code": minted_color_code}


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
