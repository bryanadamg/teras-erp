from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, String
from sqlalchemy.orm import selectinload, joinedload, aliased
from app.db.session import get_async_db
from app.models.batch import Batch, BatchConsumption
from app.models.manufacturing import MOCompletion
from app.models.item import Item
from app.models.stock_balance import StockBalance
from app.models.location import Location
from app.models.work_order import WorkOrder
from app.models.manufacturing import ManufacturingOrder
from app.models.production_run import ProductionRun
from app.models.sales import SalesOrder
from app.models.goods_receipt import GoodsReceipt, GoodsReceiptLine
from app.models.purchase import PurchaseOrder
from app.schemas import BatchCreate, BatchReject, BatchSplit, BatchDispose, BatchResponse, BatchTraceResponse, BatchConsumptionResponse, BatchTraceBackNode, PaginatedBatchResponse
from app.api.auth import get_current_user, require_permission
from app.models.auth import User
from app.services import audit_service, kpi_service, stock_service
from app.core.ws_manager import manager
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/batches", tags=["batches"])


async def _resolve_gr_origins(db: AsyncSession, batches: list[Batch]) -> None:
    """Populate po_id / po_number on GR-received batches (source_wo_id is None, batch_number starts GR-)."""
    gr_batches = [b for b in batches if not b.source_wo_id and b.batch_number.startswith("GR-")]
    if not gr_batches:
        return
    batch_ids = [b.id for b in gr_batches]
    rows = await db.execute(
        select(GoodsReceiptLine.batch_id, PurchaseOrder.id, PurchaseOrder.po_number)
        .join(GoodsReceipt, GoodsReceipt.id == GoodsReceiptLine.receipt_id)
        .join(PurchaseOrder, PurchaseOrder.id == GoodsReceipt.po_id)
        .filter(GoodsReceiptLine.batch_id.in_(batch_ids))
    )
    po_map: dict = {}
    for batch_id, po_id, po_number in rows.all():
        po_map[batch_id] = {"po_id": po_id, "po_number": po_number}
    for b in gr_batches:
        info = po_map.get(b.id)
        if info:
            for k, v in info.items():
                setattr(b, k, v)


async def _resolve_batch_origins(db: AsyncSession, batches: list[Batch]) -> None:
    """Populate origin lineage (mo / production run / sales order) on beam batches.

    A beam batch carries source_wo_id → WO → MO → (PR, SO). Shared-component MOs have
    sales_order_id=None, so the SO falls back to the MO's Production Run's sales_order_id.
    """
    wo_ids = {b.source_wo_id for b in batches if b.source_wo_id}
    if not wo_ids:
        return
    mo_so = aliased(SalesOrder)   # SO linked directly on the MO
    pr_so = aliased(SalesOrder)   # SO linked on the MO's Production Run
    rows = await db.execute(
        select(
            WorkOrder.id,
            WorkOrder.code,
            ManufacturingOrder.id,
            ManufacturingOrder.code,
            ManufacturingOrder.production_run_id,
            ProductionRun.code,
            ManufacturingOrder.sales_order_id,
            mo_so.po_number,
            ProductionRun.sales_order_id,
            pr_so.po_number,
        )
        .join(ManufacturingOrder, ManufacturingOrder.id == WorkOrder.manufacturing_order_id)
        .outerjoin(ProductionRun, ProductionRun.id == ManufacturingOrder.production_run_id)
        .outerjoin(mo_so, mo_so.id == ManufacturingOrder.sales_order_id)
        .outerjoin(pr_so, pr_so.id == ProductionRun.sales_order_id)
        .filter(WorkOrder.id.in_(wo_ids))
    )
    origin: dict = {}
    for (wo_id, wo_code, mo_id, mo_code, pr_id, pr_code,
         mo_so_id, mo_so_code, pr_so_id, pr_so_code) in rows.all():
        origin[wo_id] = {
            "wo_code": wo_code,
            "mo_id": mo_id,
            "mo_code": mo_code,
            "production_run_id": pr_id,
            "production_run_code": pr_code,
            "sales_order_id": mo_so_id or pr_so_id,
            "sales_order_code": mo_so_code or pr_so_code,
        }
    for b in batches:
        info = origin.get(b.source_wo_id)
        if info:
            for k, v in info.items():
                setattr(b, k, v)


