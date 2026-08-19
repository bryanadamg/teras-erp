from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from app.db.session import get_async_db, get_db
from app.services import stock_service, audit_service, kpi_service
from app.core.ws_manager import manager
from app.core.pagination import PageParams, PageWindow
from app.schemas import StockLedgerResponse, StockBalanceResponse, PaginatedStockLedgerResponse, StockEntryCreate, StockTransferCreate, StockBulkTransferCreate, BookingStockRow, BookingDemandMO, BookingSupplyMO, PaginatedBookingStockResponse
from app.models.auth import User
from app.api.auth import get_current_user, require_permission, require_any_permission, get_current_admin, category_scope_ok
from app.models.item import Item
from app.models.location import Location
from app.models.stock_balance import StockBalance
from app.models.audit import AuditLog
from app.models.work_order import WorkOrder
from app.models.goods_receipt import GoodsReceipt
from app.models.purchase import PurchaseOrder
from datetime import datetime
from typing import Optional
import asyncio as _asyncio
import time
import uuid as _uuid

# reference_types whose reference_id is a raw entity UUID (str(entity.id)) rather
# than a human-readable code — these need a resolved label for display.
_WO_REF_TYPES = {"Staging", "Leftover Beam", "Beam Merge", "Work Order"}

router = APIRouter()

# reference_type vocabulary is a handful of fixed strings stamped by services when
# they write ledger rows — it changes essentially never. Without caching, the ledger
# page ran an unconditional (unfiltered by date/location/etc) DISTINCT scan over the
# WHOLE stock_ledger table on every single load just to fill a filter dropdown; on a
# prod DB with real history that's a full-table scan for a value that hasn't changed
# since last request.
_ref_types_cache: dict = {"value": None, "at": 0.0}
_REF_TYPES_TTL_SECONDS = 300


async def _get_reference_types(db: AsyncSession) -> list[str]:
    now = time.monotonic()
    if _ref_types_cache["value"] is not None and now - _ref_types_cache["at"] < _REF_TYPES_TTL_SECONDS:
        return _ref_types_cache["value"]
    from app.models.stock_ledger import StockLedger
    result = sorted([
        rt for rt in (await db.execute(select(StockLedger.reference_type).distinct())).scalars().all() if rt
    ])
    _ref_types_cache["value"] = result
    _ref_types_cache["at"] = now
    return result

