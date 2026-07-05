from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload, joinedload
from pathlib import Path
import shutil, os, uuid as _uuid
from app.db.session import get_async_db
from app.models.bom import BOM, BOMLine, BOMOperation, BOMSize, bom_values, bom_line_values
from app.models.size import Size
from app.models.item import Item
from app.models.location import Location
from app.models.routing import WorkCenter, Operation
from app.models.production_run import PRBomEntrySize
from app.schemas import BOMCreate, BOMUpdate, BOMResponse, BOMSummaryResponse, BOMSummaryPageResponse, BOMTreeResponse, SizeResponse, BOMAutomatorProfileCreate, BOMAutomatorProfileResponse
from app.models.auth import User, BOMAutomatorProfile
from app.api.auth import get_current_user, require_permission
from app.services import audit_service
from app.models.attribute import AttributeValue

router = APIRouter()


async def _sync_beam_ends(db: AsyncSession, bom: BOM) -> None:
    """For beam BOMs, write bom.qty → item.ends (the warp-ends/utas count).

    A BOM is treated as a beam when its produced item is in the 'beam' category
    OR its work center (or that center's parent group) is of center_type BEAMING.
    The work-center path covers items created inline during BOM creation that have
    no category yet (e.g. auto-generated BOMs)."""
    is_beam = False
    if bom.work_center_id:
        wc = (await db.execute(select(WorkCenter).filter(WorkCenter.id == bom.work_center_id))).scalars().first()
        if wc:
            if (wc.center_type or '').upper() == 'BEAMING':
                is_beam = True
            elif wc.parent_id:
                parent = (await db.execute(select(WorkCenter).filter(WorkCenter.id == wc.parent_id))).scalars().first()
                if parent and (parent.center_type or '').upper() == 'BEAMING':
                    is_beam = True

    result = await db.execute(
        select(Item).options(joinedload(Item.category)).filter(Item.id == bom.item_id)
    )
    item = result.scalars().first()
    if not item:
        return
    if not is_beam and item.category and item.category.name.lower() == 'beam':
        is_beam = True
    if is_beam:
        item.ends = int(bom.qty)
        await db.commit()


def _validate_line_percentages(lines: list) -> None:
    if not lines:
        return
    if any((l.percentage or 0) == 0 for l in lines):
        raise HTTPException(status_code=422, detail="All BOM lines must have a non-zero percentage.")
    total = sum(float(l.percentage or 0) for l in lines)
    if abs(total - 100.0) > 0.01:
        raise HTTPException(status_code=422, detail=f"BOM line percentages must sum to 100% (got {total:.2f}%).")


def _validate_steps_assigned(operations: list, lines: list) -> None:
    """L2 rule: when a BOM defines routing operations, every material line must be
    allocated to a step (bom_operation_sequence). Per-operation staging/consumption
    depends on it, so an unassigned line is blocked."""
    if not operations or not lines:
        return
    valid_seqs = {op.sequence for op in operations if (op.operation_id is not None or op.work_center_id is not None)}
    if not valid_seqs:
        return
    missing = [
        (l.item_code or "?") for l in lines
        if l.bom_operation_sequence is None or l.bom_operation_sequence not in valid_seqs
    ]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Every material must be assigned to a routing step when the BOM has operations. Unassigned: {', '.join(missing)}",
        )


@router.get("/sizes", response_model=list[SizeResponse])
async def get_sizes(db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Size).order_by(Size.sort_order))
    return result.scalars().all()