async def _resolve_source_lots(db: AsyncSession, batches: list[Batch]) -> None:
    """Populate source_lots: the immediate upstream lots each batch was made from.

    One level back only. For a beam, its inputs (yarn) are pegged directly with
    output_batch_id = beam.id at BEAMING completion, so a single grouped query
    resolves every beam's raw-material/goods-receipt lot numbers — no N+1. This
    is what surfaces RM-lot provenance to the stager, who owns lot granularity
    when mounting beams onto a weaving WO.
    """
    made_ids = [b.id for b in batches if b.source_wo_id]
    if not made_ids:
        return
    rows = await db.execute(
        select(BatchConsumption.output_batch_id, Batch.batch_number)
        .join(Batch, Batch.id == BatchConsumption.input_batch_id)
        .filter(BatchConsumption.output_batch_id.in_(made_ids))
    )
    lot_map: dict = {}
    for out_id, number in rows.all():
        lot_map.setdefault(out_id, set()).add(number)
    for b in batches:
        if b.source_wo_id:
            b.source_lots = sorted(lot_map.get(b.id, set()))


def _build_batch_number(date_str: str, counter: int) -> str:
    return f"BAT-{date_str}-{str(counter).zfill(4)}"


async def generate_batch_number(db: AsyncSession, prefix: str = "BAT") -> str:
    """Next unique batch number for today: <prefix>-YYYYMMDD-NNNN."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    full_prefix = f"{prefix}-{today}-"
    count_result = await db.execute(
        select(func.count()).select_from(Batch).filter(Batch.batch_number.like(f"{full_prefix}%"))
    )
    n = (count_result.scalar() or 0) + 1
    while True:
        candidate = f"{full_prefix}{str(n).zfill(4)}"
        check = await db.execute(select(Batch.id).filter(Batch.batch_number == candidate).limit(1))
        if check.scalars().first() is None:
            return candidate
        n += 1


@router.post("", response_model=BatchResponse)
async def create_batch(
    payload: BatchCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('inventory.manage')),
):
    item_result = await db.execute(select(Item).filter(Item.id == payload.item_id))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    batch_number = await generate_batch_number(db)

    batch = Batch(
        batch_number=batch_number,
        item_id=payload.item_id,
        notes=payload.notes,
        created_by=current_user.username,
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    batch.item_code = item.code
    batch.item_name = item.name

    await audit_service.log_activity(
        db, current_user.id, "CREATE", "Batch", str(batch.id),
        details=f"Created batch {batch_number} for item {payload.item_id}"
    )
    return batch


async def _enrich_batches(db: AsyncSession, batches: list[Batch], location_id: uuid.UUID | None = None, with_source_lots: bool = False) -> list[Batch]:
    """Attach remaining stock, current location, item code/name and origin lineage.

    A location filter means "lots actually present there" (lot/batch pickers for
    staging and completion pass location_id expecting only selectable options) —
    without this, batches with zero stock at that location still show up.
    """
    keys = [str(b.id) for b in batches]
    remaining_map: dict[str, float] = {}
    location_map: dict[str, tuple] = {}
    if keys:
        bal_q = (
            select(StockBalance.batch_key, func.sum(StockBalance.qty))
            .filter(StockBalance.batch_key.in_(keys))
            .group_by(StockBalance.batch_key)
        )
        if location_id:
            bal_q = bal_q.filter(StockBalance.location_id == location_id)
        bal_res = await db.execute(bal_q)
        remaining_map = {k: float(v or 0) for k, v in bal_res.all()}

        # Current location — beam is a physical unit, always at most one location with qty > 0
        loc_q = (
            select(StockBalance.batch_key, StockBalance.location_id, Location.name)
            .join(Location, Location.id == StockBalance.location_id)
            .filter(StockBalance.batch_key.in_(keys), StockBalance.qty > 0)
        )
        if location_id:
            loc_q = loc_q.filter(StockBalance.location_id == location_id)
        loc_res = await db.execute(loc_q)
        location_map = {row[0]: (row[1], row[2]) for row in loc_res.all()}

    if location_id:
        batches = [b for b in batches if remaining_map.get(str(b.id), 0.0) > 0]

    for b in batches:
        b.remaining = remaining_map.get(str(b.id), 0.0)
        b.location_id, b.location_name = location_map.get(str(b.id), (None, None))
        b.item_code = b.item.code if b.item else None
        b.item_name = b.item.name if b.item else None
    await _resolve_gr_origins(db, list(batches))
    await _resolve_batch_origins(db, list(batches))
    if with_source_lots:
        await _resolve_source_lots(db, list(batches))
    return batches


@router.get("", response_model=list[BatchResponse])
async def list_batches(
    item_id: uuid.UUID | None = Query(None),
    location_id: uuid.UUID | None = Query(None),
    with_source_lots: bool = Query(False, description="Also resolve each batch's immediate upstream (RM) lots — used by the staging picker"),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Raw, uncapped-total lot list — used by lot/batch pickers (staging, WO
    completion, packing) that want "up to limit candidates for this item", not
    a paged table. See list_batches_paginated for the Lot Management page."""
    query = select(Batch).options(joinedload(Batch.item)).order_by(Batch.created_at.desc())
    if item_id:
        query = query.filter(Batch.item_id == item_id)
    result = await db.execute(query.offset(skip).limit(limit))
    batches = result.scalars().all()
    return await _enrich_batches(db, batches, location_id, with_source_lots=with_source_lots)