@router.get("/stock", response_model=PaginatedStockLedgerResponse)
async def get_stock_ledger(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None, description="Match item name/code or reference id"),
    location_id: Optional[str] = Query(None, description="Location id, or comma-separated ids (e.g. a warehouse plus its descendants)"),
    category_id: Optional[str] = Query(None, description="Item category id, or comma-separated ids (a category plus its descendants)"),
    reference_type: Optional[str] = Query(None),
    direction: Optional[str] = Query(None, description="'in' (qty >= 0) or 'out' (qty < 0)"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_any_permission("stock_ledger.view", "stock_on_hand.view"))
):
    from app.models.stock_ledger import StockLedger
    from sqlalchemy import or_, case
    from sqlalchemy.orm import selectinload, joinedload

    # Build the shared filter set once so the page query, count, and aggregates
    # all describe the exact same slice of the ledger.
    conditions = []
    if start_date:
        conditions.append(StockLedger.created_at >= start_date)
    if end_date:
        conditions.append(StockLedger.created_at <= end_date)
    if location_id:
        loc_ids = [x for x in location_id.split(",") if x]
        conditions.append(StockLedger.location_id.in_(loc_ids) if len(loc_ids) > 1 else StockLedger.location_id == loc_ids[0])
    if category_id:
        cat_ids = [x for x in category_id.split(",") if x]
        if cat_ids:
            conditions.append(StockLedger.item_id.in_(
                select(Item.id).where(Item.category_id.in_(cat_ids))
            ))
    if reference_type:
        conditions.append(StockLedger.reference_type == reference_type)
    if direction == "in":
        conditions.append(StockLedger.qty_change >= 0)
    elif direction == "out":
        conditions.append(StockLedger.qty_change < 0)
    if search and search.strip():
        # Tokenised: every whitespace-separated token must match somewhere
        # (item name/code or reference). Typing "BEAM 1" has to find
        # "BEAM  150 - 90" even when the stored name carries a double space or a
        # non-breaking space — those render identically in HTML, so a literal
        # substring match silently returns nothing.
        for tok in search.split():
            term = f"%{tok}%"
            item_sub = select(Item.id).where(or_(Item.name.ilike(term), Item.code.ilike(term)))
            conditions.append(or_(StockLedger.reference_id.ilike(term), StockLedger.item_id.in_(item_sub)))

    total = (await db.execute(
        select(func.count(StockLedger.id)).where(*conditions)
    )).scalar() or 0

    # In / out totals over the WHOLE filtered set (the page-level sum would lie).
    agg = (await db.execute(
        select(
            func.coalesce(func.sum(case((StockLedger.qty_change > 0, StockLedger.qty_change), else_=0)), 0),
            func.coalesce(func.sum(case((StockLedger.qty_change < 0, StockLedger.qty_change), else_=0)), 0),
        ).where(*conditions)
    )).first()
    total_in = float(agg[0] or 0)
    total_out = float(agg[1] or 0)

    rows = (await db.execute(
        select(StockLedger).where(*conditions)
        .options(selectinload(StockLedger.attribute_values), joinedload(StockLedger.batch))
        .order_by(StockLedger.created_at.desc())
        .offset(skip).limit(limit)
    )).scalars().all()

    # Resolve item + location display fields for just this page (small IN queries),
    # so the client renders straight from the response instead of cross-referencing
    # whatever happens to be loaded in its caches.
    item_ids = {r.item_id for r in rows}
    loc_ids = {r.location_id for r in rows}
    item_map = {}
    if item_ids:
        from app.models.category import Category
        for iid, nm, cd, uom, cat_id, cat_name in (await db.execute(
            select(Item.id, Item.name, Item.code, Item.uom, Item.category_id, Category.name)
            .outerjoin(Category, Category.id == Item.category_id)
            .where(Item.id.in_(item_ids))
        )).all():
            item_map[iid] = (nm, cd, uom, cat_id, cat_name)
    loc_map = {}
    if loc_ids:
        for lid, nm in (await db.execute(
            select(Location.id, Location.name).where(Location.id.in_(loc_ids))
        )).all():
            loc_map[lid] = nm

    # Some reference_types store the raw entity UUID (str(entity.id)) instead of a
    # human-readable code — resolve those to a friendly label so the ledger never
    # surfaces a bare UUID to the user.
    ref_label_map: dict[str, str] = {}
    wo_ref_ids = {r.reference_id for r in rows if r.reference_type in _WO_REF_TYPES and r.reference_id}
    if wo_ref_ids:
        wo_uuids = []
        for rid in wo_ref_ids:
            try:
                wo_uuids.append(_uuid.UUID(rid))
            except (ValueError, TypeError):
                pass
        if wo_uuids:
            for wid, code, name in (await db.execute(
                select(WorkOrder.id, WorkOrder.code, WorkOrder.name).where(WorkOrder.id.in_(wo_uuids))
            )).all():
                ref_label_map[str(wid)] = code or name

    gr_ref_ids = {r.reference_id for r in rows if r.reference_type == "Goods Receipt" and r.reference_id}
    if gr_ref_ids:
        gr_uuids = []
        for rid in gr_ref_ids:
            try:
                gr_uuids.append(_uuid.UUID(rid))
            except (ValueError, TypeError):
                pass
        if gr_uuids:
            for gid, po_number in (await db.execute(
                select(GoodsReceipt.id, PurchaseOrder.po_number)
                .join(PurchaseOrder, PurchaseOrder.id == GoodsReceipt.po_id)
                .where(GoodsReceipt.id.in_(gr_uuids))
            )).all():
                ref_label_map[str(gid)] = po_number

    items = []
    for r in rows:
        nm, cd, uom, cat_id, cat_name = item_map.get(r.item_id, ("", "", "", None, None))
        items.append({
            "id": r.id,
            "item_id": r.item_id,
            "item_name": nm or "",
            "item_code": cd or "",
            "item_uom": uom or "",
            "item_category_id": cat_id,
            "item_category_name": cat_name,
            "attribute_value_ids": [v.id for v in (r.attribute_values or [])],
            "location_id": r.location_id,
            "location_name": loc_map.get(r.location_id, "") or "",
            "qty_change": float(r.qty_change),
            "qty_cones_change": r.qty_cones_change,
            "qty_boxes_change": r.qty_boxes_change,
            "qty_drums_change": r.qty_drums_change,
            "reference_type": r.reference_type,
            "reference_id": r.reference_id,
            "reference_label": ref_label_map.get(r.reference_id),
            "batch_id": r.batch_id,
            "batch_number": r.batch.batch_number if r.batch else None,
            "vendor_lot": r.batch.vendor_lot if r.batch else None,
            "created_at": r.created_at,
        })

    reference_types = await _get_reference_types(db)

    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1 if limit else 1,
        "size": len(items),
        "total_in": total_in,
        "total_out": total_out,
        "reference_types": reference_types,
    }

