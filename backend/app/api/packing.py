from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, String, nulls_last, inspect as sa_inspect
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime
import uuid

from app.db.session import get_async_db
from app.schemas import (
    PackingOrderCreate, PackingOrderUpdate, PackingOrderResponse, PackingOrderListResponse,
    PackingCompletionCreate, PackedUnitResponse,
)
from app.models.packing import (
    PackingOrder, PackingOrderMaterial, PackingCompletion, PackingCompletionMaterial,
)
from app.models.batch import Batch
from app.models.item import Item
from app.models.location import Location
from app.models.attribute import AttributeValue
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.stock_balance import StockBalance
from app.api.auth import get_current_user, require_permission
from app.models.auth import User
from app.services import audit_service, kpi_service, stock_service, packing_service
from app.core.ws_manager import manager

router = APIRouter(prefix="/packing", tags=["packing"])


# --- helpers ---------------------------------------------------------------

def _load_options():
    return (
        selectinload(PackingOrder.sales_order),
        selectinload(PackingOrder.item),
        selectinload(PackingOrder.attribute_values),
        selectinload(PackingOrder.materials).selectinload(PackingOrderMaterial.item),
        selectinload(PackingOrder.completions).selectinload(PackingCompletion.source_batch),
        selectinload(PackingOrder.completions)
        .selectinload(PackingCompletion.materials)
        .selectinload(PackingCompletionMaterial.item),
    )


async def _load(db: AsyncSession, po_id) -> Optional[PackingOrder]:
    # expire_on_commit=False keeps stale collections on an instance already in the
    # identity map; expire first so lines/completions repopulate post-commit.
    db.expire_all()
    result = await db.execute(
        select(PackingOrder).options(*_load_options()).filter(PackingOrder.id == po_id)
    )
    return result.scalars().first()


async def _packed_units_for(db: AsyncSession, po_ids: list) -> dict:
    """Cartons minted by each packing order, with live qty from StockBalance.

    One query for the whole page rather than per order — the list endpoint shows
    carton counts, so an N+1 here would scale with page size.
    """
    if not po_ids:
        return {}
    result = await db.execute(
        select(Batch, StockBalance)
        .outerjoin(StockBalance, StockBalance.batch_key == cast(Batch.id, String))
        .options(selectinload(Batch.item))
        .filter(Batch.packing_order_id.in_(po_ids))
        # qty desc so the carton's live balance row wins the per-batch dedupe below
        # over any zeroed leftover row from an earlier location.
        .order_by(Batch.package_no.asc(), nulls_last(StockBalance.qty.desc()))
    )
    out: dict = {}
    seen = set()
    for batch, bal in result.all():
        # One row per carton: the outerjoin can match several balance rows for a
        # batch that has been moved, and the positive one sorts first.
        if batch.id in seen:
            continue
        seen.add(batch.id)
        out.setdefault(str(batch.packing_order_id), []).append(
            PackedUnitResponse(
                id=batch.id,
                batch_number=batch.batch_number,
                item_id=batch.item_id,
                item_name=batch.item.name if batch.item else None,
                item_code=batch.item.code if batch.item else None,
                package_no=batch.package_no,
                package_label=batch.package_label,
                weight_kg=float(batch.weight_kg) if batch.weight_kg is not None else None,
                qty=float(bal.qty) if bal else 0.0,
                location_id=bal.location_id if bal else None,
                packing_order_id=batch.packing_order_id,
                packed_for_so_id=batch.packed_for_so_id,
                quality_status=batch.quality_status,
                created_at=batch.created_at,
            )
        )
    return out