@router.get("/paginated", response_model=PaginatedBatchResponse)
async def list_batches_paginated(
    item_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None, description="Matches lot number, supplier lot, or item code/name"),
    status: str | None = Query(None, description="'active' (remaining > 0) or 'depleted' (0 remaining); None = all"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Server-paginated Lot Management list — mirrors the {items, total, page, size}
    envelope used by other domains (Items, Stock Ledger, MO/PR) so the shared Pager
    component can drive it."""
    filters = []
    if item_id:
        filters.append(Batch.item_id == item_id)
    if status in ("active", "depleted"):
        # remaining = sum of StockBalance rows keyed by str(batch id). "active" =
        # any positive balance; "depleted" = no positive balance (summed <= 0 or
        # never had a balance row). batch_key is text, so cast Batch.id to match.
        active_keys = (
            select(StockBalance.batch_key)
            .group_by(StockBalance.batch_key)
            .having(func.sum(StockBalance.qty) > 0)
        )
        if status == "active":
            filters.append(cast(Batch.id, String).in_(active_keys))
        else:
            filters.append(cast(Batch.id, String).not_in(active_keys))
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            Batch.id.in_(
                select(Batch.id)
                .join(Item, Item.id == Batch.item_id)
                .filter(
                    Batch.batch_number.ilike(pattern)
                    | Batch.vendor_lot.ilike(pattern)
                    | Item.code.ilike(pattern)
                    | Item.name.ilike(pattern)
                )
            )
        )

    count_query = select(func.count()).select_from(Batch)
    query = select(Batch).options(joinedload(Batch.item)).order_by(Batch.created_at.desc())
    for f in filters:
        count_query = count_query.filter(f)
        query = query.filter(f)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(query.offset((page - 1) * size).limit(size))
    batches = result.scalars().all()
    batches = await _enrich_batches(db, batches)
    return PaginatedBatchResponse(items=batches, total=total, page=page, size=size)


@router.get("/resolve", response_model=BatchResponse)
async def resolve_batch_by_number(
    number: str = Query(..., description="Exact lot/batch number (from a scanned bag QR)"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve a scanned lot number to its enriched batch (remaining, current
    location, item, quality). Powers scan-to-stage — the bag label QR encodes
    the lot number. Exact match; 404 if unknown. Declared before /{batch_id} so
    'resolve' isn't parsed as a UUID path param."""
    result = await db.execute(
        select(Batch).options(joinedload(Batch.item)).filter(Batch.batch_number == number.strip())
    )
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail=f"Lot '{number}' not found")
    enriched = await _enrich_batches(db, [batch])
    return enriched[0]


