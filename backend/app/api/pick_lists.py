from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime
import uuid

from app.db.session import get_async_db
from app.schemas import (
    PickListCreate, PickListUpdate, PickListResponse, PickListListResponse,
    PickListScanPayload,
)
from app.models.pick_list import PickList, PickListLine
from app.models.batch import Batch
from app.models.sales import SalesOrder, SalesOrderLine
from app.api.auth import get_current_user, require_permission
from app.models.auth import User
from app.services import audit_service, kpi_service, stock_service, packing_service
from app.core.ws_manager import manager

router = APIRouter(prefix="/pick-lists", tags=["pick-lists"])


# --- helpers ---------------------------------------------------------------

def _load_options():
    # sales_order is loaded plain (no .lines) — _decorate() only reads po_number/
    # customer_name, both columns on SalesOrder itself. dispatch_pick_list is the
    # one place that needs sales_order.lines, and it already runs its own dedicated
    # query for it; loading it here on every list/detail fetch was two pure-waste
    # queries that scale with SO line count for zero benefit.
    return (
        selectinload(PickList.sales_order),
        selectinload(PickList.lines).selectinload(PickListLine.item),
        selectinload(PickList.lines).selectinload(PickListLine.batch),
    )


async def _load(db: AsyncSession, pl_id) -> Optional[PickList]:
    # Session uses expire_on_commit=False, so an instance already in the identity
    # map keeps its previously-loaded (now stale) collections. Expire first so the
    # selectinload below repopulates lines with fresh post-commit rows.
    db.expire_all()
    result = await db.execute(
        select(PickList).options(*_load_options()).filter(PickList.id == pl_id)
    )
    return result.scalars().first()


def _decorate(pl: PickList) -> PickList:
    """Attach non-column display fields the response schema expects."""
    if pl.sales_order:
        pl.sales_order_code = pl.sales_order.po_number
        pl.customer_name = pl.sales_order.customer_name
    return pl


async def _next_code(db: AsyncSession) -> str:
    result = await db.execute(select(func.max(PickList.code)))
    last = result.scalar()
    n = 1
    # Legacy rows carry the old PK- prefix from when this table was packing_orders;
    # accept either so numbering continues instead of restarting at 1.
    if last and last[:3] in ("PL-", "PK-"):
        try:
            n = int(last.split("-", 1)[1]) + 1
        except (ValueError, IndexError):
            n = 1
    return f"PL-{n:05d}"


async def _remaining_by_so_line(db: AsyncSession, so: SalesOrder, exclude_pl_id=None) -> dict:
    """qty remaining to ship per SO line = ordered - already picked (non-cancelled).

    exclude_pl_id drops one pick list's own lines from the "picked" sum — used
    when editing a DRAFT so it doesn't count its own not-yet-saved allocation
    against itself.
    """
    query = (
        select(PickListLine.sales_order_line_id, func.coalesce(func.sum(PickListLine.qty_picked), 0))
        .join(PickList, PickListLine.pick_list_id == PickList.id)
        .filter(PickList.sales_order_id == so.id, PickList.status != "CANCELLED")
        .group_by(PickListLine.sales_order_line_id)
    )
    if exclude_pl_id:
        query = query.filter(PickList.id != exclude_pl_id)
    picked = await db.execute(query)
    picked_map = {str(sol_id): float(qty) for sol_id, qty in picked.all()}
    return {
        str(line.id): max(0.0, float(line.qty) - picked_map.get(str(line.id), 0.0))
        for line in so.lines
    }


async def _suggest_lines(db: AsyncSession, pl: PickList, so: SalesOrder) -> list[PickListLine]:
    """Seed a pick list with whole cartons, FIFO, for every outstanding SO line.

    A line with no cartons available falls back to a single bulk line for the
    remaining qty, so partially-cartonised orders still pick.
    """
    remaining = await _remaining_by_so_line(db, so)
    taken = await packing_service.allocated_unit_ids(db)
    lines: list[PickListLine] = []

    for so_line in so.lines:
        rem = remaining.get(str(so_line.id), 0.0)
        if rem <= 0:
            continue
        attr_ids = [str(v.id) for v in (so_line.attribute_values or [])]
        units = await packing_service.suggest_units_for_line(
            db, so_line.item_id, rem,
            location_id=pl.source_location_id,
            attribute_value_ids=attr_ids,
            color_id=so_line.color_id,
            exclude_ids=taken,
        )
        for pu, qty in units:
            taken.add(pu.id)
            loc = await _unit_location(db, pu)
            lines.append(PickListLine(
                pick_list_id=pl.id,
                sales_order_line_id=so_line.id,
                item_id=so_line.item_id,
                qty_picked=qty,
                source_location_id=loc,
                batch_id=pu.id,
            ))
        if not units:
            lines.append(PickListLine(
                pick_list_id=pl.id,
                sales_order_line_id=so_line.id,
                item_id=so_line.item_id,
                qty_picked=rem,
            ))
    return lines