def _decorate(po: PackingOrder, units: list = None) -> PackingOrder:
    """Attach non-column display fields the response schema expects."""
    if po.sales_order:
        po.sales_order_code = po.sales_order.po_number
        po.customer_name = po.sales_order.customer_name
    po.color_name = po.color.name if po.color else None
    po.attribute_value_ids = [v.id for v in (po.attribute_values or [])]
    # qty_consumed on each planned material rolls up from what completions used.
    consumed: dict = {}
    for c in (po.completions or []):
        for m in (c.materials or []):
            consumed[str(m.item_id)] = consumed.get(str(m.item_id), 0.0) + float(m.qty or 0)
    for m in (po.materials or []):
        m.qty_consumed = consumed.get(str(m.item_id), 0.0)
    po.packed_units = units or []
    return po


async def _next_code(db: AsyncSession) -> str:
    result = await db.execute(select(func.max(PackingOrder.code)))
    last = result.scalar()
    n = 1
    if last and last.startswith("PCK-"):
        try:
            n = int(last.split("-", 1)[1]) + 1
        except (ValueError, IndexError):
            n = 1
    return f"PCK-{n:05d}"


async def _set_attributes(db: AsyncSession, po: PackingOrder, ids: list) -> None:
    if ids is None:
        return
    # Assigning to a relationship collection makes SQLAlchemy load the existing one
    # to diff old against new — a lazy load, which raises MissingGreenlet on an
    # async session. A just-flushed PackingOrder never has it loaded, so populate
    # it explicitly first. (Already-loaded instances from _load skip the refresh.)
    if "attribute_values" in sa_inspect(po).unloaded:
        await db.refresh(po, ["attribute_values"])
    if not ids:
        po.attribute_values = []
        return
    result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(ids)))
    po.attribute_values = list(result.scalars().all())


def _attr_ids(po: PackingOrder) -> list[str]:
    return [str(v.id) for v in (po.attribute_values or [])]


# --- packed units (cartons) ------------------------------------------------
# Declared before /{po_id} so "packed-units" is never swallowed as an order id.

@router.get("/packed-units", response_model=list[PackedUnitResponse])
async def list_packed_units(
    item_id: Optional[uuid.UUID] = None,
    location_id: Optional[uuid.UUID] = None,
    sales_order_id: Optional[uuid.UUID] = None,
    in_stock_only: bool = True,
    limit: int = Query(200, le=1000),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Batch, StockBalance, PackingOrder.code)
        .outerjoin(StockBalance, StockBalance.batch_key == cast(Batch.id, String))
        .outerjoin(PackingOrder, PackingOrder.id == Batch.packing_order_id)
        .options(selectinload(Batch.item))
        .filter(packing_service.packed_unit_filter())
        .order_by(Batch.created_at.desc())
        .limit(limit)
    )
    if item_id:
        query = query.filter(Batch.item_id == item_id)
    if sales_order_id:
        query = query.filter(Batch.packed_for_so_id == sales_order_id)
    if location_id:
        query = query.filter(StockBalance.location_id == location_id)
    if in_stock_only:
        query = query.filter(StockBalance.qty > 0)

    rows = (await db.execute(query)).all()
    # Same per-carton dedupe as _packed_units_for — the balance outerjoin can match
    # more than one row for a batch that has been moved between locations.
    seen = set()
    rows = [r for r in rows if not (r[0].id in seen or seen.add(r[0].id))]
    loc_ids = {bal.location_id for _, bal, _ in rows if bal and bal.location_id}
    loc_names: dict = {}
    if loc_ids:
        locs = await db.execute(select(Location.id, Location.name).filter(Location.id.in_(loc_ids)))
        loc_names = {lid: name for lid, name in locs.all()}

    return [
        PackedUnitResponse(
            id=b.id,
            batch_number=b.batch_number,
            item_id=b.item_id,
            item_name=b.item.name if b.item else None,
            item_code=b.item.code if b.item else None,
            package_no=b.package_no,
            package_label=b.package_label,
            weight_kg=float(b.weight_kg) if b.weight_kg is not None else None,
            qty=float(bal.qty) if bal else 0.0,
            location_id=bal.location_id if bal else None,
            location_name=loc_names.get(bal.location_id) if bal else None,
            packing_order_id=b.packing_order_id,
            packing_order_code=po_code,
            packed_for_so_id=b.packed_for_so_id,
            quality_status=b.quality_status,
            created_at=b.created_at,
        )
        for b, bal, po_code in rows
    ]