@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")
    batch.item_code = batch.item.code if batch.item else None
    batch.item_name = batch.item.name if batch.item else None
    await _resolve_gr_origins(db, [batch])
    await _resolve_batch_origins(db, [batch])
    return batch


@router.delete("/{batch_id}")
async def delete_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('inventory.delete')),
):
    result = await db.execute(select(Batch).filter(Batch.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")

    await db.delete(batch)
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "DELETE", "Batch", str(batch_id),
        details=f"Deleted batch {batch.batch_number}"
    )
    await manager.broadcast({"type": "STOCK_UPDATE"})
    return {"status": "success"}


async def _batch_remaining(db: AsyncSession, batch_id) -> float:
    return float((await db.execute(
        select(func.sum(StockBalance.qty)).filter(StockBalance.batch_key == str(batch_id), StockBalance.qty > 0)
    )).scalar() or 0.0)


async def _move_batch_stock(db: AsyncSession, *, item_id, src_batch_id, dst_batch_id, qty: float, reference_type: str, reference_id: str) -> float:
    """Move up to ``qty`` of on-hand from one lot to another, preserving each
    source row's location and variant (variant ids recovered from the balance
    row's variant_key). Two-sided per row so the balance table stays consistent.
    Returns kg actually moved. Shared by QC reject (→ REJECTED sub-lot) and lot
    split (→ new GOOD sub-lot)."""
    rows = (await db.execute(
        select(StockBalance)
        .filter(StockBalance.batch_key == str(src_batch_id), StockBalance.qty > 0)
        .order_by(StockBalance.qty.desc())
    )).scalars().all()
    to_move = float(qty)
    moved = 0.0
    for r in rows:
        if to_move <= 1e-9:
            break
        portion = min(float(r.qty), to_move)
        ids = [uuid.UUID(x) for x in (r.variant_key or "").split(",") if x]
        await stock_service.add_stock_entry(
            db, item_id=item_id, location_id=r.location_id, qty_change=-portion,
            reference_type=reference_type, reference_id=reference_id,
            attribute_value_ids=ids, batch_id=src_batch_id,
        )
        await stock_service.add_stock_entry(
            db, item_id=item_id, location_id=r.location_id, qty_change=portion,
            reference_type=reference_type, reference_id=reference_id,
            attribute_value_ids=ids, batch_id=dst_batch_id,
        )
        to_move -= portion
        moved += portion
    return moved


@router.post("/{batch_id}/split", response_model=BatchResponse)
async def split_batch(
    batch_id: uuid.UUID,
    payload: BatchSplit,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('inventory.manage')),
):
    """Peel ``qty`` off a GOOD lot into a new GOOD sub-lot (``{orig}-S{n}``) at the
    same location/variant, leaving the original with the remainder. Both stay
    GOOD/active. The sub-lot copies ``source_wo_id`` so its production origin
    (e.g. the weaving WO) still traces. Used when only part of a physical bag is
    staged/consumed and the rest goes back to stock as its own trackable bag."""
    result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")
    if batch.quality_status == "REJECTED":
        raise HTTPException(status_code=400, detail="Cannot split a rejected lot")

    qty = float(payload.qty or 0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Split qty must be positive")
    remaining = await _batch_remaining(db, batch.id)
    if qty >= remaining - 1e-9:
        raise HTTPException(status_code=400, detail=f"Split qty {qty:g} must be less than remaining {remaining:g}")

    seq = (await db.execute(
        select(func.count()).select_from(Batch).filter(Batch.batch_number.like(f"{batch.batch_number}-S%"))
    )).scalar() or 0
    reason = (payload.reason or "").strip() or None
    sub = Batch(
        batch_number=f"{batch.batch_number}-S{seq + 1}",
        item_id=batch.item_id,
        quality_status="GOOD",
        source_wo_id=batch.source_wo_id,
        ends=batch.ends,
        notes=(f"Split from {batch.batch_number}" + (f": {reason}" if reason else "")),
        created_by=current_user.username,
    )
    db.add(sub)
    await db.flush()

    moved = await _move_batch_stock(
        db, item_id=batch.item_id, src_batch_id=batch.id, dst_batch_id=sub.id,
        qty=qty, reference_type="Split", reference_id=sub.batch_number,
    )
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "SPLIT", "Batch", str(batch.id),
        details=f"Split {moved:g} off lot {batch.batch_number} → new lot {sub.batch_number}"
        + (f": {reason}" if reason else ""),
    )
    await manager.broadcast({"type": "STOCK_UPDATE"})

    reloaded = (await db.execute(
        select(Batch).options(joinedload(Batch.item)).filter(Batch.id == sub.id)
    )).scalars().first()
    return (await _enrich_batches(db, [reloaded]))[0]


