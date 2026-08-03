from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete, update as sa_update
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy.exc import IntegrityError
from app.db.session import get_async_db
from app.schemas import SalesOrderCreate, SalesOrderUpdate, SalesOrderResponse
from app.models.sales import SalesOrder, SalesOrderLine, sales_order_line_values
from app.models.attribute import AttributeValue
from app.models.color import Color
from app.models.production_run import ProductionRun
from app.models.manufacturing import ManufacturingOrder
from app.models.work_order import WorkOrder
from app.models.batch import Batch
from app.models.stock_balance import StockBalance
from app.models.packing import PackingOrder
from app.api.auth import get_current_user, require_permission
from app.models.auth import User
from app.services import audit_service, kpi_service, so_fulfilment_service
from app.core.ws_manager import manager
from typing import Optional
from datetime import datetime
import uuid

router = APIRouter(prefix="/sales-orders", tags=["sales"])


def _line_opts():
    """Eager-load options shared by every SO fetch that serializes lines."""
    return (
        selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values),
        selectinload(SalesOrder.lines).selectinload(SalesOrderLine.item),
        selectinload(SalesOrder.lines).selectinload(SalesOrderLine.color),
        selectinload(SalesOrder.lines).selectinload(SalesOrderLine.labdip_item),
    )


async def _populate_fulfilment(db: AsyncSession, orders: list) -> None:
    """Attach derived fulfilment numbers to every line of these orders.

    One batched aggregate for the whole set — see so_fulfilment_service. The
    fields must be declared on SalesOrderLineResponse or response_model drops
    them silently.
    """
    if not orders:
        return
    fulfilment = await so_fulfilment_service.fulfilment_map(db, [o.id for o in orders])
    for so in orders:
        for line in so.lines:
            f = fulfilment.get(str(line.id)) or {}
            line.qty_made = f.get("made", 0.0)
            line.qty_packed = f.get("packed", 0.0)
            line.qty_packed_available = f.get("packed_available", 0.0)
            line.qty_dispatched = f.get("dispatched", 0.0)


def _populate_line(line: SalesOrderLine) -> None:
    """Fill response-only fields on a SO line from its eager-loaded relations."""
    line.attribute_value_ids = [v.id for v in line.attribute_values]
    if line.item:
        line.item_name = line.item.name
        line.item_code = line.item.code
    if line.color:
        line.color_code = line.color.code
        line.color_name = line.color.name
        line.color_hex = line.color.hex
    # Pending shade: surface the linked lab dip item's current status (PENDING/
    # IN_PROGRESS/APPROVED/REJECTED). Shown until an approved color_id backfills.
    if line.labdip_item is not None:
        line.labdip_status = line.labdip_item.status

@router.post("", response_model=SalesOrderResponse)
async def create_sales_order(payload: SalesOrderCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('sales.manage'))):
    try:
        # Check duplicate PO
        result = await db.execute(select(SalesOrder).filter(SalesOrder.po_number == payload.po_number))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail=f"PO Number '{payload.po_number}' already exists")

        so = SalesOrder(
            po_number=payload.po_number,
            customer_po_ref=payload.customer_po_ref,
            customer_name=payload.customer_name,
            order_date=payload.order_date or datetime.utcnow()
        )
        db.add(so)
        await db.flush() # Get ID

        for line in payload.lines:
            db_line = SalesOrderLine(
                sales_order_id=so.id,
                item_id=line.item_id,
                qty=line.qty,
                due_date=line.due_date,
                internal_confirmation_date=line.internal_confirmation_date,
                ket_stock=line.ket_stock,
                qty_kg=line.qty_kg,
                qty2=line.qty2,
                uom2=line.uom2,
                uom2_factor=line.uom2_factor,
                bom_id=line.bom_id,
                bom_size_id=line.bom_size_id,
                color_id=line.color_id,
                labdip_variant_code=line.labdip_variant_code,
                labdip_item_id=line.labdip_item_id,
            )
            if line.attribute_value_ids:
                attr_result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids)))
                db_line.attribute_values = attr_result.scalars().all()
            db.add(db_line)

        await db.commit()
    except HTTPException:
        raise
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Database integrity error (duplicate reference or invalid ID)")
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
    # Refresh with eager loading
    final_result = await db.execute(
        select(SalesOrder)
        .options(*_line_opts())
        .filter(SalesOrder.id == so.id)
    )
    so_refreshed = final_result.scalars().first()

    for line in so_refreshed.lines:
        _populate_line(line)
    await _populate_fulfilment(db, [so_refreshed])

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="SalesOrder",
        entity_id=str(so_refreshed.id),
        details=f"Created SO {so_refreshed.po_number}"
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return so_refreshed