@router.post("/stock", status_code=201)
async def create_stock_entry(
    payload: StockEntryCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('stock_on_hand.adjust'))
):
    item_result = await db.execute(select(Item).filter(Item.code == payload.item_code))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{payload.item_code}' not found")

    if not category_scope_ok(current_user, item.category_id):
        raise HTTPException(status_code=403, detail="Not authorized for this category")

    loc_result = await db.execute(select(Location).filter(Location.code == payload.location_code))
    location = loc_result.scalars().first()
    if not location:
        raise HTTPException(status_code=404, detail=f"Location '{payload.location_code}' not found")

    attribute_value_ids = [str(uid) for uid in payload.attribute_value_ids]
    await stock_service.add_stock_entry(
        db=db,
        item_id=item.id,
        location_id=location.id,
        qty_change=payload.qty,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id,
        attribute_value_ids=attribute_value_ids,
        batch_id=payload.batch_id,
        cones_change=payload.qty_cones or 0,
        boxes_change=payload.qty_boxes or 0,
        drums_change=payload.qty_drums or 0,
    )
    await db.commit()

    await audit_service.log_activity(
        db=db,
        user_id=current_user.id,
        action="create",
        entity_type="stock_entry",
        entity_id=str(item.id),
        changes={
            "item": payload.item_code,
            "location": payload.location_code,
            "qty": payload.qty,
            "reason": payload.reference_id,
            "batch_id": str(payload.batch_id) if payload.batch_id else None,
        },
    )

    await manager.broadcast({"type": "STOCK_UPDATE"})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": "Stock entry recorded"}


@router.post("/stock/transfer", status_code=201)
async def transfer_stock(
    payload: StockTransferCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('stock_on_hand.move')),
):
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")
    if payload.from_location_id == payload.to_location_id:
        raise HTTPException(status_code=400, detail="Source and destination locations must differ")

    item_result = await db.execute(select(Item).filter(Item.id == payload.item_id))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if not category_scope_ok(current_user, item.category_id):
        raise HTTPException(status_code=403, detail="Not authorized for this category")

    loc_result = await db.execute(
        select(Location).filter(Location.id.in_([payload.from_location_id, payload.to_location_id]))
    )
    locs = {loc.id: loc for loc in loc_result.scalars().all()}
    if len(locs) != 2:
        raise HTTPException(status_code=404, detail="Location not found")

    if item.lot_tracked and not payload.batch_id:
        raise HTTPException(status_code=400, detail=f"Item {item.code} is lot-tracked — select a lot/batch to transfer")

    attrs = [str(u) for u in payload.attribute_value_ids]
    ref = f"{locs[payload.from_location_id].code} -> {locs[payload.to_location_id].code}"

    c = payload.qty_cones or 0
    b = payload.qty_boxes or 0
    d = payload.qty_drums or 0

    # OUT first — per-batch negative stock guard blocks over-transfer
    await stock_service.add_stock_entry(
        db, item_id=item.id, location_id=payload.from_location_id,
        qty_change=-payload.qty, reference_type="Transfer", reference_id=ref,
        attribute_value_ids=attrs, batch_id=payload.batch_id,
        cones_change=-c, boxes_change=-b, drums_change=-d,
    )
    await stock_service.add_stock_entry(
        db, item_id=item.id, location_id=payload.to_location_id,
        qty_change=payload.qty, reference_type="Transfer", reference_id=ref,
        attribute_value_ids=attrs, batch_id=payload.batch_id,
        cones_change=c, boxes_change=b, drums_change=d,
    )
    await db.commit()

    await audit_service.log_activity(
        db=db,
        user_id=current_user.id,
        action="TRANSFER",
        entity_type="stock_entry",
        entity_id=str(item.id),
        changes={"item": item.code, "qty": payload.qty, "route": ref, "batch_id": str(payload.batch_id) if payload.batch_id else None},
    )

    await manager.broadcast({"type": "STOCK_UPDATE"})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": "Transfer recorded"}