@router.post("/{batch_id}/reject", response_model=BatchResponse)
async def reject_batch(
    batch_id: uuid.UUID,
    payload: BatchReject,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('inventory.manage')),
):
    """QC-reject a lot. The lot stays physically in stock but is flagged
    REJECTED — excluded from good-stock netting and consumption pickers. If
    the lot was born from a production completion, that completion stops
    counting toward MO/WO progress and the MO reopens if it had
    auto-completed; rework is a new WO created manually."""
    result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")
    if batch.quality_status == "REJECTED":
        raise HTTPException(status_code=400, detail="Lot is already rejected")

    reason = (payload.reason or "").strip() or None

    # Current on-hand across every balance row keyed to this lot.
    bal_rows = (await db.execute(
        select(StockBalance)
        .filter(StockBalance.batch_key == str(batch.id), StockBalance.qty > 0)
        .order_by(StockBalance.qty.desc())
    )).scalars().all()
    remaining = sum(float(r.qty) for r in bal_rows)

    reject_qty = payload.qty
    if reject_qty is not None:
        if reject_qty <= 0:
            raise HTTPException(status_code=400, detail="Reject qty must be positive")
        if reject_qty > remaining + 1e-9:
            raise HTTPException(status_code=400, detail=f"Reject qty {reject_qty:g} exceeds remaining {remaining:g}")
    # Whole-lot reject when no qty given or it covers the entire remaining balance.
    partial = reject_qty is not None and reject_qty < remaining - 1e-9

    sub = None
    if partial:
        # Split: move reject_qty into a new REJECTED sub-lot (same item/location/
        # variant), leaving the original lot GOOD/active for the good remainder.
        seq = (await db.execute(
            select(func.count()).select_from(Batch).filter(Batch.batch_number.like(f"{batch.batch_number}-R%"))
        )).scalar() or 0
        sub = Batch(
            batch_number=f"{batch.batch_number}-R{seq + 1}",
            item_id=batch.item_id,
            quality_status="REJECTED",
            source_wo_id=batch.source_wo_id,
            notes=(f"QC reject of {batch.batch_number}" + (f": {reason}" if reason else "")),
            created_by=current_user.username,
        )
        db.add(sub)
        await db.flush()
        await _move_batch_stock(
            db, item_id=batch.item_id, src_batch_id=batch.id, dst_batch_id=sub.id,
            qty=float(reject_qty), reference_type="QC_REJECT", reference_id=sub.batch_number,
        )
    else:
        batch.quality_status = "REJECTED"

    # Producing completion (if any): return the rejected qty to MO progress.
    comp = (await db.execute(
        select(MOCompletion).filter(
            MOCompletion.output_batch_id == batch.id,
            MOCompletion.rejected == False,  # noqa: E712
        )
    )).scalars().first()
    mo = None
    returned = 0.0
    if comp:
        if partial:
            # Reduce the good qty this completion contributes; every MO/WO progress
            # sum is sum(qty_completed where not rejected), so trimming this value
            # rolls the rejected qty straight back into the shortfall.
            returned = min(float(reject_qty), float(comp.qty_completed))
            comp.qty_completed = float(comp.qty_completed) - returned
            comp.reject_reason = reason
            if float(comp.qty_completed) <= 1e-9:
                comp.rejected = True
                comp.rejected_at = datetime.utcnow()
                comp.rejected_by = current_user.username
        else:
            returned = float(comp.qty_completed)
            comp.rejected = True
            comp.reject_reason = reason
            comp.rejected_at = datetime.utcnow()
            comp.rejected_by = current_user.username
        await db.flush()

        mo = (await db.execute(
            select(ManufacturingOrder).filter(ManufacturingOrder.id == comp.mo_id)
        )).scalars().first()
        if mo:
            total_good = float((await db.execute(
                select(func.sum(MOCompletion.qty_completed))
                .filter(MOCompletion.mo_id == mo.id, MOCompletion.rejected == False)  # noqa: E712
            )).scalar() or 0)
            if mo.status == "COMPLETED" and total_good < float(mo.qty):
                mo.status = "IN_PROGRESS"
                mo.actual_end_date = None

    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "REJECT", "Batch", str(batch.id),
        details=(f"Rejected {reject_qty:g} of lot {batch.batch_number} → sub-lot {sub.batch_number}" if partial
                 else f"Rejected lot {batch.batch_number}")
        + (f" ({returned:g} returned to {mo.code})" if comp and mo and returned else "")
        + (f": {reason}" if reason else ""),
    )
    await manager.broadcast({"type": "STOCK_UPDATE"})
    if mo:
        await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": str(mo.id), "status": mo.status, "code": mo.code})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    batch.item_code = batch.item.code if batch.item else None
    batch.item_name = batch.item.name if batch.item else None
    return batch


