"""Quarantine Packing — the QC hold desk between production output and packing.

Everything sitting in a quarantine location (see services/quarantine_service.py)
shows here, grouped by the MO that produced it. QC dispositions each **lot**;
the MO row is a rollup, so a partially-passed batch releases its good lots
without waiting on the rest. Only a lot dispositioned OK may be packed — the
gate itself lives in api/packing.py via `assert_lots_released`.

The status list is a system attribute, not an enum: the client adds values on
the Attributes page. Only the *passing* value is fixed in code, because it is a
gate rather than a label.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, cast, String
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_db
from app.models.auth import User
from app.models.batch import Batch
from app.models.item import Item
from app.models.location import Location
from app.models.manufacturing import ManufacturingOrder
from app.models.packing import PackingOrder
from app.models.production_run import ProductionRun
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.color import Color
from app.models.stock_balance import StockBalance
from app.models.work_order import WorkOrder
from app.api.auth import get_current_user, require_permission
from app.schemas import (
    QuarantineGroupResponse, QuarantineListResponse, QuarantineLotResponse,
    QuarantineStatusOption, QuarantineStatusUpdate,
    ReadyToPackSoLine, ReadyToPackSuggestion,
)
from app.services import audit_service, quarantine_service, so_fulfilment_service
from app.core.ws_manager import manager

router = APIRouter(prefix="/quarantine", tags=["quarantine"])

# Hard ceiling on lot rows scanned per request. Quarantine is a transient hold
# area — thousands of held lots means something upstream is wrong, not that the
# page should page through them. `truncated` on the response says so out loud
# rather than silently showing a partial picture as if it were everything.
MAX_LOT_ROWS = 4000

UNASSIGNED = "unassigned"


def _rollup(statuses: list[Optional[str]]) -> str:
    """One label for an MO row from its lots' dispositions.

    NONE (no lot dispositioned), MIXED (they disagree), or the shared status.
    Deliberately not a stored field — the lot is the source of truth.
    """
    distinct = {(s or "").strip().upper() or "NONE" for s in statuses}
    if not distinct:
        return "NONE"
    if len(distinct) == 1:
        return distinct.pop()
    return "MIXED"


@router.get("/statuses", response_model=list[QuarantineStatusOption])
async def list_quarantine_statuses(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission("quarantine.view")),
):
    """Dispositions QC may set. `is_pass` marks the one that releases to packing."""
    values = await quarantine_service.status_values(db)
    return [
        QuarantineStatusOption(
            id=v.id, value=v.value, is_pass=quarantine_service.is_pass(v.value)
        )
        for v in values
    ]


@router.get("", response_model=QuarantineListResponse)
async def list_quarantine_stock(
    search: Optional[str] = Query(None, description="Matches MO / lot / item / SO code"),
    status: Optional[str] = Query(None, description="Filter to groups whose rollup equals this (e.g. OK, MIXED, NONE)"),
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=200),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('quarantine.view')),
):
    """Stock held in quarantine, grouped by the MO that produced it.

    Grouping is derived, not stored: a lot carries `source_wo_id`, and the WO
    carries the MO — the same chain `_resolve_batch_origins` walks for lineage.
    Stock with no lot (or a lot not born on a WO) has no MO and lands in one
    "No MO" group so nothing held is invisible.

    Pagination is over *groups*, applied after grouping, because an MO's lots
    must never be split across pages — the whole point of the row is its rollup.
    """
    loc_ids = await quarantine_service.quarantine_location_ids(db)
    if not loc_ids:
        return QuarantineListResponse(items=[], total=0, page=page, size=size, truncated=False)

    # Balance rows -> lot + item + location in one pass. batch_key is text, so the
    # join casts Batch.id rather than the key (keeps the batches PK index usable).
    rows = (await db.execute(
        select(StockBalance, Batch, Item, Location)
        .join(Item, Item.id == StockBalance.item_id)
        .join(Location, Location.id == StockBalance.location_id)
        .outerjoin(Batch, cast(Batch.id, String) == StockBalance.batch_key)
        .filter(StockBalance.location_id.in_(loc_ids), StockBalance.qty > 0)
        .order_by(StockBalance.qty.desc())
        .limit(MAX_LOT_ROWS + 1)
    )).all()
    truncated = len(rows) > MAX_LOT_ROWS
    rows = rows[:MAX_LOT_ROWS]
    if not rows:
        return QuarantineListResponse(items=[], total=0, page=page, size=size, truncated=False)

    # Lot -> MO origin, one query for the page (same chain as batch lineage).
    mo_so = aliased(SalesOrder)
    pr_so = aliased(SalesOrder)
    wo_ids = {b.source_wo_id for (_, b, _, _) in rows if b is not None and b.source_wo_id}
    origin: dict = {}
    if wo_ids:
        for (wo_id, mo_id, mo_code, mo_status, mo_qty, pr_code,
             mo_so_id, mo_so_code, pr_so_id, pr_so_code,
             color_code, color_name, color_hex, labdip_code) in (await db.execute(
            select(
                WorkOrder.id,
                ManufacturingOrder.id, ManufacturingOrder.code,
                ManufacturingOrder.status, ManufacturingOrder.qty,
                ProductionRun.code,
                ManufacturingOrder.sales_order_id, mo_so.po_number,
                ProductionRun.sales_order_id, pr_so.po_number,
                Color.code, Color.name, Color.hex,
                ManufacturingOrder.labdip_variant_code,
            )
            .join(ManufacturingOrder, ManufacturingOrder.id == WorkOrder.manufacturing_order_id)
            .outerjoin(ProductionRun, ProductionRun.id == ManufacturingOrder.production_run_id)
            .outerjoin(mo_so, mo_so.id == ManufacturingOrder.sales_order_id)
            .outerjoin(pr_so, pr_so.id == ProductionRun.sales_order_id)
            .outerjoin(Color, Color.id == ManufacturingOrder.color_id)
            .filter(WorkOrder.id.in_(wo_ids))
        )).all():
            origin[wo_id] = {
                "mo_id": mo_id, "mo_code": mo_code, "mo_status": mo_status,
                "mo_qty": float(mo_qty or 0), "production_run_code": pr_code,
                "sales_order_id": mo_so_id or pr_so_id,
                "sales_order_code": mo_so_code or pr_so_code,
                "color_code": color_code, "color_name": color_name, "color_hex": color_hex,
                "labdip_variant_code": labdip_code,
            }

    groups: dict[str, QuarantineGroupResponse] = {}
    for bal, batch, item, loc in rows:
        info = origin.get(batch.source_wo_id) if batch is not None else None
        # An MO can produce more than one item (component MOs), and the same item
        # can arrive from different MOs — key on both so a row is always one
        # (order, product) pair the way the packing order downstream is.
        key = f"{info['mo_id'] if info else UNASSIGNED}:{item.id}"
        grp = groups.get(key)
        if grp is None:
            grp = QuarantineGroupResponse(
                key=key,
                mo_id=info["mo_id"] if info else None,
                mo_code=info["mo_code"] if info else None,
                mo_status=info["mo_status"] if info else None,
                mo_qty=info["mo_qty"] if info else None,
                production_run_code=info["production_run_code"] if info else None,
                sales_order_id=info["sales_order_id"] if info else None,
                sales_order_code=info["sales_order_code"] if info else None,
                color_code=info["color_code"] if info else None,
                color_name=info["color_name"] if info else None,
                color_hex=info["color_hex"] if info else None,
                labdip_variant_code=info["labdip_variant_code"] if info else None,
                item_id=item.id, item_code=item.code, item_name=item.name, uom=item.uom,
                qty_total=0.0, qty_released=0.0, lot_count=0,
                rollup_status="NONE", status_counts={}, lots=[],
            )
            groups[key] = grp

        qty = float(bal.qty or 0)
        released = quarantine_service.is_pass(batch.quarantine_status) if batch is not None else False
        grp.qty_total += qty
        if released:
            grp.qty_released += qty
        grp.lot_count += 1
        label = ((batch.quarantine_status if batch is not None else None) or "").strip().upper() or "NONE"
        grp.status_counts[label] = grp.status_counts.get(label, 0) + 1
        grp.lots.append(QuarantineLotResponse(
            batch_id=batch.id if batch is not None else None,
            batch_number=batch.batch_number if batch is not None else None,
            item_id=item.id, item_code=item.code, item_name=item.name, uom=item.uom,
            qty=qty,
            location_id=loc.id, location_name=loc.name,
            variant_key=bal.variant_key or "",
            quality_status=batch.quality_status if batch is not None else None,
            quarantine_status=batch.quarantine_status if batch is not None else None,
            quarantine_status_id=batch.quarantine_status_id if batch is not None else None,
            quarantine_status_at=batch.quarantine_status_at if batch is not None else None,
            quarantine_status_by=batch.quarantine_status_by if batch is not None else None,
            quarantine_notes=batch.quarantine_notes if batch is not None else None,
            released=released,
            created_at=batch.created_at if batch is not None else None,
        ))

    items = list(groups.values())
    for grp in items:
        grp.rollup_status = _rollup([l.quarantine_status for l in grp.lots])
        grp.lots.sort(key=lambda l: (l.batch_number or "~"))

    if search:
        needle = search.strip().lower()
        items = [
            g for g in items
            if needle in (g.mo_code or "").lower()
            or needle in (g.sales_order_code or "").lower()
            or needle in (g.production_run_code or "").lower()
            or needle in (g.item_code or "").lower()
            or needle in (g.item_name or "").lower()
            or any(needle in (l.batch_number or "").lower() for l in g.lots)
        ]
    if status:
        wanted = status.strip().upper()
        items = [g for g in items if g.rollup_status == wanted]

    # Undispositioned first — the desk's job is the queue, not the archive.
    order = {"NONE": 0, "MIXED": 1}
    items.sort(key=lambda g: (order.get(g.rollup_status, 2), g.mo_code or "~", g.item_code or ""))

    total = len(items)
    start = (page - 1) * size
    return QuarantineListResponse(
        items=items[start:start + size], total=total, page=page, size=size, truncated=truncated,
    )


@router.get("/ready-to-pack", response_model=list[ReadyToPackSuggestion])
async def list_ready_to_pack(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('quarantine.view')),
):
    """Released, unpacked quarantine stock, matched against open SO demand.

    A nudge for the packer, not an auto-created order: QC releasing a lot only
    means the stock is usable, it says nothing about which order (if any) it
    should serve — `PackingOrder.sales_order_id` stays a soft tag, so this only
    ever *suggests* a line, never claims one. One suggestion per (item, quarantine
    location) — that pair is exactly what a packing order's item + source
    location need to be, so "Pack" can pre-fill both untouched.

    Only lot-tracked stock is actionable here, same hole as `assert_lots_released`:
    un-lotted stock has nothing to disposition, so it can't be "released" either.
    """
    loc_ids = await quarantine_service.quarantine_location_ids(db)
    if not loc_ids:
        return []

    rows = (await db.execute(
        select(StockBalance, Batch, Item, Location)
        .join(Item, Item.id == StockBalance.item_id)
        .join(Location, Location.id == StockBalance.location_id)
        .join(Batch, cast(Batch.id, String) == StockBalance.batch_key)
        .filter(StockBalance.location_id.in_(loc_ids), StockBalance.qty > 0)
    )).all()

    totals: dict[tuple, dict] = {}
    for bal, batch, item, loc in rows:
        if not quarantine_service.is_pass(batch.quarantine_status):
            continue
        key = (item.id, loc.id)
        entry = totals.setdefault(key, {"qty": 0.0, "item": item, "location": loc})
        entry["qty"] += float(bal.qty or 0)
    if not totals:
        return []

    item_ids = {k[0] for k in totals}
    loc_id_set = {k[1] for k in totals}

    # Drop groups a planner already actioned — an open PackingOrder against the
    # same item + source location means this suggestion has already been picked up.
    existing = (await db.execute(
        select(PackingOrder.item_id, PackingOrder.source_location_id)
        .filter(
            PackingOrder.status.in_(("PENDING", "IN_PROGRESS")),
            PackingOrder.item_id.in_(item_ids),
            PackingOrder.source_location_id.in_(loc_id_set),
        )
    )).all()
    already_actioned = {(row[0], row[1]) for row in existing}

    # Open SO lines for these items, batched — same "still needs fulfilment"
    # statuses so_fulfilment_service.recompute_all scopes its own recompute to.
    line_rows = (await db.execute(
        select(SalesOrderLine)
        .join(SalesOrder, SalesOrder.id == SalesOrderLine.sales_order_id)
        .options(selectinload(SalesOrderLine.order))
        .filter(
            SalesOrderLine.item_id.in_(item_ids),
            SalesOrder.status.in_(("PENDING", "READY", "PARTIAL")),
        )
    )).scalars().all()
    fulfilment = await so_fulfilment_service.fulfilment_map(db, [l.sales_order_id for l in line_rows])

    lines_by_item: dict = {}
    for l in line_rows:
        packed_available = fulfilment.get(str(l.id), {}).get("packed_available", 0.0)
        outstanding = float(l.qty or 0) - packed_available
        if outstanding <= so_fulfilment_service.EPS:
            continue
        lines_by_item.setdefault(l.item_id, []).append((l, outstanding))

    suggestions: list[ReadyToPackSuggestion] = []
    for (item_id, location_id), entry in totals.items():
        if entry["qty"] <= 0 or (item_id, location_id) in already_actioned:
            continue
        item, loc = entry["item"], entry["location"]
        candidates = sorted(
            lines_by_item.get(item_id, []),
            key=lambda pair: pair[0].due_date or datetime.max,
        )
        so_lines = [
            ReadyToPackSoLine(
                sales_order_line_id=l.id,
                sales_order_id=l.sales_order_id,
                sales_order_code=l.order.po_number if l.order else None,
                qty_ordered=float(l.qty or 0),
                qty_outstanding=outstanding,
            )
            for l, outstanding in candidates
        ]
        best = candidates[0][0] if candidates else None
        suggestions.append(ReadyToPackSuggestion(
            item_id=item.id, item_code=item.code, item_name=item.name, uom=item.uom,
            location_id=loc.id, location_name=loc.name,
            qty_available=entry["qty"],
            so_lines=so_lines,
            suggested_sales_order_id=best.sales_order_id if best else None,
            suggested_sales_order_line_id=best.id if best else None,
        ))

    suggestions.sort(key=lambda s: (s.item_code or "", s.location_name or ""))
    return suggestions


@router.post("/status", response_model=list[QuarantineLotResponse])
async def set_quarantine_status(
    payload: QuarantineStatusUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('quarantine.set_status')),
):
    """Set (or clear) the disposition on one or more lots.

    Takes a lot list rather than an MO so the same call serves both the per-lot
    control and the "apply to the whole MO" button — the client sends the
    group's lot ids for the second. `status_value_id: null` clears back to
    undispositioned, which re-holds the lots.
    """
    batch_ids = [b for b in (payload.batch_ids or []) if b]
    if not batch_ids:
        raise HTTPException(status_code=400, detail="Select at least one lot")

    value = None
    if payload.status_value_id:
        try:
            value = await quarantine_service.resolve_status_value(db, payload.status_value_id)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    batches = (await db.execute(select(Batch).filter(Batch.id.in_(batch_ids)))).scalars().all()
    if not batches:
        raise HTTPException(status_code=404, detail="No matching lots")
    missing = set(str(b) for b in batch_ids) - {str(b.id) for b in batches}
    if missing:
        raise HTTPException(status_code=404, detail=f"Unknown lot(s): {', '.join(sorted(missing))}")

    stamped = datetime.utcnow()
    for b in batches:
        b.quarantine_status_id = value.id if value else None
        # Snapshot the text: a later rename or delete of the attribute value must
        # not rewrite what QC actually decided about a physical lot.
        b.quarantine_status = value.value if value else None
        b.quarantine_status_at = stamped if value else None
        b.quarantine_status_by = current_user.username if value else None
        if payload.notes is not None:
            b.quarantine_notes = payload.notes or None
    await db.commit()

    label = value.value if value else "cleared"
    await audit_service.log_activity(
        db, user_id=current_user.id, action="UPDATE_STATUS", entity_type="Batch",
        entity_id=str(batches[0].id),
        details=f"Quarantine status set to {label} on {len(batches)} lot(s): "
                + ", ".join(b.batch_number for b in batches[:10])
                + ("…" if len(batches) > 10 else ""),
    )
    try:
        await manager.broadcast({"type": "QUARANTINE_UPDATE"})
        await manager.broadcast({"type": "STOCK_UPDATE"})
    except Exception:
        pass

    # Remaining qty per lot so the caller can refresh a row without a full reload.
    remaining = dict((await db.execute(
        select(StockBalance.batch_key, func.sum(StockBalance.qty))
        .filter(StockBalance.batch_key.in_([str(b.id) for b in batches]))
        .group_by(StockBalance.batch_key)
    )).all())
    return [
        QuarantineLotResponse(
            batch_id=b.id, batch_number=b.batch_number,
            item_id=b.item_id, item_code=None, item_name=None, uom=None,
            qty=float(remaining.get(str(b.id)) or 0),
            location_id=None, location_name=None, variant_key="",
            quality_status=b.quality_status,
            quarantine_status=b.quarantine_status,
            quarantine_status_id=b.quarantine_status_id,
            quarantine_status_at=b.quarantine_status_at,
            quarantine_status_by=b.quarantine_status_by,
            quarantine_notes=b.quarantine_notes,
            released=quarantine_service.is_pass(b.quarantine_status),
            created_at=b.created_at,
        )
        for b in batches
    ]