@router.post("/stock/transfer/bulk", status_code=201)
async def transfer_stock_bulk(
    payload: StockBulkTransferCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('stock_on_hand.move')),
):
    """Move several on-hand rows to ONE destination in a single transaction.

    All-or-nothing: every line is validated up front and all ledger writes share
    one commit, so a negative-stock guard tripping on line 7 rolls back lines 1-6
    rather than leaving a half-done move on the floor.
    """
    if not payload.lines:
        raise HTTPException(status_code=400, detail="No lines to transfer")

    item_ids = {ln.item_id for ln in payload.lines}
    loc_ids = {ln.from_location_id for ln in payload.lines} | {payload.to_location_id}

    items_result = await db.execute(select(Item).filter(Item.id.in_(item_ids)))
    items = {it.id: it for it in items_result.scalars().all()}
    locs_result = await db.execute(select(Location).filter(Location.id.in_(loc_ids)))
    locs = {loc.id: loc for loc in locs_result.scalars().all()}
    if payload.to_location_id not in locs:
        raise HTTPException(status_code=404, detail="Destination location not found")

    # Validate everything before writing anything.
    for idx, ln in enumerate(payload.lines, start=1):
        item = items.get(ln.item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Line {idx}: item not found")
        if ln.qty <= 0:
            raise HTTPException(status_code=400, detail=f"Line {idx} ({item.code}): qty must be positive")
        if ln.from_location_id not in locs:
            raise HTTPException(status_code=404, detail=f"Line {idx} ({item.code}): source location not found")
        if ln.from_location_id == payload.to_location_id:
            raise HTTPException(status_code=400, detail=f"Line {idx} ({item.code}): already at the destination location")
        if not category_scope_ok(current_user, item.category_id):
            raise HTTPException(status_code=403, detail=f"Line {idx} ({item.code}): not authorized for this category")
        if item.lot_tracked and not ln.batch_id:
            raise HTTPException(status_code=400, detail=f"Line {idx}: item {item.code} is lot-tracked — select a lot to transfer")

    dest_code = locs[payload.to_location_id].code
    for ln in payload.lines:
        item = items[ln.item_id]
        attrs = [str(u) for u in ln.attribute_value_ids]
        ref = f"{locs[ln.from_location_id].code} -> {dest_code}"
        c = ln.qty_cones or 0
        b = ln.qty_boxes or 0
        d = ln.qty_drums or 0
        # OUT first — per-batch negative stock guard blocks over-transfer
        await stock_service.add_stock_entry(
            db, item_id=item.id, location_id=ln.from_location_id,
            qty_change=-ln.qty, reference_type="Transfer", reference_id=ref,
            attribute_value_ids=attrs, batch_id=ln.batch_id,
            cones_change=-c, boxes_change=-b, drums_change=-d,
        )
        await stock_service.add_stock_entry(
            db, item_id=item.id, location_id=payload.to_location_id,
            qty_change=ln.qty, reference_type="Transfer", reference_id=ref,
            attribute_value_ids=attrs, batch_id=ln.batch_id,
            cones_change=c, boxes_change=b, drums_change=d,
        )
    await db.commit()

    await audit_service.log_activity(
        db=db,
        user_id=current_user.id,
        action="TRANSFER",
        entity_type="stock_entry",
        entity_id=str(payload.to_location_id),
        details=f"Combined move of {len(payload.lines)} stock rows to {dest_code}",
        changes={
            "destination": dest_code,
            "line_count": len(payload.lines),
            "lines": [
                {
                    "item": items[ln.item_id].code,
                    "from": locs[ln.from_location_id].code,
                    "qty": ln.qty,
                    "batch_id": str(ln.batch_id) if ln.batch_id else None,
                }
                for ln in payload.lines
            ],
        },
    )

    await manager.broadcast({"type": "STOCK_UPDATE"})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": f"Moved {len(payload.lines)} rows to {dest_code}", "moved": len(payload.lines)}


@router.get("/stock/balance", response_model=list[StockBalanceResponse])
async def get_stock_balance_api(
    item_ids: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_any_permission("stock_on_hand.view", "lot.view", "work_order.view", "booking_stock.view", "quarantine.view")),
):
    # item_ids (comma-separated) scopes the plant-wide balance table to a handful
    # of items — pages that only need availability for a specific item set (e.g.
    # Packing) should pass this instead of pulling every balance row in the plant.
    ids = None
    if item_ids:
        import uuid as _uuid
        ids = []
        for raw in item_ids.split(","):
            raw = raw.strip()
            if not raw:
                continue
            try:
                ids.append(_uuid.UUID(raw))
            except ValueError:
                continue
    return await stock_service.get_all_stock_balances(db, user=current_user, item_ids=ids)