@router.post("/{batch_id}/dispose", response_model=BatchResponse)
async def dispose_batch(
    batch_id: uuid.UUID,
    payload: BatchDispose | None = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('inventory.manage')),
):
    """Dispose/scrap a REJECTED lot: physically write off its remaining stock
    (posts every balance row OUT so the qty leaves stock-on-hand) and mark the
    lot DISPOSED. Only rejected lots can be disposed — reject first. Mirrors the
    consumed-beam write-off. Irreversible."""
    result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")
    if batch.quality_status != "REJECTED":
        raise HTTPException(status_code=400, detail="Only rejected lots can be disposed")

    reason = (payload.reason if payload else None) or None
    reason = reason.strip() or None if reason else None

    # Post out every balance row keyed to this lot (preserving each row's
    # location + variant), moving exactly the on-hand so it can't go negative.
    rows = (await db.execute(
        select(StockBalance)
        .filter(StockBalance.batch_key == str(batch.id), StockBalance.qty > 0)
    )).scalars().all()
    disposed = 0.0
    for r in rows:
        portion = float(r.qty)
        ids = [uuid.UUID(x) for x in (r.variant_key or "").split(",") if x]
        await stock_service.add_stock_entry(
            db, item_id=batch.item_id, location_id=r.location_id, qty_change=-portion,
            reference_type="QC Dispose", reference_id=batch.batch_number,
            attribute_value_ids=ids, batch_id=batch.id,
        )
        disposed += portion

    batch.quality_status = "DISPOSED"
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "DISPOSE", "Batch", str(batch.id),
        details=f"Disposed rejected lot {batch.batch_number} ({disposed:g} written off)"
        + (f": {reason}" if reason else ""),
    )
    await manager.broadcast({"type": "STOCK_UPDATE"})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    batch.item_code = batch.item.code if batch.item else None
    batch.item_name = batch.item.name if batch.item else None
    return batch