@router.post("/boms", response_model=BOMResponse)
async def create_bom(payload: BOMCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('manufacturing.manage'))):
    _validate_line_percentages(payload.lines)
    _validate_steps_assigned(payload.operations, payload.lines)

    # 1. Resolve Produced Item
    result = await db.execute(select(Item).filter(Item.code == payload.item_code))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Produced item '{payload.item_code}' not found")
    
    # 2. Check if BOM code exists
    result = await db.execute(select(BOM).filter(BOM.code == payload.code))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="BOM Code already exists")

    # 3. Create BOM Header
    bom = BOM(
        code=payload.code,
        description=payload.description,
        item_id=item.id,
        qty=payload.qty,
        kerapatan_picks=payload.kerapatan_picks,
        kerapatan_unit=payload.kerapatan_unit,
        sisir_no=payload.sisir_no,
        pemakaian_obat=payload.pemakaian_obat,
        pembuatan_sample_oleh=payload.pembuatan_sample_oleh,
        customer_id=payload.customer_id,
        work_center_id=payload.work_center_id,
        size_mode=payload.size_mode,
        berat_bahan_mateng=payload.berat_bahan_mateng,
        berat_bahan_mentah_pelesan=payload.berat_bahan_mentah_pelesan,
        mesin_lebar=payload.mesin_lebar,
        mesin_panjang_tulisan=payload.mesin_panjang_tulisan,
        mesin_panjang_tarikan=payload.mesin_panjang_tarikan,
        mesin_panjang_tarikan_bandul_1kg=payload.mesin_panjang_tarikan_bandul_1kg,
        mesin_panjang_tarikan_bandul_9kg=payload.mesin_panjang_tarikan_bandul_9kg,
        celup_lebar=payload.celup_lebar,
        celup_panjang_tulisan=payload.celup_panjang_tulisan,
        celup_panjang_tarikan=payload.celup_panjang_tarikan,
        celup_panjang_tarikan_bandul_1kg=payload.celup_panjang_tarikan_bandul_1kg,
        celup_panjang_tarikan_bandul_9kg=payload.celup_panjang_tarikan_bandul_9kg,
    )
    
    if payload.attribute_value_ids:
        result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(payload.attribute_value_ids)))
        vals = result.scalars().all()
        bom.attribute_values = vals

    db.add(bom)
    await db.commit()

    # 4. Create BOM Sizes
    for size_entry in payload.sizes:
        if size_entry.target_measurement is None and size_entry.measurement_min is None and size_entry.measurement_max is None:
            continue
        bom_size = BOMSize(
            bom_id=bom.id,
            size_id=size_entry.size_id,
            label=size_entry.label,
            target_measurement=size_entry.target_measurement,
            measurement_min=size_entry.measurement_min,
            measurement_max=size_entry.measurement_max,
        )
        db.add(bom_size)
    await db.commit()

    # 5. Create BOM Operations first so lines can reference them by sequence
    seq_to_op_id: dict[int, any] = {}
    for op in payload.operations:
        if op.work_center_id is None and op.operation_id is None:
            continue
        bom_op = BOMOperation(
            bom_id=bom.id,
            operation_id=op.operation_id,
            work_center_id=op.work_center_id,
            sequence=op.sequence,
            time_minutes=op.time_minutes,
        )
        db.add(bom_op)
        seq_to_op_id[op.sequence] = bom_op

    await db.flush()

    # 6. Create BOM Lines
    for line in payload.lines:
        result = await db.execute(select(Item).filter(Item.code == line.item_code))
        material = result.scalars().first()
        if not material:
            raise HTTPException(status_code=404, detail=f"Material item '{line.item_code}' not found")

        resolved_op = seq_to_op_id.get(line.bom_operation_sequence) if line.bom_operation_sequence is not None else None
        bom_line = BOMLine(
            bom_id=bom.id,
            item_id=material.id,
            qty=line.qty,
            percentage=line.percentage,
            bom_operation_id=resolved_op.id if resolved_op else None,
        )

        if line.source_location_code:
            result = await db.execute(select(Location).filter(Location.code == line.source_location_code))
            loc = result.scalars().first()
            if not loc:
                raise HTTPException(status_code=404, detail=f"Source Location '{line.source_location_code}' not found")
            bom_line.source_location_id = loc.id

        if line.attribute_value_ids:
            result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids)))
            vals = result.scalars().all()
            bom_line.attribute_values = vals

        db.add(bom_line)

    await db.commit()

    # Re-fetch with FULL eager loading for serialization
    result = await db.execute(
        select(BOM)
        .options(
            joinedload(BOM.item),
            joinedload(BOM.customer),
            joinedload(BOM.work_center),
            selectinload(BOM.attribute_values),
            selectinload(BOM.lines).joinedload(BOMLine.item),
            selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
            selectinload(BOM.operations),
            selectinload(BOM.sizes).joinedload(BOMSize.size),
        )
        .filter(BOM.id == bom.id)
    )
    refresh_bom = result.scalars().first()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="BOM",
        entity_id=str(refresh_bom.id),
        details=f"Created BOM {refresh_bom.code} for {item.code}",
        changes=payload.model_dump()
    )

    await _sync_beam_ends(db, bom)

    refresh_bom.attribute_value_ids = [v.id for v in refresh_bom.attribute_values]
    for bl in refresh_bom.lines:
        bl.attribute_value_ids = [v.id for v in bl.attribute_values]

    return refresh_bom

