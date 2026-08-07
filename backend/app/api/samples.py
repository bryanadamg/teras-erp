from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_, and_
from sqlalchemy.orm import joinedload, selectinload
from app.db.session import get_async_db
from app.models.sample import SampleRequest, SampleColor, SampleRequestRead
from app.models.item import Item as ItemModel
from app.models.attribute import Attribute, AttributeValue
from app.schemas import (
    SampleRequestCreate, SampleRequestUpdate, SampleRequestResponse, SampleColorResponse,
    PaginatedSampleRequestResponse, SampleColorStats,
)
from app.models.auth import User
from app.api.auth import get_current_user, require_permission
from app.services import audit_service, kpi_service
from app.core.ws_manager import manager
from datetime import datetime, date, time, timedelta
from pathlib import Path
import shutil, os, uuid

router = APIRouter()


# The request category is a value of the `Sample Category` system attribute so users
# can add their own; these three are only the seeded defaults. The keys are what the
# pre-attribute column stored — kept as an alias map so old links/clients still filter.
SAMPLE_CATEGORY_ROLE = "sample_category"
LEGACY_CATEGORY_LABELS = {
    "NEW_SAMPLE": "New Sample",
    "RE_SAMPLE": "Re Sample",
    "YARDAGE": "Yardage",
}
DEFAULT_CATEGORY_LABEL = "New Sample"


async def _resolve_sample_category(
    db: AsyncSession, value_id, category_text: str | None
) -> tuple[object | None, str]:
    """Return (attribute_value_id, display snapshot) for a request's category pick.

    Categories are values of the `Sample Category` system attribute (role
    sample_category), curated on the Attributes page. A value belonging to any
    other attribute is a 422. When only text arrives (legacy client, or the old
    enum key) it is matched back to a value; unmatched text is kept as a bare
    snapshot rather than rejected, so an import can't lose the classification.
    """
    if value_id:
        row = (await db.execute(
            select(AttributeValue)
            .join(Attribute, Attribute.id == AttributeValue.attribute_id)
            .filter(AttributeValue.id == value_id, Attribute.system_role == SAMPLE_CATEGORY_ROLE)
        )).scalars().first()
        if not row:
            raise HTTPException(status_code=422, detail=f"Invalid sample category selection: {value_id}")
        return row.id, row.value

    label = (category_text or "").strip()
    label = LEGACY_CATEGORY_LABELS.get(label, label) or DEFAULT_CATEGORY_LABEL
    match = (await db.execute(
        select(AttributeValue)
        .join(Attribute, Attribute.id == AttributeValue.attribute_id)
        .filter(Attribute.system_role == SAMPLE_CATEGORY_ROLE, func.lower(AttributeValue.value) == label.lower())
    )).scalars().first()
    if match:
        return match.id, match.value
    return None, label[:64]


def _enrich_creator(samples: list) -> None:
    for sample in samples:
        creator = sample.created_by
        sample.created_by_name = creator.full_name if creator else None
        sample.created_by_role = creator.role.name if creator and creator.role else None


async def _enrich_colors_with_items(db: AsyncSession, samples: list) -> None:
    all_color_ids = [c.id for s in samples for c in (s.colors or [])]
    if not all_color_ids:
        return
    item_rows = await db.execute(
        select(ItemModel.source_color_id, ItemModel.id, ItemModel.code)
        .where(ItemModel.source_color_id.in_(all_color_ids))
    )
    color_item_map = {row[0]: (row[1], row[2]) for row in item_rows.all()}
    for sample in samples:
        for color in (sample.colors or []):
            item_info = color_item_map.get(color.id)
            color.item_id = item_info[0] if item_info else None
            color.item_code = item_info[1] if item_info else None