# The netting pass below walks every ONGOING MO plant-wide and is independent of
# location_id/search/page/size (those only trim the already-computed row set) — so
# the expensive part is cached briefly and dropped whenever something that could
# change it broadcasts, instead of recomputed on every page load/refresh. Each
# process/worker holds its own cache and independently receives every broadcast
# (local or via Redis), so invalidation stays correct across multiple workers.
# Booking-stock netting is expensive (loads every open MO with 4 eager relations
# + a plant-wide on-hand aggregate). It changes on stock, MO, WO and PR mutations —
# all common in an active plant — so nulling the cache on every such event left it
# cold on nearly every page load. Instead we serve stale-while-revalidate: an
# invalidating event marks the rows stale but keeps serving them; the next request
# returns the stale rows immediately and kicks off a single background recompute so
# the following request is fresh. Booking stock is an advisory planning view, so a
# few-seconds-stale netting number between a mutation and the background refresh is
# an acceptable trade for never blocking a load on the full recompute.
_booking_cache: dict = {"rows": None, "at": 0.0, "stale": True, "refreshing": False}
_BOOKING_TTL_SECONDS = 60
_BOOKING_INVALIDATING_TYPES = {"STOCK_UPDATE", "MANUFACTURING_ORDER_UPDATE", "WORK_ORDER_UPDATE", "PRODUCTION_RUN_UPDATE"}

# Keep strong refs to in-flight background tasks so the event loop doesn't GC them
# mid-run (documented asyncio.create_task footgun).
_booking_bg_tasks: set = set()


def _invalidate_booking_cache(message: dict):
    if message.get("type") in _BOOKING_INVALIDATING_TYPES:
        _booking_cache["stale"] = True


manager.register_invalidation_hook(_invalidate_booking_cache)


async def booking_rows_cached() -> list:
    """Booking-stock rows, served from the same cache the /stock/availability
    endpoint uses (cold-compute, then stale-while-revalidate).

    Public so other views can net against plant-wide demand without duplicating
    _compute_booking_rows — the PR material panel does exactly that, and any second
    copy of this netting would drift from the Booking Stock page it must agree with.
    """
    now = time.monotonic()
    if _booking_cache["rows"] is None:
        return await _recompute_booking_cache()
    if _booking_cache["stale"] or now - _booking_cache["at"] >= _BOOKING_TTL_SECONDS:
        _spawn_booking_refresh()
    return _booking_cache["rows"]


async def _recompute_booking_cache() -> list:
    """Recompute booking rows on a fresh session and store them. Returns the rows."""
    from app.core.db_manager import db_manager
    async for session in db_manager.get_async_session():
        rows = await _compute_booking_rows(session)
        _booking_cache["rows"] = rows
        _booking_cache["at"] = time.monotonic()
        _booking_cache["stale"] = False
        return rows
    return []


async def _refresh_booking_cache_bg():
    """Background stale-while-revalidate refresh; at most one runs at a time."""
    if _booking_cache["refreshing"]:
        return
    _booking_cache["refreshing"] = True
    try:
        await _recompute_booking_cache()
    except Exception:
        # A failed background refresh must not crash anything — the stale rows keep
        # serving and the next invalidation/expiry will retry.
        pass
    finally:
        _booking_cache["refreshing"] = False


def _spawn_booking_refresh():
    task = _asyncio.create_task(_refresh_booking_cache_bg())
    _booking_bg_tasks.add(task)
    task.add_done_callback(_booking_bg_tasks.discard)