@router.get("/boms", response_model=list[BOMResponse])
async def get_boms(skip: int = 0, limit: int | None = None, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Full nested BOM list — consumed unpaginated by manufacturing/MES/sales/samples
    and the scanner, which need every active BOM in memory to resolve sub-BOM chains
    for MRP consolidation (you can't page through this: which page holds a given
    sub-BOM isn't known in advance). `limit` defaults to unbounded for that reason —
    the BOM page's own paginated list lives at /boms/summary instead."""
    query = select(BOM).options(
        joinedload(BOM.item),
        joinedload(BOM.customer),
        joinedload(BOM.work_center),
        selectinload(BOM.attribute_values),
        selectinload(BOM.lines).joinedload(BOMLine.item),
        selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
        selectinload(BOM.operations),
        selectinload(BOM.sizes).joinedload(BOMSize.size),
    )
    query = query.order_by(BOM.created_at.desc()).offset(skip)
    if limit is not None:
        query = query.limit(limit)

    result = await db.execute(query)
    items_list = result.unique().scalars().all()
    
    for item in items_list:
        item.attribute_value_ids = [v.id for v in item.attribute_values]
        for bl in item.lines:
            bl.attribute_value_ids = [v.id for v in bl.attribute_values]
    return items_list

@router.get("/boms/summary", response_model=BOMSummaryPageResponse)
async def get_boms_summary(
    skip: int = 0,
    limit: int = 50,
    search: str = Query(""),
    root_only: bool = Query(False),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated lightweight BOM list for the BOM page.

    Returns full headers + lines + sizes, but collapses `operations` to a count.
    Supports server-side search (code or item name) and root_only filtering.
    Other domains (manufacturing/MES/sales) still use `/boms`.
    """
    # Sub-BOMs: item_ids that appear as components in any BOM line
    sub_item_ids_sq = select(BOMLine.item_id).distinct().scalar_subquery()

    # Build WHERE conditions
    where = []
    if search:
        where.append(or_(
            BOM.code.ilike(f"%{search}%"),
            Item.name.ilike(f"%{search}%"),
        ))
    if root_only:
        where.append(BOM.item_id.not_in(sub_item_ids_sq))

    # Count (join Item only when search requires it)
    count_q = select(func.count(BOM.id))
    if search:
        count_q = count_q.join(Item, BOM.item_id == Item.id)
    if where:
        count_q = count_q.where(*where)
    total: int = (await db.execute(count_q)).scalar_one()

    # Data query
    query = select(BOM).options(
        joinedload(BOM.item),
        joinedload(BOM.customer),
        joinedload(BOM.work_center),
        selectinload(BOM.lines).joinedload(BOMLine.item),
        selectinload(BOM.sizes).joinedload(BOMSize.size),
    )
    if search:
        query = query.join(Item, BOM.item_id == Item.id)
    if where:
        query = query.where(*where)
    result = await db.execute(query.order_by(BOM.created_at.desc()).offset(skip).limit(limit))
    boms = result.unique().scalars().all()

    if not boms:
        return {"items": [], "total": total}

    bom_ids = [b.id for b in boms]
    line_ids = [l.id for b in boms for l in b.lines]

    bom_attr_map: dict = {}
    rows = await db.execute(
        select(bom_values.c.bom_id, bom_values.c.attribute_value_id).where(bom_values.c.bom_id.in_(bom_ids))
    )
    for bid, vid in rows.all():
        bom_attr_map.setdefault(bid, []).append(vid)

    line_attr_map: dict = {}
    if line_ids:
        rows = await db.execute(
            select(bom_line_values.c.bom_line_id, bom_line_values.c.attribute_value_id).where(bom_line_values.c.bom_line_id.in_(line_ids))
        )
        for lid, vid in rows.all():
            line_attr_map.setdefault(lid, []).append(vid)

    op_counts: dict = {}
    rows = await db.execute(
        select(BOMOperation.bom_id, func.count(BOMOperation.id)).where(BOMOperation.bom_id.in_(bom_ids)).group_by(BOMOperation.bom_id)
    )
    for bid, cnt in rows.all():
        op_counts[bid] = cnt

    # Compute is_root: item_id not used as a component in any BOM line
    component_rows = await db.execute(select(BOMLine.item_id).distinct())
    component_item_ids = {r[0] for r in component_rows.all()}

    for b in boms:
        b.attribute_value_ids = bom_attr_map.get(b.id, [])
        b.operation_count = op_counts.get(b.id, 0)
        b.is_root = b.item_id not in component_item_ids
        for bl in b.lines:
            bl.attribute_value_ids = line_attr_map.get(bl.id, [])

    return {"items": boms, "total": total}

@router.get("/boms/{bom_id}", response_model=BOMResponse)
async def get_bom(bom_id: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(BOM)
        .options(
            joinedload(BOM.item),
            joinedload(BOM.customer),
            joinedload(BOM.work_center),
            selectinload(BOM.attribute_values),
            selectinload(BOM.lines).joinedload(BOMLine.item),
            selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
            selectinload(BOM.operations),
            selectinload(BOM.sizes).joinedload(BOMSize.size),
        )
        .filter(BOM.id == bom_id)
    )
    bom = result.scalars().first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    bom.attribute_value_ids = [v.id for v in bom.attribute_values]
    for bl in bom.lines:
        bl.attribute_value_ids = [v.id for v in bl.attribute_values]

    return bom

async def _load_bom_subtree(bom_id: str, db: AsyncSession, visited: set) -> any:
    if bom_id in visited:
        return None
    visited.add(bom_id)
    result = await db.execute(
        select(BOM).options(
            joinedload(BOM.item),
            joinedload(BOM.customer),
            joinedload(BOM.work_center),
            selectinload(BOM.attribute_values),
            selectinload(BOM.lines).joinedload(BOMLine.item),
            selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
            selectinload(BOM.operations),
            selectinload(BOM.sizes).joinedload(BOMSize.size),
        ).filter(BOM.id == bom_id)
    )
    bom = result.unique().scalars().first()
    if not bom:
        return None
    bom.attribute_value_ids = [v.id for v in bom.attribute_values]
    for bl in bom.lines:
        bl.attribute_value_ids = [v.id for v in bl.attribute_values]
        sub_result = await db.execute(
            select(BOM).filter(BOM.item_id == bl.item_id).order_by(BOM.created_at.desc())
        )
        sub_boms = sub_result.scalars().all()
        matched = None
        if sub_boms:
            line_av_ids = set(str(v) for v in bl.attribute_value_ids)
            for candidate in sub_boms:
                cand_result = await db.execute(
                    select(BOM).options(selectinload(BOM.attribute_values)).filter(BOM.id == candidate.id)
                )
                cand = cand_result.unique().scalars().first()
                cand_av_ids = set(str(v.id) for v in (cand.attribute_values or []))
                if cand_av_ids == line_av_ids:
                    matched = candidate
                    break
            if not matched:
                matched = sub_boms[0]
        bl.sub_bom = await _load_bom_subtree(str(matched.id), db, visited) if matched else None
    return bom

@router.get("/boms/{bom_id}/tree", response_model=BOMTreeResponse)
async def get_bom_tree(bom_id: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    bom = await _load_bom_subtree(bom_id, db, set())
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom

@router.post("/boms/{bom_id}/sample-photo")
async def upload_bom_sample_photo(
    bom_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('manufacturing.manage')),
):
    result = await db.execute(select(BOM).filter(BOM.id == bom_id))
    bom = result.scalars().first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    upload_dir = Path("static/boms")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    file_path = upload_dir / f"{bom_id}_sample{ext}"
    with file_path.open("wb") as buf:
        shutil.copyfileobj(file.file, buf)

    bom.sample_photo_url = f"/static/boms/{bom_id}_sample{ext}"
    await db.commit()
    return {"sample_photo_url": bom.sample_photo_url}

@router.post("/boms/{bom_id}/design-file")
async def upload_bom_design_file(
    bom_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('manufacturing.manage')),
):
    result = await db.execute(select(BOM).filter(BOM.id == bom_id))
    bom = result.scalars().first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    upload_dir = Path("static/boms")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".pdf"
    file_path = upload_dir / f"{bom_id}_design{ext}"
    with file_path.open("wb") as buf:
        shutil.copyfileobj(file.file, buf)

    bom.design_file_url = f"/static/boms/{bom_id}_design{ext}"
    await db.commit()
    return {"design_file_url": bom.design_file_url}

def _bom_eager_options():
    return [
        joinedload(BOM.item),
        joinedload(BOM.customer),
        joinedload(BOM.work_center),
        selectinload(BOM.attribute_values),
        selectinload(BOM.lines).joinedload(BOMLine.item),
        selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
        selectinload(BOM.operations),
        selectinload(BOM.sizes).joinedload(BOMSize.size),
    ]


@router.put("/boms/{bom_id}", response_model=BOMResponse)
async def update_bom(
    bom_id: str,
    payload: BOMUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('manufacturing.manage')),
):
    result = await db.execute(
        select(BOM).options(*_bom_eager_options()).filter(BOM.id == bom_id)
    )
    bom = result.unique().scalars().first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    # Capture before state for audit diff
    before_lines = [
        {"item_id": str(bl.item_id), "qty": float(bl.qty), "percentage": float(bl.percentage)}
        for bl in bom.lines
    ]

    # Update header fields
    scalar_fields = [
        "description", "qty", "tolerance_percentage", "active", "size_mode",
        "customer_id", "work_center_id", "kerapatan_picks", "kerapatan_unit", "sisir_no",
        "pemakaian_obat", "pembuatan_sample_oleh", "berat_bahan_mateng",
        "berat_bahan_mentah_pelesan", "mesin_lebar", "mesin_panjang_tulisan",
        "mesin_panjang_tarikan", "mesin_panjang_tarikan_bandul_1kg",
        "mesin_panjang_tarikan_bandul_9kg", "celup_lebar", "celup_panjang_tulisan",
        "celup_panjang_tarikan", "celup_panjang_tarikan_bandul_1kg",
        "celup_panjang_tarikan_bandul_9kg",
    ]
    for field in scalar_fields:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(bom, field, val)

    # Replace operations first so lines can reference them by sequence
    seq_to_op_id: dict[int, any] = {}
    if payload.operations is not None:
        for op in list(bom.operations):
            await db.delete(op)
        await db.flush()
        for oc in payload.operations:
            if oc.work_center_id is None and oc.operation_id is None:
                continue
            new_op = BOMOperation(
                bom_id=bom.id,
                operation_id=oc.operation_id,
                work_center_id=oc.work_center_id,
                sequence=oc.sequence,
                time_minutes=oc.time_minutes,
            )
            db.add(new_op)
            seq_to_op_id[oc.sequence] = new_op
        await db.flush()

    # Replace lines if provided
    if payload.lines is not None:
        _validate_line_percentages(payload.lines)
        if payload.operations is not None:
            _validate_steps_assigned(payload.operations, payload.lines)
        for bl in list(bom.lines):
            await db.delete(bl)
        await db.flush()
        for lc in payload.lines:
            item_result = await db.execute(select(Item).filter(Item.code == lc.item_code))
            material = item_result.scalars().first()
            if not material:
                raise HTTPException(status_code=404, detail=f"Material item '{lc.item_code}' not found")
            resolved_op = seq_to_op_id.get(lc.bom_operation_sequence) if lc.bom_operation_sequence is not None else None
            bom_line = BOMLine(bom_id=bom.id, item_id=material.id, qty=lc.qty, percentage=lc.percentage, bom_operation_id=resolved_op.id if resolved_op else None)
            if lc.source_location_code:
                loc_result = await db.execute(select(Location).filter(Location.code == lc.source_location_code))
                loc = loc_result.scalars().first()
                if not loc:
                    raise HTTPException(status_code=404, detail=f"Source location '{lc.source_location_code}' not found")
                bom_line.source_location_id = loc.id
            if lc.attribute_value_ids:
                av_result = await db.execute(
                    select(AttributeValue).filter(AttributeValue.id.in_(lc.attribute_value_ids))
                )
                bom_line.attribute_values = av_result.scalars().all()
            db.add(bom_line)

    # Upsert sizes: update in-place to preserve IDs referenced by MOs/PRs/SOs
    if payload.sizes is not None:
        existing_by_key: dict = {}
        for sz in bom.sizes:
            key = str(sz.size_id) if sz.size_id else (sz.label or "")
            existing_by_key[key] = sz

        payload_keys: set = set()
        for sc in payload.sizes:
            if sc.target_measurement is None and sc.measurement_min is None and sc.measurement_max is None:
                continue
            key = str(sc.size_id) if sc.size_id else (sc.label or "")
            payload_keys.add(key)
            if key in existing_by_key:
                sz = existing_by_key[key]
                sz.target_measurement = sc.target_measurement
                sz.measurement_min = sc.measurement_min
                sz.measurement_max = sc.measurement_max
                sz.label = sc.label
            else:
                db.add(BOMSize(
                    bom_id=bom.id,
                    size_id=sc.size_id,
                    label=sc.label,
                    target_measurement=sc.target_measurement,
                    measurement_min=sc.measurement_min,
                    measurement_max=sc.measurement_max,
                ))

        for key, sz in existing_by_key.items():
            if key in payload_keys:
                continue
            # PRBomEntrySize has no cascade/SET NULL — skip delete if referenced
            ref_pr = await db.execute(select(PRBomEntrySize.id).filter(PRBomEntrySize.bom_size_id == sz.id).limit(1))
            if ref_pr.first():
                continue
            await db.delete(sz)

    await db.commit()

    # Re-fetch with full eager loading
    result = await db.execute(select(BOM).options(*_bom_eager_options()).filter(BOM.id == bom.id))
    updated_bom = result.unique().scalars().first()

    after_lines = [
        {"item_id": str(bl.item_id), "qty": float(bl.qty), "percentage": float(bl.percentage)}
        for bl in updated_bom.lines
    ]

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="BOM",
        entity_id=str(updated_bom.id),
        details=f"Updated BOM {updated_bom.code}",
        changes={"lines_before": before_lines, "lines_after": after_lines},
    )

    await _sync_beam_ends(db, updated_bom)

    updated_bom.attribute_value_ids = [v.id for v in updated_bom.attribute_values]
    for bl in updated_bom.lines:
        bl.attribute_value_ids = [v.id for v in bl.attribute_values]

    return updated_bom


async def _collect_bom_tree_ids(db: AsyncSession, bom_id: _uuid.UUID, visited: set) -> list[_uuid.UUID]:
    """DFS collect all sub-BOM IDs reachable from bom_id via BOMLine.item_id → BOM.item_id.
    Returns IDs in deepest-first order (children before parents)."""
    if bom_id in visited:
        return []
    visited.add(bom_id)
    item_ids_result = await db.execute(
        select(BOMLine.item_id).filter(BOMLine.bom_id == bom_id)
    )
    item_ids = [r[0] for r in item_ids_result.all()]
    ordered: list[_uuid.UUID] = []
    if item_ids:
        sub_boms_result = await db.execute(
            select(BOM.id).filter(BOM.item_id.in_(item_ids))
        )
        for (sub_id,) in sub_boms_result.all():
            ordered.extend(await _collect_bom_tree_ids(db, sub_id, visited))
            ordered.append(sub_id)
    return ordered


@router.delete("/boms/{bom_id}")
async def delete_bom(bom_id: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('manufacturing.manage'))):
    result = await db.execute(select(BOM).filter(BOM.id == bom_id))
    bom = result.scalars().first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    # Collect all descendant BOM IDs (deepest first), then append root
    sub_ids = await _collect_bom_tree_ids(db, bom.id, {bom.id})
    all_ids = sub_ids + [bom.id]  # children deleted before parent

    details = f"Deleted BOM {bom.code} and {len(sub_ids)} sub-BOM(s)"

    try:
        for bid in all_ids:
            r = await db.execute(select(BOM).filter(BOM.id == bid))
            b = r.scalars().first()
            if b:
                await db.delete(b)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Cannot delete BOM tree because one or more BOMs are referenced by active Work Orders or Manufacturing Orders. Please complete or delete those first."
        )

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="BOM",
        entity_id=bom_id,
        details=details
    )

    return {"status": "success", "message": f"BOM and {len(sub_ids)} sub-BOM(s) deleted"}


# --- BOM Automator Profiles ---

@router.get("/bom-automator-profiles", response_model=list[BOMAutomatorProfileResponse])
async def list_bom_automator_profiles(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(BOMAutomatorProfile).where(BOMAutomatorProfile.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/bom-automator-profiles", response_model=BOMAutomatorProfileResponse, status_code=201)
async def create_bom_automator_profile(
    payload: BOMAutomatorProfileCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    profile = BOMAutomatorProfile(user_id=current_user.id, name=payload.name, levels=payload.levels)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/bom-automator-profiles/{profile_id}", status_code=204)
async def delete_bom_automator_profile(
    profile_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(BOMAutomatorProfile).where(
            BOMAutomatorProfile.id == profile_id,
            BOMAutomatorProfile.user_id == current_user.id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.delete(profile)
    await db.commit()
