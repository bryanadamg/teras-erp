from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime
import uuid

from app.db.session import get_async_db
from app.schemas import (
    PackingOrderCreate, PackingOrderUpdate, PackingOrderResponse, PackingOrderListResponse,
)
from app.models.packing import PackingOrder, PackingLine, PackingPackage, PackingPackageItem
from app.models.sales import SalesOrder, SalesOrderLine
from app.api.auth import get_current_user, require_permission
from app.models.auth import User
from app.services import audit_service, kpi_service, stock_service
from app.core.ws_manager import manager

router = APIRouter(prefix="/packing", tags=["packing"])


# --- helpers ---------------------------------------------------------------

def _load_options():
    return (
        selectinload(PackingOrder.sales_order).selectinload(SalesOrder.lines),
        selectinload(PackingOrder.lines).selectinload(PackingLine.item),
        selectinload(PackingOrder.lines).selectinload(PackingLine.batch),
        selectinload(PackingOrder.packages).selectinload(PackingPackage.contents),
    )


async def _load(db: AsyncSession, po_id) -> Optional[PackingOrder]:
    # Session uses expire_on_commit=False, so an instance already in the identity
    # map keeps its previously-loaded (now stale) collections. Expire first so the
    # selectinload below repopulates lines/packages with fresh post-commit rows.
    db.expire_all()
    result = await db.execute(
        select(PackingOrder).options(*_load_options()).filter(PackingOrder.id == po_id)
    )
    return result.scalars().first()


def _decorate(po: PackingOrder) -> PackingOrder:
    """Attach non-column display fields the response schema expects."""
    if po.sales_order:
        po.sales_order_code = po.sales_order.po_number
        po.customer_name = po.sales_order.customer_name
    return po


async def _next_code(db: AsyncSession) -> str:
    result = await db.execute(select(func.max(PackingOrder.code)))
    last = result.scalar()
    n = 1
    if last and last.startswith("PK-"):
        try:
            n = int(last.split("-", 1)[1]) + 1
        except (ValueError, IndexError):
            n = 1
    return f"PK-{n:05d}"


async def _remaining_by_so_line(db: AsyncSession, so: SalesOrder) -> dict:
    """qty remaining to ship per SO line = ordered - already packed (non-cancelled)."""
    packed = await db.execute(
        select(PackingLine.sales_order_line_id, func.coalesce(func.sum(PackingLine.qty_packed), 0))
        .join(PackingOrder, PackingLine.packing_order_id == PackingOrder.id)
        .filter(PackingOrder.sales_order_id == so.id, PackingOrder.status != "CANCELLED")
        .group_by(PackingLine.sales_order_line_id)
    )
    packed_map = {str(sol_id): float(qty) for sol_id, qty in packed.all()}
    return {
        str(line.id): max(0.0, float(line.qty) - packed_map.get(str(line.id), 0.0))
        for line in so.lines
    }


# --- routes ----------------------------------------------------------------