@router.get("/packed-units/resolve", response_model=PackedUnitResponse)
async def resolve_packed_unit(
    code: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Scanner lookup: PU-YYYYMMDD-NNNN -> the carton it names."""
    result = await db.execute(
        select(Batch).options(selectinload(Batch.item)).filter(Batch.batch_number == code.strip())
    )
    b = result.scalars().first()
    if not b:
        raise HTTPException(status_code=404, detail=f"No carton found for '{code}'")
    if not packing_service.is_packed_unit(b):
        raise HTTPException(status_code=400, detail=f"{code} is a lot, not a packed carton")

    bal_result = await db.execute(
        select(StockBalance).filter(StockBalance.batch_key == str(b.id), StockBalance.qty > 0).limit(1)
    )
    bal = bal_result.scalars().first()
    po_code = None
    if b.packing_order_id:
        po_code = (await db.execute(
            select(PackingOrder.code).filter(PackingOrder.id == b.packing_order_id)
        )).scalar()
    loc_name = None
    if bal:
        loc_name = (await db.execute(
            select(Location.name).filter(Location.id == bal.location_id)
        )).scalar()

    return PackedUnitResponse(
        id=b.id,
        batch_number=b.batch_number,
        item_id=b.item_id,
        item_name=b.item.name if b.item else None,
        item_code=b.item.code if b.item else None,
        package_no=b.package_no,
        package_label=b.package_label,
        weight_kg=float(b.weight_kg) if b.weight_kg is not None else None,
        qty=float(bal.qty) if bal else 0.0,
        location_id=bal.location_id if bal else None,
        location_name=loc_name,
        packing_order_id=b.packing_order_id,
        packing_order_code=po_code,
        packed_for_so_id=b.packed_for_so_id,
        quality_status=b.quality_status,
        created_at=b.created_at,
    )


# --- packing orders --------------------------------------------------------

@router.get("", response_model=PackingOrderListResponse)
async def list_packing_orders(
    status: Optional[str] = None,
    sales_order_id: Optional[uuid.UUID] = None,
    item_id: Optional[uuid.UUID] = None,
    page: int = 1,
    size: int = 100,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PackingOrder).options(*_load_options())
    count_query = select(func.count(PackingOrder.id))
    if status:
        query = query.filter(PackingOrder.status == status)
        count_query = count_query.filter(PackingOrder.status == status)
    if sales_order_id:
        query = query.filter(PackingOrder.sales_order_id == sales_order_id)
        count_query = count_query.filter(PackingOrder.sales_order_id == sales_order_id)
    if item_id:
        query = query.filter(PackingOrder.item_id == item_id)
        count_query = count_query.filter(PackingOrder.item_id == item_id)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(PackingOrder.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    orders = list(result.scalars().all())
    units = await _packed_units_for(db, [o.id for o in orders])
    for po in orders:
        _decorate(po, units.get(str(po.id), []))
    return PackingOrderListResponse(items=orders, total=total, page=page, size=size)


@router.get("/{po_id}", response_model=PackingOrderResponse)
async def get_packing_order(
    po_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    po = await _load(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    units = await _packed_units_for(db, [po.id])
    return _decorate(po, units.get(str(po.id), []))


@router.post("", response_model=PackingOrderResponse)
async def create_packing_order(
    payload: PackingOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    item = (await db.execute(select(Item).filter(Item.id == payload.item_id))).scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if payload.sales_order_id:
        so = (await db.execute(
            select(SalesOrder).filter(SalesOrder.id == payload.sales_order_id)
        )).scalars().first()
        if not so:
            raise HTTPException(status_code=404, detail="Sales order not found")
    if float(payload.qty_target or 0) <= 0:
        raise HTTPException(status_code=400, detail="Target quantity must be greater than zero")

    code = await _next_code(db)
    po = PackingOrder(
        code=code,
        sales_order_id=payload.sales_order_id,
        sales_order_line_id=payload.sales_order_line_id,
        item_id=payload.item_id,
        color_id=payload.color_id,
        qty_target=payload.qty_target,
        pack_size=payload.pack_size,
        package_label=payload.package_label or "Carton",
        source_location_id=payload.source_location_id,
        output_location_id=payload.output_location_id,
        status="PENDING",
        target_start_date=payload.target_start_date,
        target_end_date=payload.target_end_date,
        notes=payload.notes,
        created_by_id=current_user.id,
    )
    db.add(po)
    await db.flush()

    # Variant identity: inherit from the SO line when packing to order and the
    # caller did not state it. The carton's stock key must match the bulk FG it
    # is packed from, so guessing wrong here would mint cartons into an empty
    # variant pool while the real stock sits untouched.
    attr_ids = list(payload.attribute_value_ids)
    if payload.sales_order_line_id and not attr_ids:
        so_line = (await db.execute(
            select(SalesOrderLine)
            .options(selectinload(SalesOrderLine.attribute_values))
            .filter(SalesOrderLine.id == payload.sales_order_line_id)
        )).scalars().first()
        if so_line:
            attr_ids = [v.id for v in (so_line.attribute_values or [])]
            if not po.color_id:
                po.color_id = so_line.color_id
    await _set_attributes(db, po, attr_ids)

    for m in payload.materials:
        db.add(PackingOrderMaterial(
            packing_order_id=po.id,
            item_id=m.item_id,
            qty_planned=m.qty_planned,
            location_id=m.location_id,
            notes=m.notes,
        ))

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE", entity_type="PackingOrder",
        entity_id=str(po.id), details=f"Created packing order {code} for {item.code}",
    )
    try:
        await manager.broadcast({"type": "PACKING_UPDATE", "id": str(po.id)})
    except Exception:
        pass

    po = await _load(db, po.id)
    return _decorate(po)


@router.put("/{po_id}", response_model=PackingOrderResponse)
async def update_packing_order(
    po_id: uuid.UUID,
    payload: PackingOrderUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    po = await _load(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    if po.status in ("COMPLETED", "CANCELLED") and payload.status not in ("IN_PROGRESS", "PENDING"):
        raise HTTPException(status_code=400, detail=f"Cannot edit a {po.status} packing order")

    for field in ("qty_target", "sales_order_id", "sales_order_line_id", "color_id",
                  "pack_size", "package_label", "source_location_id", "output_location_id",
                  "status", "target_start_date", "target_end_date", "notes"):
        val = getattr(payload, field)
        if val is not None:
            setattr(po, field, val)

    if payload.status == "COMPLETED" and not po.actual_end_date:
        po.actual_end_date = datetime.utcnow()

    if payload.attribute_value_ids is not None:
        await _set_attributes(db, po, payload.attribute_value_ids)

    if payload.materials is not None:
        for old in list(po.materials):
            await db.delete(old)
        await db.flush()
        for m in payload.materials:
            db.add(PackingOrderMaterial(
                packing_order_id=po.id,
                item_id=m.item_id,
                qty_planned=m.qty_planned,
                location_id=m.location_id,
                notes=m.notes,
            ))

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="UPDATE", entity_type="PackingOrder",
        entity_id=str(po.id), details=f"Updated packing order {po.code}",
    )

    po = await _load(db, po_id)
    units = await _packed_units_for(db, [po.id])
    return _decorate(po, units.get(str(po.id), []))


@router.post("/{po_id}/complete", response_model=PackingOrderResponse)
async def add_packing_completion(
    po_id: uuid.UUID,
    payload: PackingCompletionCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    """Log one pack event: consume bulk FG + packaging, mint cartons.

    Note this never auto-closes the order when the target is reached — same rule
    as manufacturing orders, where closure is a deliberate act so a deliberately
    over-packed run is not blocked. `actual_end_date` is stamped on reaching
    target; the user closes the order explicitly.
    """
    po = await _load(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    if po.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot log against a {po.status} packing order")
    if float(payload.qty or 0) <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
    if int(payload.package_count or 0) <= 0:
        raise HTTPException(status_code=400, detail="Package count must be at least 1")
    if not po.source_location_id or not po.output_location_id:
        raise HTTPException(
            status_code=400,
            detail="Packing order needs both a source and an output location before packing",
        )

    attr_ids = _attr_ids(po)
    available = await stock_service.get_stock_balance(
        db, po.item_id, po.source_location_id, attr_ids,
        str(payload.source_batch_id) if payload.source_batch_id else "",
        color_id=po.color_id,
    )
    if available + 1e-6 < float(payload.qty):
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock at source — have {available}, need {float(payload.qty)}",
        )

    completion = PackingCompletion(
        packing_order_id=po.id,
        qty=payload.qty,
        package_count=payload.package_count,
        source_batch_id=payload.source_batch_id,
        operator=payload.operator or current_user.username,
        notes=payload.notes,
        completed_at=datetime.utcnow(),
    )
    db.add(completion)
    await db.flush()

    # Packaging materials: explicit lines, else the plan pro-rated by this qty.
    mat_payload = payload.materials
    if mat_payload is None:
        ratio = float(payload.qty) / float(po.qty_target or payload.qty or 1)
        mats = [
            PackingCompletionMaterial(
                completion_id=completion.id,
                item_id=m.item_id,
                qty=round(float(m.qty_planned or 0) * ratio, 4),
                location_id=m.location_id,
            )
            for m in (po.materials or [])
            if float(m.qty_planned or 0) > 0
        ]
    else:
        mats = [
            PackingCompletionMaterial(
                completion_id=completion.id,
                item_id=m.item_id,
                qty=m.qty,
                location_id=m.location_id,
                batch_id=m.batch_id,
            )
            for m in mat_payload
        ]
    for m in mats:
        db.add(m)
    await db.flush()

    try:
        await packing_service.mint_packed_units(
            db, po, completion,
            qty=float(payload.qty),
            package_count=int(payload.package_count),
            attribute_value_ids=attr_ids,
            color_id=po.color_id,
            username=completion.operator,
            source_batch_id=payload.source_batch_id,
        )
        await packing_service.consume_packaging_materials(db, po, mats)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    po = await _load(db, po_id)
    if po.status == "PENDING":
        po.status = "IN_PROGRESS"
        po.actual_start_date = po.actual_start_date or datetime.utcnow()
    if po.qty_packed + 1e-6 >= float(po.qty_target or 0) and not po.actual_end_date:
        po.actual_end_date = datetime.utcnow()
    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="PACK", entity_type="PackingOrder",
        entity_id=str(po_id),
        details=f"Packed {float(payload.qty)} into {int(payload.package_count)} {po.package_label.lower()}(s) on {po.code}",
    )
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "PACKING_UPDATE", "id": str(po_id)})
        await manager.broadcast({"type": "STOCK_UPDATE"})
    except Exception:
        pass

    po = await _load(db, po_id)
    units = await _packed_units_for(db, [po.id])
    return _decorate(po, units.get(str(po.id), []))


@router.post("/{po_id}/card-printed", response_model=PackingOrderResponse)
async def mark_card_printed(
    po_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    po = await _load(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    po.card_printed_at = datetime.utcnow()
    await db.commit()
    po = await _load(db, po_id)
    return _decorate(po)


@router.delete("/{po_id}")
async def delete_packing_order(
    po_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    result = await db.execute(
        select(PackingOrder).options(selectinload(PackingOrder.completions)).filter(PackingOrder.id == po_id)
    )
    po = result.scalars().first()
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    if po.completions:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a packing order that has packed cartons — cancel it instead",
        )

    code = po.code
    await db.delete(po)
    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE", entity_type="PackingOrder",
        entity_id=str(po_id), details=f"Deleted packing order {code}",
    )
    return {"ok": True}