@router.get("", response_model=list[SalesOrderResponse])
async def get_sales_orders(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(SalesOrder)
        .options(*_line_opts())
    )
    if status:
        # comma-separated so callers that only need packable orders (e.g. Packing's
        # SO picker) can scope to a few statuses instead of pulling every SO ever
        # placed, which otherwise fetches unbounded and grows with order history.
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        query = query.filter(SalesOrder.status.in_(statuses)) if len(statuses) > 1 else query.filter(SalesOrder.status == statuses[0])
    result = await db.execute(
        query.order_by(SalesOrder.created_at.desc())
    )
    orders = result.scalars().all()

    for so in orders:
        for line in so.lines:
            _populate_line(line)
    await _populate_fulfilment(db, list(orders))

    return orders


@router.get("/{so_id}", response_model=SalesOrderResponse)
async def get_sales_order(
    so_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SalesOrder).options(*_line_opts()).filter(SalesOrder.id == so_id)
    )
    so = result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    for line in so.lines:
        _populate_line(line)
    await _populate_fulfilment(db, [so])
    return so

@router.put("/{so_id}", response_model=SalesOrderResponse)
async def update_sales_order(so_id: uuid.UUID, payload: SalesOrderUpdate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('sales.manage'))):
    result = await db.execute(select(SalesOrder).filter(SalesOrder.id == so_id))
    so = result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="SO not found")

    if so.status not in ["PENDING", "READY"]:
        raise HTTPException(status_code=400, detail=f"Cannot edit SO with status '{so.status}'")

    if payload.po_number != so.po_number:
        dup = await db.execute(select(SalesOrder).filter(SalesOrder.po_number == payload.po_number))
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail=f"PO Number '{payload.po_number}' already exists")

    so.po_number = payload.po_number
    so.customer_po_ref = payload.customer_po_ref
    so.customer_name = payload.customer_name
    so.order_date = payload.order_date or so.order_date
    so.notes = payload.notes

    line_ids_result = await db.execute(
        select(SalesOrderLine.id).where(SalesOrderLine.sales_order_id == so_id)
    )
    line_ids = line_ids_result.scalars().all()

    # An edit rebuilds every line from scratch, and `packing_orders.sales_order_line_id`
    # is ON DELETE SET NULL — so a plain edit would quietly orphan the packing links
    # that decide whether this order is READY. Snapshot the links plus each old line's
    # variant identity here, then re-point them onto the equivalent new line below.
    old_identity = {}
    pack_refs = []
    if line_ids:
        old_identity = {
            str(r[0]): (r[1], r[2], r[3], r[4])
            for r in (
                await db.execute(
                    select(
                        SalesOrderLine.id, SalesOrderLine.item_id, SalesOrderLine.bom_id,
                        SalesOrderLine.bom_size_id, SalesOrderLine.color_id,
                    ).where(SalesOrderLine.sales_order_id == so_id)
                )
            ).all()
        }
        pack_refs = (
            await db.execute(
                select(PackingOrder.id, PackingOrder.sales_order_line_id)
                .where(PackingOrder.sales_order_line_id.in_(line_ids))
            )
        ).all()

        await db.execute(sa_delete(sales_order_line_values).where(
            sales_order_line_values.c.sales_order_line_id.in_(line_ids)
        ))
    await db.execute(sa_delete(SalesOrderLine).where(SalesOrderLine.sales_order_id == so_id))
    await db.flush()

    new_lines = []
    for line in payload.lines:
        db_line = SalesOrderLine(
            sales_order_id=so.id,
            item_id=line.item_id,
            qty=line.qty,
            due_date=line.due_date,
            internal_confirmation_date=line.internal_confirmation_date,
            ket_stock=line.ket_stock,
            qty_kg=line.qty_kg,
            qty2=line.qty2,
            uom2=line.uom2,
            uom2_factor=line.uom2_factor,
            bom_id=line.bom_id,
            bom_size_id=line.bom_size_id,
            color_id=line.color_id,
            labdip_variant_code=line.labdip_variant_code,
            labdip_item_id=line.labdip_item_id,
        )
        if line.attribute_value_ids:
            attr_result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids)))
            db_line.attribute_values = attr_result.scalars().all()
        db.add(db_line)
        new_lines.append(db_line)

    if pack_refs:
        await db.flush()  # ids are assigned on INSERT, not on construction
        new_by_identity = {}
        for l in new_lines:
            new_by_identity.setdefault((l.item_id, l.bom_id, l.bom_size_id, l.color_id), l.id)
        for po_id, old_line_id in pack_refs:
            new_id = new_by_identity.get(old_identity.get(str(old_line_id)))
            if new_id:
                await db.execute(
                    sa_update(PackingOrder)
                    .where(PackingOrder.id == po_id)
                    .values(sales_order_line_id=new_id)
                )

    await db.commit()

    # Line qtys may have moved past (or back under) what is packed.
    if await so_fulfilment_service.recompute_so_status(db, so_id):
        await db.commit()

    final_result = await db.execute(
        select(SalesOrder)
        .options(*_line_opts())
        .filter(SalesOrder.id == so.id)
    )
    so_refreshed = final_result.scalars().first()

    for line in so_refreshed.lines:
        _populate_line(line)
    await _populate_fulfilment(db, [so_refreshed])

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="SalesOrder",
        entity_id=str(so.id),
        details=f"Updated SO {so_refreshed.po_number}"
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return so_refreshed