@router.get("", response_model=PackingOrderListResponse)
async def list_packing_orders(
    status: Optional[str] = None,
    sales_order_id: Optional[uuid.UUID] = None,
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

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(
        query.order_by(PackingOrder.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    orders = result.scalars().all()
    for po in orders:
        _decorate(po)
    return PackingOrderListResponse(items=orders, total=total, page=page, size=size)


@router.post("", response_model=PackingOrderResponse)
async def create_packing_order(
    payload: PackingOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    so_result = await db.execute(
        select(SalesOrder).options(selectinload(SalesOrder.lines)).filter(SalesOrder.id == payload.sales_order_id)
    )
    so = so_result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    # Allow packing partially-produced orders: ship whatever finished stock exists
    # now, even before the whole order target is met. Stock availability (enforced
    # at dispatch) is the real guard, not SO completion status.
    if so.status in ("SENT", "DELIVERED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot pack a {so.status} order")

    code = await _next_code(db)
    po = PackingOrder(
        code=code,
        sales_order_id=so.id,
        source_location_id=payload.source_location_id,
        status="DRAFT",
        created_by_id=current_user.id,
    )
    db.add(po)
    await db.flush()

    if payload.lines:
        for l in payload.lines:
            db.add(PackingLine(
                packing_order_id=po.id,
                sales_order_line_id=l.sales_order_line_id,
                item_id=l.item_id,
                qty_packed=l.qty_packed,
                source_location_id=l.source_location_id,
                batch_id=l.batch_id,
            ))
    else:
        # Seed from remaining-to-ship per SO line
        remaining = await _remaining_by_so_line(db, so)
        for line in so.lines:
            rem = remaining.get(str(line.id), 0.0)
            if rem <= 0:
                continue
            db.add(PackingLine(
                packing_order_id=po.id,
                sales_order_line_id=line.id,
                item_id=line.item_id,
                qty_packed=rem,
            ))

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE", entity_type="PackingOrder",
        entity_id=str(po.id), details=f"Created packing order {code} for SO {so.po_number}",
    )

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
    if po.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Cannot edit a {po.status} packing order")

    # Scalar header fields
    for field in ("source_location_id", "delivery_note_number", "delivery_date",
                  "carrier", "vehicle_plate", "driver", "notes"):
        val = getattr(payload, field)
        if val is not None:
            setattr(po, field, val)

    if payload.qc_passed is not None:
        po.qc_passed = payload.qc_passed
        if payload.qc_passed:
            po.qc_at = datetime.utcnow()
            po.qc_inspector = payload.qc_inspector
        else:
            po.qc_at = None
            po.qc_inspector = None
    elif payload.qc_inspector is not None:
        po.qc_inspector = payload.qc_inspector

    # Rebuild lines (deletes cascade package contents that reference them)
    if payload.lines is not None:
        for old in list(po.lines):
            await db.delete(old)
        await db.flush()
        for l in payload.lines:
            db.add(PackingLine(
                packing_order_id=po.id,
                sales_order_line_id=l.sales_order_line_id,
                item_id=l.item_id,
                qty_packed=l.qty_packed,
                source_location_id=l.source_location_id,
                batch_id=l.batch_id,
            ))
        await db.flush()

    # Rebuild packages + contents (resolve SO-line key -> packing line)
    if payload.packages is not None:
        line_result = await db.execute(
            select(PackingLine).filter(PackingLine.packing_order_id == po.id)
        )
        sol_to_line = {str(pl.sales_order_line_id): pl.id for pl in line_result.scalars().all()}

        for old in list(po.packages):
            await db.delete(old)
        await db.flush()

        for pkg in payload.packages:
            db_pkg = PackingPackage(
                packing_order_id=po.id,
                package_no=pkg.package_no,
                label=pkg.label,
                weight_kg=pkg.weight_kg,
                notes=pkg.notes,
            )
            db.add(db_pkg)
            await db.flush()
            for c in pkg.contents:
                line_id = sol_to_line.get(str(c.sales_order_line_id))
                if not line_id:
                    continue
                db.add(PackingPackageItem(
                    package_id=db_pkg.id,
                    packing_line_id=line_id,
                    qty=c.qty,
                ))

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="UPDATE", entity_type="PackingOrder",
        entity_id=str(po.id), details=f"Updated packing order {po.code}",
    )

    po = await _load(db, po_id)
    return _decorate(po)


@router.post("/{po_id}/dispatch", response_model=PackingOrderResponse)
async def dispatch_packing_order(
    po_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    result = await db.execute(
        select(PackingOrder)
        .options(
            selectinload(PackingOrder.lines),
            selectinload(PackingOrder.sales_order)
            .selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values),
        )
        .filter(PackingOrder.id == po_id)
    )
    po = result.scalars().first()
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    if po.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Packing order already {po.status}")
    if not po.qc_passed:
        raise HTTPException(status_code=400, detail="QC must pass before dispatch")

    pack_lines = [l for l in po.lines if float(l.qty_packed or 0) > 0]
    if not pack_lines:
        raise HTTPException(status_code=400, detail="Nothing to dispatch (no packed quantities)")

    # SO line variant lookup
    sol_attrs = {
        str(sl.id): [str(v.id) for v in sl.attribute_values]
        for sl in po.sales_order.lines
    }
    # Color-type FG stock is tagged with color_id (folded into variant_key), so
    # dispatch must net/deduct against the same color to hit the right pool.
    sol_colors = {
        str(sl.id): sl.color_id
        for sl in po.sales_order.lines
    }

    # Pre-check availability for ALL lines before deducting anything
    shortages = []
    for l in pack_lines:
        src = l.source_location_id or po.source_location_id
        if not src:
            raise HTTPException(status_code=400, detail="No source location set for one or more lines")
        attr_ids = sol_attrs.get(str(l.sales_order_line_id), [])
        color_id = sol_colors.get(str(l.sales_order_line_id))
        batch_key = str(l.batch_id) if l.batch_id else ""
        bal = await stock_service.get_stock_balance(db, l.item_id, src, attr_ids, batch_key, color_id=color_id)
        if bal + (-float(l.qty_packed)) < 0:
            shortages.append(f"{(l.item.name if l.item else l.item_id)}: have {bal}, need {float(l.qty_packed)}")
    if shortages:
        raise HTTPException(status_code=400, detail="Insufficient stock — " + "; ".join(shortages))

    # Deduct finished-goods stock (each call commits internally)
    for l in pack_lines:
        src = l.source_location_id or po.source_location_id
        attr_ids = sol_attrs.get(str(l.sales_order_line_id), [])
        color_id = sol_colors.get(str(l.sales_order_line_id))
        await stock_service.add_stock_entry(
            db,
            item_id=l.item_id,
            location_id=src,
            qty_change=-float(l.qty_packed),
            reference_type="PACKING",
            reference_id=po.code,
            attribute_value_ids=attr_ids,
            color_id=color_id,
            batch_id=l.batch_id,
        )

    # Mark dispatched (re-fetch: stock commits expired the instance)
    po = await _load(db, po_id)
    po.status = "DISPATCHED"
    po.dispatched_at = datetime.utcnow()
    if not po.delivery_date:
        po.delivery_date = po.dispatched_at
    if not po.delivery_note_number:
        po.delivery_note_number = po.code
    so_id = po.sales_order_id
    await db.commit()

    # Recompute SO fulfilment: SENT when every line fully shipped, PARTIAL when
    # some (but not all) shipped. Leaves terminal/edited states untouched.
    so_result = await db.execute(
        select(SalesOrder).options(selectinload(SalesOrder.lines)).filter(SalesOrder.id == so_id)
    )
    so = so_result.scalars().first()
    if so and so.status in ("PENDING", "READY", "PARTIAL"):
        dispatched = await db.execute(
            select(PackingLine.sales_order_line_id, func.coalesce(func.sum(PackingLine.qty_packed), 0))
            .join(PackingOrder, PackingLine.packing_order_id == PackingOrder.id)
            .filter(PackingOrder.sales_order_id == so_id, PackingOrder.status == "DISPATCHED")
            .group_by(PackingLine.sales_order_line_id)
        )
        shipped_map = {str(sol_id): float(qty) for sol_id, qty in dispatched.all()}
        fully = all(shipped_map.get(str(line.id), 0.0) >= float(line.qty) - 1e-6 for line in so.lines)
        any_shipped = any(v > 1e-6 for v in shipped_map.values())
        new_status = "SENT" if fully else ("PARTIAL" if any_shipped else so.status)
        if new_status != so.status:
            so.status = new_status
            await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="DISPATCH", entity_type="PackingOrder",
        entity_id=str(po_id), details=f"Dispatched packing order {po.code}",
    )
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    po = await _load(db, po_id)
    return _decorate(po)


@router.delete("/{po_id}")
async def delete_packing_order(
    po_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    result = await db.execute(select(PackingOrder).filter(PackingOrder.id == po_id))
    po = result.scalars().first()
    if not po:
        raise HTTPException(status_code=404, detail="Packing order not found")
    if po.status == "DISPATCHED":
        raise HTTPException(status_code=400, detail="Cannot delete a dispatched packing order")

    code = po.code
    await db.delete(po)
    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE", entity_type="PackingOrder",
        entity_id=str(po_id), details=f"Deleted packing order {code}",
    )
    return {"ok": True}
