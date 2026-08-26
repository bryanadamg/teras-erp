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
    PackingCompletionCreate, PackedUnitResponse, PackingCompletionLotPayload,
    PackingCompletionReject,
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
from app.models.routing import WorkCenter
from app.api.auth import get_current_user, require_permission
from app.models.auth import User
from app.services import (
    audit_service, kpi_service, stock_service, packing_service, so_fulfilment_service,
    reject_service, quarantine_service, numbering_service,
)
from app.core.ws_manager import manager
from app.core.pagination import PageParams, PageWindow

router = APIRouter(prefix="/packing", tags=["packing"])


# --- helpers ---------------------------------------------------------------

def _load_options():
    return (
        selectinload(PackingOrder.sales_order),
        selectinload(PackingOrder.sales_order_line),
        selectinload(PackingOrder.item),
        selectinload(PackingOrder.attribute_values),
        selectinload(PackingOrder.materials).selectinload(PackingOrderMaterial.item),
        selectinload(PackingOrder.completions).selectinload(PackingCompletion.source_batch),
        selectinload(PackingOrder.completions).selectinload(PackingCompletion.work_center),
        selectinload(PackingOrder.work_center),
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
                packing_completion_id=batch.packing_completion_id,
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
        po.customer_po_ref = po.sales_order.customer_po_ref
        po.customer_name = po.sales_order.customer_name
    # Alt-unit conversion + stock note ride along from the ordered line: the
    # carton label prints pieces (carton_qty / uom2_factor), not just base qty.
    if po.sales_order_line:
        po.uom2 = po.sales_order_line.uom2
        po.uom2_factor = float(po.sales_order_line.uom2_factor) if po.sales_order_line.uom2_factor is not None else None
        po.ket_stock = po.sales_order_line.ket_stock
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
    """Next `PCK-NNNNN` off the packing-order number range.

    max(code)+1 raced: two packers creating orders at once read the same maximum
    and minted the same code. The range row serializes the allocation; the seed
    below only runs once, to continue from codes that predate it."""
    async def _seed() -> int:
        # func.max() on the code column is a STRING max, so a code not zero-padded
        # to the current width can outrank the real numeric max (e.g. "PCK-003" >
        # "PCK-00144" lexicographically). Parse every candidate, take the numeric max.
        codes = (await db.execute(select(PackingOrder.code))).scalars().all()
        best = 0
        for c in codes:
            if c and c.startswith("PCK-"):
                try:
                    best = max(best, int(c.split("-", 1)[1]))
                except (ValueError, IndexError):
                    continue
        return best

    async def _taken(code: str) -> bool:
        return (await db.execute(
            select(PackingOrder.id).filter(PackingOrder.code == code).limit(1)
        )).scalars().first() is not None

    _, code = await numbering_service.allocate_code(
        db, "PACKING_ORDER", lambda n: f"PCK-{n:05d}", seed=_seed, exists=_taken,
    )
    return code


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


async def _assert_work_center(db: AsyncSession, wc_id) -> None:
    """A named machine must exist. Deliberately not restricted to `node_type ==
    MACHINE`: a packing order may be dispatched to a GROUP/TYPE row before the
    planner knows which machine runs it, exactly as a WO can be."""
    if not wc_id:
        return
    wc = (await db.execute(select(WorkCenter).filter(WorkCenter.id == wc_id))).scalars().first()
    if not wc:
        raise HTTPException(status_code=404, detail="Work center not found")


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
    window: PageWindow = Depends(PageParams(default_size=100)),
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
    result = await db.execute(window.apply(query.order_by(PackingOrder.created_at.desc())))
    orders = list(result.scalars().all())
    units = await _packed_units_for(db, [o.id for o in orders])
    for po in orders:
        _decorate(po, units.get(str(po.id), []))
    return window.envelope(orders, total)


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
    await _assert_work_center(db, payload.work_center_id)

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
        work_center_id=payload.work_center_id,
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
        # A new open order claims this (item, source location) for Quarantine
        # Packing's lock — same "changes what's packable" reasoning as a
        # quarantine disposition, so it rides the same 'stock' WS kind.
        await manager.broadcast({"type": "STOCK_UPDATE"})
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

    await _assert_work_center(db, payload.work_center_id)

    for field in ("qty_target", "sales_order_id", "sales_order_line_id", "color_id",
                  "pack_size", "package_label", "source_location_id", "output_location_id",
                  "work_center_id", "status", "target_start_date", "target_end_date", "notes"):
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
    try:
        await manager.broadcast({"type": "PACKING_UPDATE", "id": str(po.id)})
        # Status/qty/location edits (cancelling included) change whether this
        # order still claims its (item, source location) — see the create path.
        await manager.broadcast({"type": "STOCK_UPDATE"})
    except Exception:
        pass

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

    Two shapes of payload:

    * ``lots`` — the normal path. One source lot per entry, exactly like a WO
      staging line. **One `PackingCompletion` row is written per lot**, so each
      keeps a truthful `source_batch_id` and its own carton range, and each lot's
      variant is read off its own `StockBalance` row instead of the order stating
      a variant that might disagree with the stock.
    * ``qty`` + optional ``source_batch_id`` — the single-event path, used by the
      mobile packing scanner and non-lot-tracked FG. The variant then comes from
      the order, or is derived from the un-lotted stock at the source location.

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
    if not po.source_location_id or not po.output_location_id:
        raise HTTPException(
            status_code=400,
            detail="Packing order needs both a source and an output location before packing",
        )

    await _assert_work_center(db, payload.work_center_id)

    lots = list(payload.lots or [])
    if lots:
        if any(float(l.qty or 0) <= 0 for l in lots):
            raise HTTPException(status_code=400, detail="Every selected lot needs a quantity greater than zero")
    else:
        if float(payload.qty or 0) <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        if int(payload.package_count or 0) <= 0:
            raise HTTPException(status_code=400, detail="Package count must be at least 1")
        # Fold the single-event path into the same loop so there is one code path
        # minting cartons; batch_id stays None for non-lot-tracked FG.
        lots = [PackingCompletionLotPayload(
            batch_id=payload.source_batch_id,
            qty=payload.qty,
            package_count=payload.package_count,
        )] if payload.source_batch_id else [None]

    # QC hold gate. Packing pulls straight out of the quarantine location, so the
    # release check belongs here rather than on a transfer. Checked up front for
    # the whole submission — a partial pack that stops halfway through the lot
    # list would leave cartons minted against a held batch. No-op when the source
    # is a normal store.
    try:
        await quarantine_service.assert_lots_released(
            db,
            source_location_id=po.source_location_id,
            item_id=po.item_id,
            batch_ids=[(l.batch_id if l else None) for l in lots],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    def _box_size(stated_count: Optional[int], qty: float) -> float:
        """Resolve the fixed box size driving this lot's carton split.

        A payload-level `box_size` (the bulk-log path) wins; a legacy explicit
        `package_count` reconstructs the exact box size it implies, so older
        callers (the mobile scanner, which still states a carton count) keep
        their existing behavior unchanged. Otherwise falls back to the order's
        own `pack_size`.
        """
        if payload.box_size:
            return float(payload.box_size)
        if stated_count:
            return qty / max(1, int(stated_count))
        return float(po.pack_size or 0)

    lot_qtys = [float(lot.qty) if lot else float(payload.qty) for lot in lots]

    # An explicit, user-edited box list spans the whole event (every lot
    # combined) and wins over box_size entirely — a box that doesn't fit in
    # one lot's draw splits across the lot boundary rather than being
    # rejected, since the packer edited the list without regard to lot lines.
    per_lot_cartons: Optional[list[list[tuple[float, Optional[float]]]]] = None
    if payload.boxes:
        try:
            per_lot_cartons = packing_service.allocate_boxes_to_lots(
                lot_qtys,
                [float(b) for b in payload.boxes],
                weights=list(payload.box_weights) if payload.box_weights else None,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    completions: list[PackingCompletion] = []
    all_mats: list[PackingCompletionMaterial] = []
    box_breakdown: list[float] = []
    for idx, lot in enumerate(lots):
        lot_qty = lot_qtys[idx]
        batch_id = lot.batch_id if lot else None
        if per_lot_cartons is not None:
            carton_qtys = per_lot_cartons[idx]
        else:
            # No explicit box list (mobile scanner / box-size path) — nothing was
            # weighed, so every carton is minted with no net weight.
            box_size = _box_size(lot.package_count if lot else payload.package_count, lot_qty)
            carton_qtys = [(q, None) for q in packing_service.split_qty(lot_qty, box_size)]

        try:
            if batch_id:
                attr_ids, color_id, available = await packing_service.resolve_lot_variant(db, po, batch_id)
            else:
                attr_ids, color_id = await packing_service.resolve_bulk_variant(db, po)
                available = await stock_service.get_stock_balance(
                    db, po.item_id, po.source_location_id, attr_ids, "", color_id=color_id,
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if available + 1e-6 < lot_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock at source — have {available}, need {lot_qty}",
            )

        completion = PackingCompletion(
            packing_order_id=po.id,
            qty=lot_qty,
            # Overwritten by mint_packed_units below, once the real split is known.
            package_count=0,
            source_batch_id=batch_id,
            # Falls back to the order's machine rather than staying null: every
            # per-machine aggregate reads this column, and a picker the packer
            # skipped must not erase where the work actually happened. Same fix
            # MOCompletion needed for the weaving monitor.
            work_center_id=payload.work_center_id or po.work_center_id,
            operator=payload.operator or current_user.username,
            notes=payload.notes,
            completed_at=datetime.utcnow(),
        )
        db.add(completion)
        await db.flush()
        completions.append(completion)

        # Packaging materials: explicit lines (first lot only — they describe the
        # whole submission), else the plan pro-rated by this lot's qty.
        if payload.materials is not None:
            mats = [
                PackingCompletionMaterial(
                    completion_id=completion.id,
                    item_id=m.item_id,
                    qty=m.qty,
                    location_id=m.location_id,
                    batch_id=m.batch_id,
                )
                for m in payload.materials
            ] if idx == 0 else []
        else:
            ratio = lot_qty / float(po.qty_target or lot_qty or 1)
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
        for m in mats:
            db.add(m)
        await db.flush()
        all_mats.extend(mats)

        try:
            units = await packing_service.mint_packed_units(
                db, po, completion,
                carton_qtys=carton_qtys,
                attribute_value_ids=[str(a) for a in attr_ids],
                color_id=color_id,
                username=completion.operator,
                source_batch_id=batch_id,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        box_breakdown.extend(carton_qty for _, carton_qty in units)

    try:
        await packing_service.consume_packaging_materials(db, po, all_mats)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    total_qty = sum(float(c.qty) for c in completions)
    total_cartons = sum(int(c.package_count) for c in completions)

    po = await _load(db, po_id)
    if po.status == "PENDING":
        po.status = "IN_PROGRESS"
        po.actual_start_date = po.actual_start_date or datetime.utcnow()
    if po.qty_packed + 1e-6 >= float(po.qty_target or 0) and not po.actual_end_date:
        po.actual_end_date = datetime.utcnow()
    await db.commit()

    # Cartons now sit in stock against the SO line, which is what makes the order
    # shippable — re-derive the SO status (PENDING -> READY when every line is
    # covered). Packing to stock has no sales_order_id and is a no-op here.
    if po.sales_order_id:
        if await so_fulfilment_service.recompute_so_status(db, po.sales_order_id):
            await db.commit()
            await manager.broadcast({"type": "SALES_ORDER_UPDATE", "id": str(po.sales_order_id)})

    # Read the name back off the DB rather than the just-committed completion
    # rows: `_load` expires the identity map, so touching a relationship on one
    # of them would lazy-load inside an async session.
    machine_id = payload.work_center_id or po.work_center_id
    machine_name = (await db.execute(
        select(WorkCenter.name).filter(WorkCenter.id == machine_id)
    )).scalars().first() if machine_id else None
    lot_note = f" from {len(completions)} lots" if len(completions) > 1 else ""
    breakdown = packing_service.describe_box_breakdown(box_breakdown)
    breakdown_note = f" ({breakdown})" if len(set(round(q, 4) for q in box_breakdown)) > 1 else ""
    await audit_service.log_activity(
        db, user_id=current_user.id, action="PACK", entity_type="PackingOrder",
        entity_id=str(po_id),
        details=(
            f"Packed {total_qty} into {total_cartons} {po.package_label.lower()}(s)"
            f"{breakdown_note}{lot_note} on {po.code}"
            + (f" @ {machine_name}" if machine_name else "")
        ),
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


@router.post("/{po_id}/completions/{completion_id}/reject", response_model=PackingOrderResponse)
async def reject_packing_completion(
    po_id: uuid.UUID,
    completion_id: uuid.UUID,
    payload: PackingCompletionReject,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    """QC-reject cartons produced by one pack event — the packing-side mirror of
    the WO completion reject.

    Each rejected carton (a `Batch` row) is flagged and its stock is moved into the
    defect store resolved by `reject_service` (payload override → the FG item's
    `default_reject_location_id`; packing has no work center to route through). The
    rejected qty leaves `qty_packed` and lands on `qty_rejected`, so an order that
    had reached target reopens — closure stays a deliberate act.

    Reject the whole event by omitting `packed_unit_ids`; name cartons to reject
    only those (partial), which keeps the log active for its good cartons.
    """
    po = await _load(db, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    comp = next((c for c in (po.completions or []) if str(c.id) == str(completion_id)), None)
    if not comp:
        raise HTTPException(status_code=404, detail="Completion not found on this packing order")
    if comp.rejected:
        raise HTTPException(status_code=400, detail="Completion is already rejected")

    # Cartons minted by this event that are still good.
    units = (await db.execute(
        select(Batch).filter(Batch.packing_completion_id == comp.id)
    )).scalars().all()
    good_units = [b for b in units if not reject_service.is_reject_grade(b.quality_status)
                  and b.quality_status != reject_service.DISPOSED]
    if payload.packed_unit_ids:
        wanted = {str(x) for x in payload.packed_unit_ids}
        targets = [b for b in good_units if str(b.id) in wanted]
        missing = wanted - {str(b.id) for b in targets}
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"{len(missing)} carton(s) are not good cartons of this pack event",
            )
    else:
        targets = good_units
    whole = len(targets) >= len(good_units)

    grade = reject_service.normalize_grade(payload.usable)
    reject_loc = await reject_service.resolve_reject_location(
        db, item_id=po.item_id, explicit=payload.reject_location_id,
    )

    # Carton qty is never stored on the Batch — it lives in the StockBalance row
    # keyed by the carton, so the rejected qty is read from there before moving it.
    qty_rejected = 0.0
    for b in targets:
        on_hand = float((await db.execute(
            select(func.coalesce(func.sum(StockBalance.qty), 0))
            .filter(StockBalance.batch_key == str(b.id))
        )).scalar() or 0)
        b.quality_status = grade
        qty_rejected += on_hand
        await reject_service.quarantine_lot(
            db, item_id=b.item_id, batch_id=b.id,
            location_id=reject_loc, reference_id=b.batch_number,
        )
    # An already-dispatched/consumed carton has no stock left; fall back to the
    # logged qty pro-rated per carton so the scrap record is never zero.
    if qty_rejected <= 1e-9 and targets:
        per_carton = float(comp.qty or 0) / max(1, int(comp.package_count or len(targets)))
        qty_rejected = per_carton * len(targets)

    comp.qty_rejected = float(comp.qty_rejected or 0) + qty_rejected
    comp.package_count_rejected = int(comp.package_count_rejected or 0) + len(targets)
    comp.reject_reason = (payload.reason or "").strip() or None
    comp.rejected_at = datetime.utcnow()
    comp.rejected_by = current_user.username
    comp.reject_location_id = reject_loc
    if whole:
        # Whole event: drops out of qty_packed entirely (mirrors MOCompletion).
        comp.rejected = True
    else:
        # Partial: the log stays active for its good cartons, so trim qty the same
        # way the lot-level partial reject trims a WO completion.
        comp.qty = max(0.0, float(comp.qty or 0) - qty_rejected)
        comp.package_count = max(0, int(comp.package_count or 0) - len(targets))
    await db.flush()

    # Reopen: packed progress just dropped, so an order that had hit target is no
    # longer fulfilled. Never auto-closes on qty, never auto-closes off it either.
    po = await _load(db, po_id)
    if po.actual_end_date and po.qty_packed + 1e-6 < float(po.qty_target or 0):
        po.actual_end_date = None
        if po.status == "COMPLETED":
            po.status = "IN_PROGRESS"
    await db.commit()

    if po.sales_order_id:
        if await so_fulfilment_service.recompute_so_status(db, po.sales_order_id):
            await db.commit()
            await manager.broadcast({"type": "SALES_ORDER_UPDATE", "id": str(po.sales_order_id)})

    loc_name = await reject_service.location_name(db, reject_loc)
    await audit_service.log_activity(
        db, user_id=current_user.id, action="REJECT", entity_type="PackingOrder",
        entity_id=str(po_id),
        details=f"QC rejected {len(targets)} {po.package_label.lower()}(s) ({qty_rejected:g}) on {po.code}"
        + (" [usable]" if payload.usable else "")
        + (f" → {loc_name}" if loc_name else "")
        + (f": {comp.reject_reason}" if comp.reject_reason else ""),
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
    try:
        await manager.broadcast({"type": "PACKING_UPDATE", "id": str(po_id)})
        # Frees this order's (item, source location) claim — the whole reason
        # Quarantine Packing's lot lock exists is to reverse the moment this
        # happens, so it needs to reach the same 'stock' WS kind that page reads.
        await manager.broadcast({"type": "STOCK_UPDATE"})
    except Exception:
        pass
    return {"ok": True}
