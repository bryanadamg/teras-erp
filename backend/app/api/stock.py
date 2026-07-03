from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from app.db.session import get_async_db, get_db
from app.services import stock_service, audit_service, kpi_service
from app.core.ws_manager import manager
from app.schemas import StockLedgerResponse, StockBalanceResponse, PaginatedStockLedgerResponse, StockEntryCreate, StockTransferCreate, BookingStockRow, BookingDemandMO, BookingSupplyMO
from app.models.auth import User
from app.api.auth import get_current_user, require_permission, get_current_admin
from app.models.item import Item
from app.models.location import Location
from app.models.stock_balance import StockBalance
from datetime import datetime
from typing import Optional

router = APIRouter()

@router.get("/stock", response_model=PaginatedStockLedgerResponse)
async def get_stock_ledger(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None, description="Match item name/code or reference id"),
    location_id: Optional[str] = Query(None),
    reference_type: Optional[str] = Query(None),
    direction: Optional[str] = Query(None, description="'in' (qty >= 0) or 'out' (qty < 0)"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
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
        conditions.append(StockLedger.location_id == location_id)
    if reference_type:
        conditions.append(StockLedger.reference_type == reference_type)
    if direction == "in":
        conditions.append(StockLedger.qty_change >= 0)
    elif direction == "out":
        conditions.append(StockLedger.qty_change < 0)
    if search and search.strip():
        term = f"%{search.strip()}%"
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
        for iid, nm, cd, uom in (await db.execute(
            select(Item.id, Item.name, Item.code, Item.uom).where(Item.id.in_(item_ids))
        )).all():
            item_map[iid] = (nm, cd, uom)
    loc_map = {}
    if loc_ids:
        for lid, nm in (await db.execute(
            select(Location.id, Location.name).where(Location.id.in_(loc_ids))
        )).all():
            loc_map[lid] = nm

    items = []
    for r in rows:
        nm, cd, uom = item_map.get(r.item_id, ("", "", ""))
        items.append({
            "id": r.id,
            "item_id": r.item_id,
            "item_name": nm or "",
            "item_code": cd or "",
            "item_uom": uom or "",
            "attribute_value_ids": [v.id for v in (r.attribute_values or [])],
            "location_id": r.location_id,
            "location_name": loc_map.get(r.location_id, "") or "",
            "qty_change": float(r.qty_change),
            "qty_cones_change": r.qty_cones_change,
            "qty_boxes_change": r.qty_boxes_change,
            "qty_drums_change": r.qty_drums_change,
            "reference_type": r.reference_type,
            "reference_id": r.reference_id,
            "batch_id": r.batch_id,
            "batch_number": r.batch.batch_number if r.batch else None,
            "created_at": r.created_at,
        })

    reference_types = sorted([
        rt for rt in (await db.execute(
            select(StockLedger.reference_type).distinct()
        )).scalars().all() if rt
    ])

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
    current_user: User = Depends(require_permission('stock.entry'))
):
    item_result = await db.execute(select(Item).filter(Item.code == payload.item_code))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{payload.item_code}' not found")

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
    current_user: User = Depends(require_permission('stock.entry')),
):
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")
    if payload.from_location_id == payload.to_location_id:
        raise HTTPException(status_code=400, detail="Source and destination locations must differ")

    item_result = await db.execute(select(Item).filter(Item.id == payload.item_id))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

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

    await audit_service.log_activity(
        db=db,
        user_id=current_user.id,
        action="TRANSFER",
        entity_type="stock_entry",
        entity_id=str(item.id),
        changes={"item": item.code, "qty": payload.qty, "route": ref, "batch_id": str(payload.batch_id) if payload.batch_id else None},
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": "Transfer recorded"}


@router.get("/stock/balance", response_model=list[StockBalanceResponse])
async def get_stock_balance_api(db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    return await stock_service.get_all_stock_balances(db, user=current_user)


@router.get("/stock/availability", response_model=list[BookingStockRow])
async def get_stock_availability(
    location_id: Optional[str] = Query(None, description="Restrict to a single location"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Booking-stock / material-availability view.

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
    on-hand is summed across ALL stock locations. The ``location_id`` query param
    is retained for API compatibility but no longer scopes the result.
    """
    from collections import defaultdict
    from uuid import UUID
    from sqlalchemy.orm import selectinload, joinedload
    from app.models.manufacturing import ManufacturingOrder
    from app.services.netting_service import _sales_order_linked_prs, _output_committed

    ONGOING = ("PENDING", "IN_PROGRESS")
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
        completed = sum(float(c.qty_completed) for c in mo.completions)
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
        out_attr = sorted(str(v.id) for v in mo.attribute_values)
        skey = (str(mo.item_id), ",".join(out_attr))
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
    onhand_map: dict[tuple, float] = {}
    for iid, vk, q in (await db.execute(
        select(StockBalance.item_id, StockBalance.variant_key, func.sum(StockBalance.qty))
        .where(StockBalance.item_id.in_(item_ids))
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

    # Shortfalls first (most actionable), then by item code.
    rows.sort(key=lambda r: (r.qty_net_free >= 0, r.item_code))
    return rows


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
    return {"status": "success", "message": "Stock balances rebuilt from ledger"}