@router.post("/samples", response_model=SampleRequestResponse)
async def create_sample_request(
    payload: SampleRequestCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.create')),
):
    count_result = await db.execute(select(func.count()).select_from(SampleRequest))
    count = count_result.scalar_one()
    code = f"SMP-{datetime.now().year}-{str(count + 1).zfill(5)}"

    req_date = date.fromisoformat(payload.request_date) if payload.request_date else date.today()
    est_date = date.fromisoformat(payload.estimated_completion_date) if payload.estimated_completion_date else None
    now = datetime.utcnow()
    cat_value_id, cat_label = await _resolve_sample_category(db, payload.category_value_id, payload.category)

    sample = SampleRequest(
        code=code,
        customer_id=payload.customer_id,
        request_date=req_date,
        project=payload.project,
        customer_article_code=payload.customer_article_code,
        internal_article_code=payload.internal_article_code,
        width=payload.width,
        variant_type=payload.variant_type,
        category=cat_label,
        category_value_id=cat_value_id,
        main_material=payload.main_material,
        middle_material=payload.middle_material,
        bottom_material=payload.bottom_material,
        weft=payload.weft,
        warp=payload.warp,
        original_weight=payload.original_weight,
        production_weight=payload.production_weight,
        additional_info=payload.additional_info,
        quantity=payload.quantity,
        sample_size=payload.sample_size,
        estimated_completion_date=est_date,
        completion_description=payload.completion_description,
        notes=payload.notes,
        status="DRAFT",
        updated_at=now,
        created_by_id=current_user.id,
    )
    db.add(sample)
    await db.flush()

    for i, color_data in enumerate(payload.colors):
        if color_data.name.strip():
            db.add(SampleColor(
                sample_request_id=sample.id,
                name=color_data.name.strip(),
                is_repeat=color_data.is_repeat,
                order=i,
            ))

    await db.commit()

    result = await db.execute(
        select(SampleRequest)
        .options(joinedload(SampleRequest.colors), joinedload(SampleRequest.created_by).joinedload(User.role))
        .filter(SampleRequest.id == sample.id)
    )
    sample = result.unique().scalars().first()
    _enrich_creator([sample])

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="SampleRequest",
        entity_id=str(sample.id),
        details=f"Created Sample Request {sample.code}",
        changes={"code": sample.code, "customer_article_code": sample.customer_article_code},
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    await _enrich_colors_with_items(db, [sample])
    sample.is_unread = False
    return sample


def _sample_conditions(
    search: str | None,
    status: str | None,
    category: str | None,
    created_from: str | None,
    created_to: str | None,
    category_value_id: str | None = None,
) -> list:
    """WHERE clauses shared by the page query, the total/unread counts and the
    color tallies — every number the samples page shows must be computed over
    the same filtered set, so they are built once here."""
    conds = []
    if search:
        like = f"%{search.strip().lower()}%"
        conds.append(or_(
            func.lower(SampleRequest.code).like(like),
            func.lower(SampleRequest.project).like(like),
            func.lower(SampleRequest.customer_article_code).like(like),
        ))
    if status and status != "ALL":
        conds.append(SampleRequest.status == status)
    # The UI filters by attribute value id (a renamed category keeps matching its rows);
    # ?category= is the legacy text/enum-key path kept for old deep links.
    if category_value_id and category_value_id != "ALL":
        conds.append(SampleRequest.category_value_id == category_value_id)
    elif category and category != "ALL":
        label = LEGACY_CATEGORY_LABELS.get(category, category)
        conds.append(func.coalesce(SampleRequest.category, DEFAULT_CATEGORY_LABEL) == label)
    # Date inputs emit yyyy-mm-dd; created_at is a timestamp, so the upper bound
    # is exclusive-next-midnight to keep the range inclusive on both ends.
    if created_from:
        conds.append(SampleRequest.created_at >= datetime.combine(date.fromisoformat(created_from), time.min))
    if created_to:
        conds.append(SampleRequest.created_at < datetime.combine(date.fromisoformat(created_to) + timedelta(days=1), time.min))
    return conds