@router.put("/{so_id}/status", response_model=SalesOrderResponse)
async def update_sales_order_status(so_id: uuid.UUID, status: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('sales.manage'))):
    result = await db.execute(
        select(SalesOrder)
        .options(*_line_opts())
        .filter(SalesOrder.id == so_id)
    )
    so = result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="SO not found")

    prev_status = so.status
    valid_statuses = ["PENDING", "READY", "PARTIAL", "SENT", "DELIVERED", "CANCELLED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    so.status = status
    if status == "DELIVERED":
        so.delivered_at = datetime.utcnow()

    await db.commit()

    for line in so.lines:
        _populate_line(line)
    await _populate_fulfilment(db, [so])

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="STATUS_CHANGE",
        entity_type="SalesOrder",
        entity_id=str(so.id),
        details=f"Status: {prev_status} -> {status}"
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return so

@router.delete("/{so_id}")
async def delete_sales_order(so_id: uuid.UUID, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('sales.manage'))):
    result = await db.execute(select(SalesOrder).filter(SalesOrder.id == so_id))
    so = result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="SO not found")
    
    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="sales_order",
        entity_id=str(so.id),
        details=f"Deleted SO {so.po_number}"
    )
    await db.delete(so)
    await db.commit()

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success"}


@router.get("/{so_id}/lineage")
async def get_sales_order_lineage(
    so_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Full production lineage for a Sales Order: SO → Production Runs → MOs → WOs → beams.

    Shows everything produced for this SO so users can see how every MO, WO and beam
    ties back to the order that started it. Shared component MOs (consolidated greige/base)
    are nested under the root MO that depends on them, with the dependency qty."""
    so_result = await db.execute(select(SalesOrder).filter(SalesOrder.id == so_id))
    so = so_result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="SO not found")

    pr_result = await db.execute(
        select(ProductionRun)
        .filter(ProductionRun.sales_order_id == so_id)
        .order_by(ProductionRun.created_at)
    )
    prs = pr_result.scalars().all()
    pr_ids = [pr.id for pr in prs]

    # Load every MO under those PRs with the data needed to build the tree
    mos_by_pr: dict = {}
    all_mos: list = []
    if pr_ids:
        mos_result = await db.execute(
            select(ManufacturingOrder)
            .options(
                selectinload(ManufacturingOrder.item),
                selectinload(ManufacturingOrder.work_orders).joinedload(WorkOrder.work_center),
                selectinload(ManufacturingOrder.required_dependencies),
            )
            .filter(ManufacturingOrder.production_run_id.in_(pr_ids))
        )
        for mo in mos_result.scalars().unique().all():
            mos_by_pr.setdefault(mo.production_run_id, []).append(mo)
            all_mos.append(mo)

    # Beams produced by any WO under this SO: source_wo_id → beam Batch
    all_wo_ids = [wo.id for mo in all_mos for wo in mo.work_orders]
    beams_by_wo: dict = {}
    if all_wo_ids:
        batch_rows = await db.execute(
            select(Batch).options(joinedload(Batch.item)).filter(Batch.source_wo_id.in_(all_wo_ids))
        )
        batches = batch_rows.scalars().all()
        keys = [str(b.id) for b in batches]
        remaining_map: dict = {}
        if keys:
            bal = await db.execute(
                select(StockBalance.batch_key, func.sum(StockBalance.qty))
                .filter(StockBalance.batch_key.in_(keys))
                .group_by(StockBalance.batch_key)
            )
            remaining_map = {k: float(v or 0) for k, v in bal.all()}
        for b in batches:
            beams_by_wo.setdefault(b.source_wo_id, []).append({
                "id": str(b.id),
                "batch_number": b.batch_number,
                "item_code": b.item.code if b.item else None,
                "ends": b.ends,
                "remaining": remaining_map.get(str(b.id), 0.0),
            })

    def wo_node(wo) -> dict:
        return {
            "id": str(wo.id),
            "code": wo.code,
            "name": wo.name,
            "sequence": wo.sequence,
            "work_center_name": wo.work_center.name if wo.work_center else None,
            "status": wo.status,
            "qty": float(wo.qty) if wo.qty is not None else None,
            "beams": beams_by_wo.get(wo.id, []),
        }

    def mo_node(mo, dep_qty=None) -> dict:
        return {
            "id": str(mo.id),
            "code": mo.code,
            "item_code": mo.item.code if mo.item else None,
            "item_name": mo.item.name if mo.item else None,
            "qty": float(mo.qty),
            "status": mo.status,
            "is_shared_component": mo.is_shared_component,
            "dep_qty": dep_qty,
            "work_orders": [wo_node(w) for w in sorted(mo.work_orders, key=lambda x: x.sequence)],
            "component_mos": [],
        }

    production_runs = []
    for pr in prs:
        pr_mos = mos_by_pr.get(pr.id, [])
        comp_map = {mo.id: mo for mo in pr_mos if mo.is_shared_component}
        roots = [mo for mo in pr_mos if not mo.is_shared_component]
        root_nodes = []
        pegged: set = set()
        for r in roots:
            rn = mo_node(r)
            for dep in r.required_dependencies:
                comp = comp_map.get(dep.required_mo_id)
                if comp:
                    pegged.add(dep.required_mo_id)
                    rn["component_mos"].append(mo_node(comp, dep_qty=float(dep.qty)))
            root_nodes.append(rn)
        # Components not pegged to any root (defensive — should be rare)
        unpegged = [mo_node(c) for cid, c in comp_map.items() if cid not in pegged]
        production_runs.append({
            "id": str(pr.id),
            "code": pr.code,
            "status": pr.status,
            "manufacturing_orders": root_nodes,
            "unpegged_components": unpegged,
        })

    return {
        "sales_order": {
            "id": str(so.id),
            "po_number": so.po_number,
            "customer_name": so.customer_name,
            "status": so.status,
        },
        "production_runs": production_runs,
    }