def warm_booking_cache() -> None:
    """Compute the first set of booking rows in the background at startup.

    Cold, the cache has no rows to serve stale, so `booking_rows_cached()` runs the
    whole plant-wide netting pass INLINE and the unlucky first caller waits it out —
    the first PR material panel expanded after a deploy, or the first /booking-stock
    load. Warming it costs the same one pass, just off the request path. Purely a
    head start: if it fails the cache stays cold and the next request behaves exactly
    as it does today."""
    _spawn_booking_refresh()


async def _compute_booking_rows(db: AsyncSession) -> list:
    """Booking-stock / material-availability netting.

    For every component demanded by an ONGOING manufacturing order (PENDING or
    IN_PROGRESS), nets physical on-hand against outstanding demand and against
    incoming scheduled receipts (the outstanding output of in-flight production
    MOs that produce the item):

        net_free = on_hand + incoming - required

    Committed-supply rule: a sales-order-linked root MO's outstanding output is
    promised to that order and is EXCLUDED from incoming — it never covers
    other demand. Shared-component/child MOs and uncommitted stock-build roots
    stay in supply.

    Demand is OUTSTANDING-based: a component is scaled by the MO's remaining
    output (MO.qty - completed), so already-produced quantity stops counting.

    Plant-level (location-agnostic) netting: rows are keyed by (item, variant);
    on-hand is summed across ALL stock locations.
    """
    from collections import defaultdict
    from uuid import UUID
    from sqlalchemy.orm import selectinload, joinedload
    from app.models.manufacturing import ManufacturingOrder
    from app.services.netting_service import _sales_order_linked_prs, _output_committed

    ONGOING = ("PENDING", "IN_PROGRESS", "DELIVERED")   # see netting_service.ONGOING
    mo_rows = (await db.execute(
        select(ManufacturingOrder)
        .where(ManufacturingOrder.status.in_(ONGOING))
        .options(
            selectinload(ManufacturingOrder.planned_components),
            selectinload(ManufacturingOrder.completions),
            selectinload(ManufacturingOrder.attribute_values),
            joinedload(ManufacturingOrder.bom),
        )
    )).unique().scalars().all()

    so_linked_prs = await _sales_order_linked_prs(db, mo_rows)

    # demand + supply keyed by (item_id, attr_key) only — no location.
    demand: dict[tuple, dict] = defaultdict(lambda: {"total_required": 0.0, "contributions": []})
    supply: dict[tuple, dict] = defaultdict(lambda: {"total_incoming": 0.0, "contributions": []})

    for mo in mo_rows:
        completed = sum(float(c.qty_completed) for c in mo.completions if not c.rejected)
        outstanding = float(mo.qty) - completed
        if outstanding <= 0:
            continue  # nothing left to make → no remaining demand, no incoming

        tol = float(mo.bom.tolerance_percentage or 0) if mo.bom else 0.0

        # ── Demand: components this MO will still consume ──
        for comp in mo.planned_components:
            if not comp.percentage and not comp.qty:
                continue
            req = (outstanding * float(comp.percentage)) / 100 if comp.percentage else outstanding * float(comp.qty)
            if tol > 0:
                req *= (1 + tol / 100)
            attr_ids = sorted(str(a) for a in (comp.attribute_value_ids or []))
            key = (str(comp.item_id), ",".join(attr_ids))
            d = demand[key]
            d["item_id"] = comp.item_id
            d["attr_ids"] = attr_ids
            d["total_required"] += req
            d["contributions"].append(BookingDemandMO(
                mo_id=mo.id, mo_code=mo.code, mo_qty=float(mo.qty), required_qty=req,
            ))

        # ── Supply: this MO's own outstanding output is a scheduled receipt,
        # unless committed to a sales order (committed-supply rule) ──
        if _output_committed(mo, so_linked_prs):
            continue
        # Fold the FG shade into the supply key so it matches the color-tagged
        # on-hand variant_key rows (per-color netting).
        from app.services.stock_service import _generate_variant_key
        out_key = _generate_variant_key([str(v.id) for v in mo.attribute_values], getattr(mo, "color_id", None))
        skey = (str(mo.item_id), out_key)
        s = supply[skey]
        s["total_incoming"] += outstanding
        s["contributions"].append(BookingSupplyMO(
            mo_id=mo.id, mo_code=mo.code, mo_qty=float(mo.qty), incoming_qty=outstanding,
        ))

    if not demand:
        return []

    # Display lookups: item code/name/uom.
    item_ids = {v["item_id"] for v in demand.values()}
    item_map = {i.id: i for i in (await db.execute(
        select(Item).filter(Item.id.in_(item_ids))
    )).scalars().all()}

    # Plant-wide on-hand: sum StockBalance across ALL locations per (item, variant_key).
    # QC-rejected lot stock is physically present but never good/available.
    from app.services.netting_service import rejected_batch_keys
    onhand_map: dict[tuple, float] = {}
    for iid, vk, q in (await db.execute(
        select(StockBalance.item_id, StockBalance.variant_key, func.sum(StockBalance.qty))
        .where(
            StockBalance.item_id.in_(item_ids),
            StockBalance.batch_key.not_in(rejected_batch_keys()),
        )
        .group_by(StockBalance.item_id, StockBalance.variant_key)
    )).all():
        onhand_map[(str(iid), vk or "")] = float(q or 0)

    rows: list[BookingStockRow] = []
    for (item_id_str, attr_key), data in demand.items():
        item = item_map.get(data["item_id"])
        on_hand = onhand_map.get((item_id_str, attr_key), 0.0)
        sup = supply.get((item_id_str, attr_key))
        incoming = sup["total_incoming"] if sup else 0.0
        required = data["total_required"]
        rows.append(BookingStockRow(
            item_id=data["item_id"],
            item_code=item.code if item else str(data["item_id"]),
            item_name=item.name if item else str(data["item_id"]),
            uom=item.uom if item else "",
            attribute_value_ids=[UUID(a) for a in data["attr_ids"]],
            location_id=None,
            location_name="Plant-wide",
            qty_on_hand=on_hand,
            qty_required=required,
            qty_incoming=incoming,
            qty_net_free=on_hand + incoming - required,
            demand_mos=data["contributions"],
            supply_mos=sup["contributions"] if sup else [],
        ))

    return rows