async def _unit_location(db: AsyncSession, pu: Batch):
    """Where a carton physically is — the location of its (single) balance row."""
    from app.models.stock_balance import StockBalance
    result = await db.execute(
        select(StockBalance.location_id)
        .filter(StockBalance.batch_key == str(pu.id), StockBalance.qty > 0)
        .limit(1)
    )
    return result.scalar()


# --- routes ----------------------------------------------------------------

@router.get("", response_model=PickListListResponse)
async def list_pick_lists(
    status: Optional[str] = None,
    sales_order_id: Optional[uuid.UUID] = None,
    page: int = 1,
    size: int = 100,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PickList).options(*_load_options())
    count_query = select(func.count(PickList.id))
    if status:
        query = query.filter(PickList.status == status)
        count_query = count_query.filter(PickList.status == status)
    if sales_order_id:
        query = query.filter(PickList.sales_order_id == sales_order_id)
        count_query = count_query.filter(PickList.sales_order_id == sales_order_id)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(PickList.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    orders = result.scalars().all()
    for pl in orders:
        _decorate(pl)
    return PickListListResponse(items=orders, total=total, page=page, size=size)


@router.get("/{pl_id}", response_model=PickListResponse)
async def get_pick_list(
    pl_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    pl = await _load(db, pl_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    return _decorate(pl)


@router.get("/{pl_id}/remaining")
async def get_remaining_for_pick_list(
    pl_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Per-SO-line qty still available to allocate to this DRAFT, excluding its own
    lines. Lets the editor compute remaining/over-pick without loading every pick
    list in the system to sum qty_picked client-side."""
    pl_result = await db.execute(select(PickList).filter(PickList.id == pl_id))
    pl = pl_result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    so_result = await db.execute(
        select(SalesOrder).options(selectinload(SalesOrder.lines)).filter(SalesOrder.id == pl.sales_order_id)
    )
    so = so_result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    return await _remaining_by_so_line(db, so, exclude_pl_id=pl_id)


@router.post("", response_model=PickListResponse)
async def create_pick_list(
    payload: PickListCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    so_result = await db.execute(
        select(SalesOrder)
        .options(selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values))
        .filter(SalesOrder.id == payload.sales_order_id)
    )
    so = so_result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    # Allow picking partially-produced orders: ship whatever finished stock exists
    # now, even before the whole order target is met. Stock availability (enforced
    # at dispatch) is the real guard, not SO completion status.
    if so.status in ("SENT", "DELIVERED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot pick a {so.status} order")

    code = await _next_code(db)
    pl = PickList(
        code=code,
        sales_order_id=so.id,
        source_location_id=payload.source_location_id,
        status="DRAFT",
        created_by_id=current_user.id,
    )
    db.add(pl)
    await db.flush()

    if payload.lines:
        for l in payload.lines:
            db.add(PickListLine(
                pick_list_id=pl.id,
                sales_order_line_id=l.sales_order_line_id,
                item_id=l.item_id,
                qty_picked=l.qty_picked,
                source_location_id=l.source_location_id,
                batch_id=l.batch_id,
            ))
    else:
        for line in await _suggest_lines(db, pl, so):
            db.add(line)

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE", entity_type="PickList",
        entity_id=str(pl.id), details=f"Created pick list {code} for SO {so.po_number}",
    )
    try:
        await manager.broadcast({"type": "PICK_LIST_UPDATE", "id": str(pl.id)})
    except Exception:
        pass

    pl = await _load(db, pl.id)
    return _decorate(pl)


@router.put("/{pl_id}", response_model=PickListResponse)
async def update_pick_list(
    pl_id: uuid.UUID,
    payload: PickListUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    pl = await _load(db, pl_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status in ("DISPATCHED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot edit a {pl.status} pick list")

    # Scalar header fields
    for field in ("source_location_id", "status", "delivery_note_number", "delivery_date",
                  "carrier", "vehicle_plate", "driver", "notes"):
        val = getattr(payload, field)
        if val is not None:
            setattr(pl, field, val)

    if payload.qc_passed is not None:
        pl.qc_passed = payload.qc_passed
        if payload.qc_passed:
            pl.qc_at = datetime.utcnow()
            pl.qc_inspector = payload.qc_inspector
        else:
            pl.qc_at = None
            pl.qc_inspector = None
    elif payload.qc_inspector is not None:
        pl.qc_inspector = payload.qc_inspector

    # Rebuild lines
    if payload.lines is not None:
        for old in list(pl.lines):
            await db.delete(old)
        await db.flush()
        for l in payload.lines:
            db.add(PickListLine(
                pick_list_id=pl.id,
                sales_order_line_id=l.sales_order_line_id,
                item_id=l.item_id,
                qty_picked=l.qty_picked,
                source_location_id=l.source_location_id,
                batch_id=l.batch_id,
            ))

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="UPDATE", entity_type="PickList",
        entity_id=str(pl.id), details=f"Updated pick list {pl.code}",
    )

    pl = await _load(db, pl_id)
    return _decorate(pl)


@router.post("/{pl_id}/scan", response_model=PickListResponse)
async def scan_pick_list_unit(
    pl_id: uuid.UUID,
    payload: PickListScanPayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    """Picker scanned a carton QR.

    Confirms the matching suggested line when one exists; otherwise appends the
    carton to the first SO line that ordered the same item. The scan is what
    turns a *suggested* pick into a *confirmed* one — a plan the floor never
    confirmed must not dispatch.
    """
    pl = await _load(db, pl_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status in ("DISPATCHED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Pick list already {pl.status}")

    code = (payload.code or "").strip()
    pu_result = await db.execute(select(Batch).filter(Batch.batch_number == code))
    pu = pu_result.scalars().first()
    if not pu:
        raise HTTPException(status_code=404, detail=f"No lot or carton found for '{code}'")
    if not packing_service.is_packed_unit(pu):
        raise HTTPException(status_code=400, detail=f"{code} is not a packed carton")
    if pu.quality_status != "GOOD":
        raise HTTPException(status_code=400, detail=f"Carton {code} is {pu.quality_status}")

    picked_by = payload.picked_by or current_user.username
    line = next((l for l in pl.lines if l.batch_id == pu.id), None)

    if line is None:
        # Not suggested — claim it for an SO line ordering this item, if the
        # carton is not already committed to another live pick list.
        taken = await packing_service.allocated_unit_ids(db)
        if pu.id in taken:
            raise HTTPException(status_code=400, detail=f"Carton {code} is already on another pick list")
        so_result = await db.execute(
            select(SalesOrder).options(selectinload(SalesOrder.lines)).filter(SalesOrder.id == pl.sales_order_id)
        )
        so = so_result.scalars().first()
        target = next((sl for sl in (so.lines if so else []) if sl.item_id == pu.item_id), None)
        if not target:
            raise HTTPException(status_code=400, detail=f"Carton {code} is not an item on this sales order")
        loc = await _unit_location(db, pu)
        qty = 0.0
        if loc:
            qty = await stock_service.get_stock_balance(db, pu.item_id, loc, [], str(pu.id))
        line = PickListLine(
            pick_list_id=pl.id,
            sales_order_line_id=target.id,
            item_id=pu.item_id,
            qty_picked=qty,
            source_location_id=loc,
            batch_id=pu.id,
        )
        db.add(line)

    line.picked_at = datetime.utcnow()
    line.picked_by = picked_by
    if pl.status == "DRAFT":
        pl.status = "PICKING"
    await db.flush()

    # All cartons confirmed -> ready for QC / dispatch
    pending = [l for l in pl.lines if l.batch_id and not l.picked_at and l.id != line.id]
    if not pending:
        pl.status = "PICKED"

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="PICK", entity_type="PickList",
        entity_id=str(pl_id), details=f"Scanned carton {code} onto pick list {pl.code}",
    )

    pl = await _load(db, pl_id)
    return _decorate(pl)


@router.post("/{pl_id}/dispatch", response_model=PickListResponse)
async def dispatch_pick_list(
    pl_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    result = await db.execute(
        select(PickList)
        .options(
            selectinload(PickList.lines).selectinload(PickListLine.item),
            selectinload(PickList.sales_order)
            .selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values),
        )
        .filter(PickList.id == pl_id)
    )
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status in ("DISPATCHED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Pick list already {pl.status}")
    if not pl.qc_passed:
        raise HTTPException(status_code=400, detail="QC must pass before dispatch")

    pick_lines = [l for l in pl.lines if float(l.qty_picked or 0) > 0]
    if not pick_lines:
        raise HTTPException(status_code=400, detail="Nothing to dispatch (no picked quantities)")

    unconfirmed = [l for l in pick_lines if l.batch_id and not l.picked_at]
    if unconfirmed:
        raise HTTPException(
            status_code=400,
            detail=f"{len(unconfirmed)} carton(s) not yet scanned — confirm every carton before dispatch",
        )

    # SO line variant lookup
    sol_attrs = {
        str(sl.id): [str(v.id) for v in sl.attribute_values]
        for sl in pl.sales_order.lines
    }
    # Color-type FG stock is tagged with color_id (folded into variant_key), so
    # dispatch must net/deduct against the same color to hit the right pool.
    sol_colors = {
        str(sl.id): sl.color_id
        for sl in pl.sales_order.lines
    }

    # Pre-check availability for ALL lines before deducting anything
    shortages = []
    for l in pick_lines:
        src = l.source_location_id or pl.source_location_id
        if not src:
            raise HTTPException(status_code=400, detail="No source location set for one or more lines")
        attr_ids = sol_attrs.get(str(l.sales_order_line_id), [])
        color_id = sol_colors.get(str(l.sales_order_line_id))
        batch_key = str(l.batch_id) if l.batch_id else ""
        bal = await stock_service.get_stock_balance(db, l.item_id, src, attr_ids, batch_key, color_id=color_id)
        if bal + (-float(l.qty_picked)) < 0:
            shortages.append(f"{(l.item.name if l.item else l.item_id)}: have {bal}, need {float(l.qty_picked)}")
    if shortages:
        raise HTTPException(status_code=400, detail="Insufficient stock — " + "; ".join(shortages))

    # Deduct finished-goods stock (each call commits internally)
    for l in pick_lines:
        src = l.source_location_id or pl.source_location_id
        attr_ids = sol_attrs.get(str(l.sales_order_line_id), [])
        color_id = sol_colors.get(str(l.sales_order_line_id))
        await stock_service.add_stock_entry(
            db,
            item_id=l.item_id,
            location_id=src,
            qty_change=-float(l.qty_picked),
            reference_type="PICKING",
            reference_id=pl.code,
            attribute_value_ids=attr_ids,
            color_id=color_id,
            batch_id=l.batch_id,
        )

    # Mark dispatched (re-fetch: stock commits expired the instance)
    pl = await _load(db, pl_id)
    pl.status = "DISPATCHED"
    pl.dispatched_at = datetime.utcnow()
    if not pl.delivery_date:
        pl.delivery_date = pl.dispatched_at
    if not pl.delivery_note_number:
        pl.delivery_note_number = pl.code
    so_id = pl.sales_order_id
    await db.commit()

    # Recompute SO fulfilment: SENT when every line fully shipped, PARTIAL when
    # some (but not all) shipped. Leaves terminal/edited states untouched.
    so_result = await db.execute(
        select(SalesOrder).options(selectinload(SalesOrder.lines)).filter(SalesOrder.id == so_id)
    )
    so = so_result.scalars().first()
    if so and so.status in ("PENDING", "READY", "PARTIAL"):
        dispatched = await db.execute(
            select(PickListLine.sales_order_line_id, func.coalesce(func.sum(PickListLine.qty_picked), 0))
            .join(PickList, PickListLine.pick_list_id == PickList.id)
            .filter(PickList.sales_order_id == so_id, PickList.status == "DISPATCHED")
            .group_by(PickListLine.sales_order_line_id)
        )
        shipped_map = {str(sol_id): float(qty) for sol_id, qty in dispatched.all()}
        fully = all(shipped_map.get(str(line.id), 0.0) >= float(line.qty) - 1e-6 for line in so.lines)
        any_shipped = any(v > 1e-6 for v in shipped_map.values())
        new_status = "SENT" if fully else ("PARTIAL" if any_shipped else so.status)
        if new_status != so.status:
            so.status = new_status
            await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="DISPATCH", entity_type="PickList",
        entity_id=str(pl_id), details=f"Dispatched pick list {pl.code}",
    )
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
        await manager.broadcast({"type": "PICK_LIST_UPDATE", "id": str(pl_id)})
    except Exception:
        pass

    pl = await _load(db, pl_id)
    return _decorate(pl)


@router.delete("/{pl_id}")
async def delete_pick_list(
    pl_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    result = await db.execute(select(PickList).filter(PickList.id == pl_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status == "DISPATCHED":
        raise HTTPException(status_code=400, detail="Cannot delete a dispatched pick list")

    code = pl.code
    await db.delete(pl)
    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE", entity_type="PickList",
        entity_id=str(pl_id), details=f"Deleted pick list {code}",
    )
    return {"ok": True}