@router.get("/{batch_id}/trace", response_model=BatchTraceResponse)
async def trace_batch_forward(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Forward traceability: raw material batch → finished goods batches produced with it."""
    batch_result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = batch_result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")
    batch.item_code = batch.item.code if batch.item else None
    batch.item_name = batch.item.name if batch.item else None

    consumptions_result = await db.execute(
        select(BatchConsumption).filter(BatchConsumption.input_batch_id == batch_id)
    )
    consumptions = consumptions_result.scalars().all()

    # Resolve MO codes and output batch numbers
    mo_ids = [c.manufacturing_order_id for c in consumptions]
    out_batch_ids = [c.output_batch_id for c in consumptions if c.output_batch_id]

    mo_code_map: dict = {}
    if mo_ids:
        mo_rows = await db.execute(
            select(ManufacturingOrder.id, ManufacturingOrder.code)
            .filter(ManufacturingOrder.id.in_(mo_ids))
        )
        mo_code_map = {str(r[0]): r[1] for r in mo_rows.all()}

    out_batch_map: dict = {}
    if out_batch_ids:
        out_rows = await db.execute(
            select(Batch.id, Batch.batch_number)
            .filter(Batch.id.in_(out_batch_ids))
        )
        out_batch_map = {str(r[0]): r[1] for r in out_rows.all()}

    enriched = []
    for c in consumptions:
        resp = BatchConsumptionResponse.model_validate(c)
        resp.mo_code = mo_code_map.get(str(c.manufacturing_order_id))
        if c.output_batch_id:
            resp.output_batch_number = out_batch_map.get(str(c.output_batch_id))
        enriched.append(resp)

    return BatchTraceResponse(
        batch=BatchResponse.model_validate(batch),
        consumptions=enriched,
    )


@router.get("/{batch_id}/trace-back", response_model=BatchTraceBackNode)
async def trace_batch_backward(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Backward genealogy: finished batch → input batches it was made from, recursively."""
    from app.models.manufacturing import ManufacturingOrder

    batch_result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = batch_result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")

    async def build_node(b: Batch, depth: int, visited: set) -> dict:
        b.item_code = b.item.code if b.item else None
        b.item_name = b.item.name if b.item else None
        node = {"batch": BatchResponse.model_validate(b), "inputs": []}
        if depth >= 8:
            return node
        cons_result = await db.execute(
            select(BatchConsumption).filter(BatchConsumption.output_batch_id == b.id)
        )
        cons_rows = list(cons_result.scalars().all())
        # Beam-merge consumptions are pegged at MO level (output_batch_id NULL)
        # because beams are consumed at weaving WO start, before any output lot
        # exists — attach them here via this batch's producing WO's MO.
        if b.source_wo_id:
            mo_id = (
                await db.execute(
                    select(WorkOrder.manufacturing_order_id).where(WorkOrder.id == b.source_wo_id)
                )
            ).scalar()
            if mo_id:
                extra = await db.execute(
                    select(BatchConsumption).filter(
                        BatchConsumption.manufacturing_order_id == mo_id,
                        BatchConsumption.output_batch_id.is_(None),
                    )
                )
                cons_rows += list(extra.scalars().all())
        for c in cons_rows:
            key = str(c.input_batch_id)
            if key in visited:
                continue
            visited.add(key)
            in_result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == c.input_batch_id))
            in_batch = in_result.scalars().first()
            if not in_batch:
                continue
            child = await build_node(in_batch, depth + 1, visited)
            child["qty_consumed"] = float(c.qty_consumed)
            child["manufacturing_order_id"] = c.manufacturing_order_id
            mo_so = aliased(SalesOrder)
            pr_so = aliased(SalesOrder)
            mo_result = await db.execute(
                select(ManufacturingOrder.code, mo_so.po_number, pr_so.po_number)
                .outerjoin(ProductionRun, ProductionRun.id == ManufacturingOrder.production_run_id)
                .outerjoin(mo_so, mo_so.id == ManufacturingOrder.sales_order_id)
                .outerjoin(pr_so, pr_so.id == ProductionRun.sales_order_id)
                .filter(ManufacturingOrder.id == c.manufacturing_order_id)
            )
            mo_row = mo_result.first()
            if mo_row:
                child["mo_code"] = mo_row[0]
                child["sales_order_code"] = mo_row[1] or mo_row[2]
            node["inputs"].append(child)
        return node

    return await build_node(batch, 0, {str(batch.id)})