@router.get("/stock/availability", response_model=PaginatedBookingStockResponse)
async def get_stock_availability(
    location_id: Optional[str] = Query(None, description="Restrict to a single location"),
    search: Optional[str] = Query(None, description="Matches item code or name"),
    window: PageWindow = Depends(PageParams(default_size=50)),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_any_permission("booking_stock.view", "stock_on_hand.view", "production_run.view")),
):
    """Booking-stock / material-availability view. See _compute_booking_rows for the
    netting logic. The ``location_id`` query param is retained for API compatibility
    but no longer scopes the result (netting is plant-wide/location-agnostic)."""
    now = time.monotonic()
    if _booking_cache["rows"] is None:
        # Cold cache (first load / after restart): must compute synchronously.
        rows = await _recompute_booking_cache()
    else:
        rows = _booking_cache["rows"]
        # Serve the (possibly stale) cached rows now; if they are stale or past TTL,
        # kick off a single background recompute so the next request is fresh.
        if _booking_cache["stale"] or now - _booking_cache["at"] >= _BOOKING_TTL_SECONDS:
            _spawn_booking_refresh()

    if search:
        term = search.strip().lower()
        rows = [r for r in rows if term in r.item_code.lower() or term in r.item_name.lower()]
    else:
        rows = list(rows)  # copy before sorting — never mutate the cached list in place

    # Shortfalls first (most actionable), then by item code.
    rows.sort(key=lambda r: (r.qty_net_free >= 0, r.item_code))
    total = len(rows)
    # The page window is applied to an in-memory list here, not a select, so this
    # slices by hand instead of window.apply(). Uncapped (size=0) pins offset to 0,
    # so an open-ended slice is the whole set.
    end = None if window.limit is None else window.offset + window.limit
    return window.envelope(rows[window.offset:end], total)


@router.post("/stock/balances/rebuild")
def rebuild_stock_balances(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    """Recompute the materialized StockBalance table from the StockLedger.

    StockBalance is only rebuilt at startup; if the ledger and the summary drift
    (long-running service, out-of-band ledger writes), this lets an operator
    resync on demand without a restart. Sync endpoint — sync_stock_balances
    takes a sync Session.
    """
    from app.db.init_db import sync_stock_balances
    sync_stock_balances(db)
    db.add(AuditLog(user_id=current_user.id, action="REBUILD", entity_type="StockBalance", entity_id="all", details="Rebuilt stock balances from ledger"))
    db.commit()
    return {"status": "success", "message": "Stock balances rebuilt from ledger"}