@router.get("/samples", response_model=PaginatedSampleRequestResponse)
async def get_samples(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    status: str | None = None,
    category: str | None = None,
    category_value_id: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    focus_id: str | None = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    limit = max(1, min(limit, 200))
    skip = max(0, skip)
    conds = _sample_conditions(search, status, category, created_from, created_to, category_value_id)

    total = await db.scalar(select(func.count()).select_from(SampleRequest).where(*conds)) or 0

    # ORDER BY is (created_at DESC, id DESC) everywhere: created_at alone is not
    # unique, and an unstable order makes rows jump between pages.
    order_cols = (SampleRequest.created_at.desc(), SampleRequest.id.desc())

    # ?focus_id= (a ?highlight= deep link) must land on whatever page holds that
    # row under the current filters — compute its rank instead of scanning.
    if focus_id:
        target = (await db.execute(
            select(SampleRequest.created_at, SampleRequest.id)
            .where(SampleRequest.id == focus_id, *conds)
        )).first()
        if target:
            rank = await db.scalar(
                select(func.count()).select_from(SampleRequest).where(
                    *conds,
                    or_(
                        SampleRequest.created_at > target[0],
                        and_(SampleRequest.created_at == target[0], SampleRequest.id > target[1]),
                    ),
                )
            ) or 0
            skip = (rank // limit) * limit

    id_rows = await db.execute(
        select(SampleRequest.id).where(*conds).order_by(*order_cols).offset(skip).limit(limit)
    )
    ids = [r[0] for r in id_rows.all()]

    samples: list = []
    if ids:
        result = await db.execute(
            select(SampleRequest)
            .options(selectinload(SampleRequest.colors), joinedload(SampleRequest.created_by).joinedload(User.role))
            .where(SampleRequest.id.in_(ids))
        )
        by_id = {s.id: s for s in result.unique().scalars().all()}
        samples = [by_id[i] for i in ids if i in by_id]

    _enrich_creator(samples)
    await _enrich_colors_with_items(db, samples)

    reads: dict = {}
    if ids:
        reads_result = await db.execute(
            select(SampleRequestRead.sample_request_id, SampleRequestRead.read_at).where(
                SampleRequestRead.user_id == current_user.id,
                SampleRequestRead.sample_request_id.in_(ids),
            )
        )
        reads = {str(r[0]): r[1] for r in reads_result.all()}

    for sample in samples:
        read_at = reads.get(str(sample.id))
        sample_updated_at = sample.updated_at or sample.created_at
        sample.is_unread = read_at is None or read_at < sample_updated_at

    # Unread badge counts the whole filtered set, not the page — correlated
    # subquery so "never read" and "read before the last edit" both count.
    read_at_sq = (
        select(SampleRequestRead.read_at)
        .where(
            SampleRequestRead.user_id == current_user.id,
            SampleRequestRead.sample_request_id == SampleRequest.id,
        )
        .scalar_subquery()
    )
    unread = await db.scalar(
        select(func.count()).select_from(SampleRequest).where(
            *conds,
            or_(
                read_at_sq.is_(None),
                read_at_sq < func.coalesce(SampleRequest.updated_at, SampleRequest.created_at),
            ),
        )
    ) or 0

    stat_rows = await db.execute(
        select(SampleColor.status, func.count())
        .select_from(SampleColor)
        .join(SampleRequest, SampleColor.sample_request_id == SampleRequest.id)
        .where(*conds)
        .group_by(SampleColor.status)
    )
    color_stats = SampleColorStats()
    for st, cnt in stat_rows.all():
        color_stats.total += cnt
        key = st or "PENDING"
        if hasattr(color_stats, key):
            setattr(color_stats, key, getattr(color_stats, key) + cnt)

    return PaginatedSampleRequestResponse(
        items=samples,
        total=total,
        page=(skip // limit) + 1,
        size=limit,
        unread=unread,
        color_stats=color_stats,
    )


@router.get("/samples/codes", response_model=list[str])
async def get_sample_codes(
    prefix: str = "",
    limit: int = 2000,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Codes matching a prefix, for client-side next-free-code suggestion.
    The list is paginated now, so the create form can no longer test candidate
    codes against the in-memory page."""
    q = select(SampleRequest.code)
    if prefix:
        escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        q = q.where(SampleRequest.code.like(f"{escaped}%", escape="\\"))
    rows = await db.execute(q.order_by(SampleRequest.code).limit(max(1, min(limit, 10000))))
    return [r[0] for r in rows.all()]


@router.put("/samples/{sample_id}", response_model=SampleRequestResponse)
async def update_sample_request(
    sample_id: str,
    payload: SampleRequestUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.edit')),
):
    result = await db.execute(
        select(SampleRequest)
        .options(joinedload(SampleRequest.colors))
        .filter(SampleRequest.id == sample_id)
    )
    sample = result.unique().scalars().first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    req_date = date.fromisoformat(payload.request_date) if payload.request_date else date.today()
    est_date = date.fromisoformat(payload.estimated_completion_date) if payload.estimated_completion_date else None

    sample.customer_id = payload.customer_id
    sample.request_date = req_date
    sample.project = payload.project
    sample.customer_article_code = payload.customer_article_code
    sample.internal_article_code = payload.internal_article_code
    sample.width = payload.width
    sample.variant_type = payload.variant_type
    sample.category_value_id, sample.category = await _resolve_sample_category(
        db, payload.category_value_id, payload.category
    )
    sample.main_material = payload.main_material
    sample.middle_material = payload.middle_material
    sample.bottom_material = payload.bottom_material
    sample.weft = payload.weft
    sample.warp = payload.warp
    sample.original_weight = payload.original_weight
    sample.original_weight_unit = payload.original_weight_unit
    sample.production_weight = payload.production_weight
    sample.production_weight_unit = payload.production_weight_unit
    sample.additional_info = payload.additional_info
    sample.quantity = payload.quantity
    sample.sample_size = payload.sample_size
    sample.estimated_completion_date = est_date
    sample.completion_description = payload.completion_description
    sample.notes = payload.notes
    sample.updated_at = datetime.utcnow()

    # Colors diff: keep existing ids, delete removed, insert new
    incoming_ids = {str(c.id) for c in payload.colors if c.id is not None}
    for existing_color in list(sample.colors):
        if str(existing_color.id) not in incoming_ids:
            await db.delete(existing_color)

    for i, color_data in enumerate(payload.colors):
        if not color_data.name.strip():
            continue
        if color_data.id is not None:
            color_result = await db.execute(
                select(SampleColor).filter(SampleColor.id == color_data.id)
            )
            existing = color_result.scalars().first()
            if existing:
                existing.name = color_data.name.strip()
                existing.is_repeat = color_data.is_repeat
                existing.order = i
        else:
            db.add(SampleColor(
                sample_request_id=sample.id,
                name=color_data.name.strip(),
                is_repeat=color_data.is_repeat,
                order=i,
            ))

    await db.commit()

    result = await db.execute(
        select(SampleRequest)
        .options(joinedload(SampleRequest.colors), joinedload(SampleRequest.created_by).joinedload(User.role))
        .filter(SampleRequest.id == sample_id)
    )
    sample = result.unique().scalars().first()
    _enrich_creator([sample])

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="SampleRequest",
        entity_id=sample_id,
        details=f"Updated Sample Request {sample.code}",
        changes={"customer_article_code": sample.customer_article_code},
    )

    await _enrich_colors_with_items(db, [sample])
    sample.is_unread = False
    return sample


@router.put("/samples/{sample_id}/status")
async def update_sample_status(
    sample_id: str,
    status: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.update_status')),
):
    result = await db.execute(select(SampleRequest).filter(SampleRequest.id == sample_id))
    sample = result.scalars().first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    valid_statuses = ["DRAFT", "IN_PRODUCTION", "SENT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    previous_status = sample.status
    sample.status = status
    sample.updated_at = datetime.utcnow()
    await db.commit()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE_STATUS",
        entity_type="SampleRequest",
        entity_id=sample_id,
        details=f"Updated Sample {sample.code} status from {previous_status} to {status}",
        changes={"status": status, "previous_status": previous_status},
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": f"Sample updated to {status}"}


@router.put("/samples/{sample_id}/colors/{color_id}/status", response_model=SampleColorResponse)
async def update_color_status(
    sample_id: str,
    color_id: str,
    status: str,
    reason: str | None = None,
    notes: str | None = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.update_status')),
):
    result = await db.execute(
        select(SampleColor).filter(SampleColor.id == color_id, SampleColor.sample_request_id == sample_id)
    )
    color = result.scalars().first()
    if not color:
        raise HTTPException(status_code=404, detail="Color not found")

    valid_statuses = ["PENDING", "IN_PRODUCTION", "SENT", "APPROVED", "REJECTED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    if color.status in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail=f"{color.status.capitalize()} color status is locked and cannot be changed")

    previous_status = color.status
    color.status = status
    if status == "REJECTED":
        color.rejection_reason = (reason or "").strip() or None
        color.rejection_notes = (notes or "").strip() or None
    else:
        color.rejection_reason = None
        color.rejection_notes = None

    # Bump parent sample's updated_at so all users see it as unread
    parent_result = await db.execute(select(SampleRequest).filter(SampleRequest.id == sample_id))
    parent_sample = parent_result.scalars().first()
    if parent_sample:
        parent_sample.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(color)
    color.item_id = None
    color.item_code = None

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE_COLOR_STATUS",
        entity_type="SampleColor",
        entity_id=color_id,
        details=f"Updated color '{color.name}' status from {previous_status} to {status}",
        changes={"status": status, "previous_status": previous_status},
    )
    return color


@router.post("/samples/{sample_id}/read")
async def mark_sample_read(
    sample_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.edit')),
):
    result = await db.execute(
        select(SampleRequestRead).filter(
            SampleRequestRead.user_id == current_user.id,
            SampleRequestRead.sample_request_id == uuid.UUID(sample_id),
        )
    )
    read_record = result.scalars().first()
    now = datetime.utcnow()
    if read_record:
        read_record.read_at = now
    else:
        db.add(SampleRequestRead(
            user_id=current_user.id,
            sample_request_id=uuid.UUID(sample_id),
            read_at=now,
        ))
    await db.commit()
    return {"status": "success"}


@router.delete("/samples/{sample_id}/read")
async def mark_sample_unread(
    sample_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.edit')),
):
    result = await db.execute(
        select(SampleRequestRead).filter(
            SampleRequestRead.user_id == current_user.id,
            SampleRequestRead.sample_request_id == uuid.UUID(sample_id),
        )
    )
    read_record = result.scalars().first()
    if read_record:
        await db.delete(read_record)
        await db.commit()
    return {"status": "success"}


@router.post("/samples/read-all")
async def mark_all_samples_read(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.edit')),
):
    await db.execute(
        delete(SampleRequestRead).where(SampleRequestRead.user_id == current_user.id)
    )
    samples_result = await db.execute(select(SampleRequest.id))
    now = datetime.utcnow()
    for row in samples_result.all():
        db.add(SampleRequestRead(
            user_id=current_user.id,
            sample_request_id=row[0],
            read_at=now,
        ))
    await db.commit()
    return {"status": "success"}


@router.post("/samples/{sample_id}/completion-image")
async def upload_completion_image(
    sample_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.edit')),
):
    result = await db.execute(select(SampleRequest).filter(SampleRequest.id == sample_id))
    sample = result.scalars().first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    upload_dir = Path("static/samples")
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    if ext == ".jpeg":
        ext = ".jpg"
    file_path = upload_dir / f"{sample_id}_completion{ext}"
    with file_path.open("wb") as buf:
        await run_in_threadpool(shutil.copyfileobj, file.file, buf)

    sample.completion_image_url = f"/static/samples/{sample_id}_completion{ext}"
    await db.commit()
    await audit_service.log_activity(db, current_user.id, "UPDATE", "SampleRequest", sample_id, details="Uploaded completion image")
    return {"completion_image_url": sample.completion_image_url}


@router.post("/samples/{sample_id}/design-pdf")
async def upload_design_pdf(
    sample_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.edit')),
):
    result = await db.execute(select(SampleRequest).filter(SampleRequest.id == sample_id))
    sample = result.scalars().first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    upload_dir = Path("static/samples")
    upload_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower() if file.filename else ".pdf"
    file_path = upload_dir / f"{sample_id}_design{ext}"
    with file_path.open("wb") as buf:
        await run_in_threadpool(shutil.copyfileobj, file.file, buf)

    sample.design_pdf_url = f"/static/samples/{sample_id}_design{ext}"
    await db.commit()
    await audit_service.log_activity(db, current_user.id, "UPDATE", "SampleRequest", sample_id, details="Uploaded design PDF")
    return {"design_pdf_url": sample.design_pdf_url}


@router.delete("/samples/{sample_id}")
async def delete_sample(
    sample_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sample_request.delete')),
):
    result = await db.execute(select(SampleRequest).filter(SampleRequest.id == sample_id))
    sample = result.scalars().first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    details = f"Deleted Sample {sample.code}"
    await db.delete(sample)
    await db.commit()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="SampleRequest",
        entity_id=sample_id,
        details=details,
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": "Sample deleted"}
