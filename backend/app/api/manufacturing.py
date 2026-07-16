from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, inspect
from sqlalchemy.orm import selectinload, joinedload, attributes as sa_attributes
from collections import defaultdict
from app.db.session import get_async_db
from app.models.manufacturing import ManufacturingOrder, MOCompletion, MOCompletionItem, MODependency
from app.models.work_order import WorkOrder as WorkOrderModel
from app.models.bom import BOM, BOMLine, BOMSize, BOMOperation
from app.models.routing import Operation as OperationModel, WorkCenter
from app.models.location import Location
from app.models.sales import SalesOrder
from app.services import stock_service, audit_service, kpi_service, beam_service, mrp_service
from app.services.netting_service import Availability, preview_mo
from app.schemas import (
    ManufacturingOrderCreate, ManufacturingOrderResponse,
    PaginatedManufacturingOrderResponse,
    MOCompleteWithBatchesPayload,
    BatchConsumptionInMO,
    MOCompletionCreate, MOCompletionResponse, MOCompletionItemCreate,
    MOCompletionReject,
    MOAttributeUpdate,
    MOPutawayUpdate,
    MOPreviewRequest, NettingPreviewNode,
    WorkOrderFlatPageResponse, WorkOrderFlatResponse,
    WorkOrderCompletionFlat, WorkOrderCompletionItemFlat,
)
from app.models.attribute import AttributeValue
from app.models.auth import User
from app.api.auth import get_current_user, require_permission, require_any_permission, wo_scope_ok
from app.models.item import Item
from app.models.stock_balance import StockBalance
from app.models.batch import Batch, BatchConsumption
from app.api.batches import generate_batch_number
from datetime import datetime
from typing import Optional
from app.core.ws_manager import manager
import uuid

router = APIRouter()

# Helper for consistent eager loading
def get_mo_options():
    # Base relationships for the main MO
    options = [
        selectinload(ManufacturingOrder.item),
        selectinload(ManufacturingOrder.attribute_values),
        selectinload(ManufacturingOrder.planned_components),
        selectinload(ManufacturingOrder.work_orders),
        selectinload(ManufacturingOrder.sales_order),
        selectinload(ManufacturingOrder.required_dependencies),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.item),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.attribute_values),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.operations).joinedload(BOMOperation.operation),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.operations).joinedload(BOMOperation.work_center),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.lines).selectinload(BOMLine.item),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.customer),
        selectinload(ManufacturingOrder.bom).selectinload(BOM.work_center),
        selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.input_batch),
        selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.output_batch),
        selectinload(ManufacturingOrder.completions),
        # putaway bin + its parent zone (for the "Zone / Bin" display name)
        joinedload(ManufacturingOrder.planned_putaway_location).joinedload(Location.parent),
    ]

    # Sub-relationships for children (Level 1)
    child_rel = selectinload(ManufacturingOrder.child_mos)
    options.append(child_rel.selectinload(ManufacturingOrder.item))
    options.append(child_rel.selectinload(ManufacturingOrder.attribute_values))

    # Fully load BOM for children to avoid serialization errors
    child_bom = child_rel.selectinload(ManufacturingOrder.bom)
    options.append(child_bom.selectinload(BOM.item))
    options.append(child_bom.selectinload(BOM.attribute_values))
    options.append(child_bom.selectinload(BOM.operations).joinedload(BOMOperation.operation))
    options.append(child_bom.selectinload(BOM.operations).joinedload(BOMOperation.work_center))
    options.append(child_bom.selectinload(BOM.lines).selectinload(BOMLine.item))
    options.append(child_bom.selectinload(BOM.lines).selectinload(BOMLine.attribute_values))
    options.append(child_bom.selectinload(BOM.customer))
    options.append(child_bom.selectinload(BOM.work_center))

    # Support deeper levels if needed (Level 2)
    gchild_rel = child_rel.selectinload(ManufacturingOrder.child_mos)
    options.append(gchild_rel.selectinload(ManufacturingOrder.item))
    options.append(gchild_rel.selectinload(ManufacturingOrder.attribute_values))

    gchild_bom = gchild_rel.selectinload(ManufacturingOrder.bom)
    options.append(gchild_bom.selectinload(BOM.item))
    options.append(gchild_bom.selectinload(BOM.attribute_values))
    options.append(gchild_bom.selectinload(BOM.operations).joinedload(BOMOperation.operation))
    options.append(gchild_bom.selectinload(BOM.operations).joinedload(BOMOperation.work_center))
    options.append(gchild_bom.selectinload(BOM.lines).selectinload(BOMLine.item))
    options.append(gchild_bom.selectinload(BOM.lines).selectinload(BOMLine.attribute_values))
    options.append(gchild_bom.selectinload(BOM.customer))
    options.append(gchild_bom.selectinload(BOM.work_center))

    return options

def populate_mo_ids(mo: ManufacturingOrder):
    """Recursively populate attribute_value_ids for MO and its children safely."""
    # Use inspection to avoid triggering lazy loads in async context
    insp = inspect(mo)

    # 1. Populate Attribute Values (if loaded)
    if "attribute_values" not in insp.unloaded:
        mo.attribute_value_ids = [v.id for v in mo.attribute_values]

    # 1b. Populate sales_order_code (if loaded)
    if "sales_order" not in insp.unloaded and mo.sales_order:
        mo.sales_order_code = mo.sales_order.po_number

    # 2. Populate BOM IDs (if loaded)
    if "bom" not in insp.unloaded and mo.bom:
        bom_insp = inspect(mo.bom)
        if "lines" not in bom_insp.unloaded:
            for bl in mo.bom.lines:
                bl_insp = inspect(bl)
                if "attribute_values" not in bl_insp.unloaded:
                    bl.attribute_value_ids = [v.id for v in bl.attribute_values]

    # 3. Populate batch trace (if loaded)
    if "batch_consumptions" not in insp.unloaded:
        mo.batch_trace = [
            BatchConsumptionInMO(
                input_batch_id=c.input_batch_id,
                input_batch_number=c.input_batch.batch_number if c.input_batch else str(c.input_batch_id),
                output_batch_id=c.output_batch_id,
                output_batch_number=c.output_batch.batch_number if c.output_batch else None,
                qty_consumed=float(c.qty_consumed),
            )
            for c in mo.batch_consumptions
        ]
    else:
        mo.batch_trace = []

    # 3b. Populate completion totals (if loaded) — rejected entries don't count
    if "completions" not in insp.unloaded:
        mo.qty_completed_total = sum(float(c.qty_completed) for c in mo.completions if not c.rejected)
    else:
        mo.qty_completed_total = 0.0
        sa_attributes.set_committed_value(mo, "completions", [])

    # 4. Recurse into children (if loaded); stub unloaded child_mos as []
    if "child_mos" not in insp.unloaded:
        for child in mo.child_mos:
            populate_mo_ids(child)
    else:
        sa_attributes.set_committed_value(mo, "child_mos", [])

    # 5. Populate required_mo_ids from dependency pegging records (if loaded)
    if "required_dependencies" not in insp.unloaded:
        mo.required_mo_ids = [dep.required_mo_id for dep in mo.required_dependencies]
    else:
        mo.required_mo_ids = []
        sa_attributes.set_committed_value(mo, "required_dependencies", [])

async def load_mo_tree(db: AsyncSession, root_ids: list) -> dict:
    """
    Load a MO tree of arbitrary depth using a recursive CTE.
    Returns {mo.id: ManufacturingOrder} with child_mos fully populated at every level.
    """
    if not root_ids:
        return {}

    # Recursive CTE: walk from roots down to all descendants
    anchor = (
        select(ManufacturingOrder.id, ManufacturingOrder.parent_mo_id)
        .filter(ManufacturingOrder.id.in_(root_ids))
        .cte(name="mo_tree", recursive=True)
    )
    recursive_part = select(ManufacturingOrder.id, ManufacturingOrder.parent_mo_id).join(
        anchor, ManufacturingOrder.parent_mo_id == anchor.c.id
    )
    mo_cte = anchor.union_all(recursive_part)

    id_result = await db.execute(select(mo_cte.c.id))
    all_ids = [row[0] for row in id_result.fetchall()]

    if not all_ids:
        return {}

    # Load every MO in the tree with its own relationships (no child_mos eager-load)
    result = await db.execute(
        select(ManufacturingOrder)
        .options(
            selectinload(ManufacturingOrder.item),
            selectinload(ManufacturingOrder.attribute_values),
            selectinload(ManufacturingOrder.planned_components),
            selectinload(ManufacturingOrder.sales_order),
            selectinload(ManufacturingOrder.required_dependencies),
            selectinload(ManufacturingOrder.work_orders).selectinload(WorkOrderModel.work_center),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.item),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.attribute_values),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.operations).joinedload(BOMOperation.operation),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.operations).joinedload(BOMOperation.work_center),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.lines).selectinload(BOMLine.item),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.sizes).selectinload(BOMSize.size),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.customer),
            selectinload(ManufacturingOrder.bom).selectinload(BOM.work_center),
            selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.input_batch),
            selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.output_batch),
            selectinload(ManufacturingOrder.completions),
        )
        .filter(ManufacturingOrder.id.in_(all_ids))
    )
    mo_map = {mo.id: mo for mo in result.unique().scalars().all()}

    # Index children by parent
    children_by_parent: dict = defaultdict(list)
    for mo in mo_map.values():
        if mo.parent_mo_id is not None:
            children_by_parent[mo.parent_mo_id].append(mo)

    # Mark child_mos as committed on every node so Pydantic won't trigger a lazy-load
    for mo in mo_map.values():
        sa_attributes.set_committed_value(mo, "child_mos", children_by_parent.get(mo.id, []))

    # Reconstruct each WorkOrder.completions from the MO-level completions already
    # loaded, instead of a second selectinload that re-queries + re-hydrates the same
    # mo_completions rows (they carry both mo_id and work_order_id). Cuts one query and
    # halves completion-row hydration per tree — the heaviest growing cost on the Pi.
    # WorkOrder.qty_completed_total (a property summing self.completions) and the
    # frontend completion history both keep working off the committed value.
    for mo in mo_map.values():
        comps_by_wo: dict = defaultdict(list)
        for c in mo.completions:
            if c.work_order_id is not None:
                comps_by_wo[c.work_order_id].append(c)
        for wo in mo.work_orders:
            sa_attributes.set_committed_value(wo, "completions", comps_by_wo.get(wo.id, []))

    return mo_map


async def _create_wos_from_operations(db: AsyncSession, mo: ManufacturingOrder, operations: list) -> list:
    """Auto-generate WorkOrders from BOMOperation routing steps at MO creation time.
    Returns list of created WorkOrder objects (after flush so IDs are populated)."""
    if not operations:
        return []
    count_result = await db.execute(
        select(func.count()).select_from(WorkOrderModel)
        .where(WorkOrderModel.manufacturing_order_id == mo.id)
    )
    offset = count_result.scalar() or 0
    sorted_ops = sorted(operations, key=lambda o: int(o.sequence))
    created = []
    for i, op in enumerate(sorted_ops, start=1):
        code = f"{mo.code}-WO-{offset + i:02d}"
        name = op.work_center.name if (op.work_center is not None) else code
        wo = WorkOrderModel(
            manufacturing_order_id=mo.id,
            sequence=int(op.sequence),
            code=code,
            name=name,
            work_center_id=op.work_center_id,
            qty=mo.qty,
            planned_duration_hours=float(op.time_minutes) / 60 if op.time_minutes else None,
            status="PENDING",
        )
        db.add(wo)
        created.append(wo)
    return created


@router.post("/manufacturing-orders/preview", response_model=list[NettingPreviewNode])
async def preview_manufacturing_order(payload: MOPreviewRequest, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('work_order.manage'))):
    """Dry-run: netting plan for a nested MO before creation (root always made,
    components netted against net-free stock). Creates nothing."""
    location = None
    if payload.location_code:
        result = await db.execute(select(Location).filter(Location.code == payload.location_code))
        location = result.scalars().first()
    source_location = None
    if payload.source_location_code:
        src = await db.execute(select(Location).filter(Location.code == payload.source_location_code))
        source_location = src.scalars().first()
    return await preview_mo(
        db, payload.bom_id, payload.qty, location, source_location, create_nested=payload.create_nested
    )


@router.post("/manufacturing-orders", response_model=ManufacturingOrderResponse)
async def create_manufacturing_order(payload: ManufacturingOrderCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('work_order.manage'))):
    # 1. Validation
    result = await db.execute(select(BOM).filter(BOM.id == payload.bom_id))
    bom = result.scalars().first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    location = None
    if payload.location_code:
        result = await db.execute(select(Location).filter(Location.code == payload.location_code))
        location = result.scalars().first()
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")

    source_location = None
    if payload.source_location_code:
        src_result = await db.execute(select(Location).filter(Location.code == payload.source_location_code))
        source_location = src_result.scalars().first()

    # 2. Logic: Regular or Nested
    if payload.create_nested:
        try:
            # Build the net-free ledger BEFORE the root MO exists, so this MO's
            # own demand isn't scanned. Root is made full; children are netted.
            availability = await Availability.create(db)
            mo = await mrp_service.create_mo_recursive(
                db,
                payload.bom_id,
                payload.qty,
                location.id if location else None,
                current_user.id,
                source_location_id=source_location.id if source_location else None,
                sales_order_id=payload.sales_order_id,
                target_start_date=payload.target_start_date,
                target_end_date=payload.target_end_date,
                bom_size_id=payload.bom_size_id,
                availability=availability,
            )
            # Overwrite code if specified for root
            if payload.code:
                mo.code = payload.code
            await db.commit()
        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Standard Single MO logic
        result = await db.execute(select(ManufacturingOrder).filter(ManufacturingOrder.code == payload.code))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="Manufacturing Order Code already exists")

        mo = ManufacturingOrder(
            code=payload.code,
            bom_id=bom.id,
            item_id=bom.item_id,
            location_id=location.id if location else None,
            source_location_id=(source_location.id if source_location else None),
            sales_order_id=payload.sales_order_id,
            bom_size_id=payload.bom_size_id,
            qty=payload.qty,
            target_start_date=payload.target_start_date,
            target_end_date=payload.target_end_date,
            status="PENDING"
        )
        # Load attributes from BOM
        result = await db.execute(select(BOM).filter(BOM.id == payload.bom_id).options(selectinload(BOM.attribute_values)))
        bom_with_attrs = result.scalars().first()
        if bom_with_attrs:
            mo.attribute_values = bom_with_attrs.attribute_values

        db.add(mo)
        await db.flush()

        # Snapshot BOM lines at creation time
        bom_lines_result = await db.execute(
            select(BOM)
            .options(
                selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
                selectinload(BOM.operations).joinedload(BOMOperation.work_center),
            )
            .filter(BOM.id == payload.bom_id)
        )
        bom_for_snapshot = bom_lines_result.scalars().first()
        if bom_for_snapshot:
            await mrp_service.snapshot_bom_lines(db, mo, bom_for_snapshot)

        await db.commit()

    # 3. Re-fetch the full tree (unlimited depth) for response
    mo_map = await load_mo_tree(db, [mo.id])
    mo = mo_map.get(mo.id)

    await audit_service.log_activity(db, current_user.id, "CREATE", "ManufacturingOrder", str(mo.id), f"Created {'Nested' if payload.create_nested else 'Single'} MO {mo.code}")

    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": str(mo.id), "status": mo.status, "code": mo.code})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    populate_mo_ids(mo)
    return mo

@router.get("/manufacturing-orders/available-code")
async def get_available_mo_code(
    base: str = Query(..., description="Base code pattern, e.g. MO-ITEM"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    counter = 1
    while True:
        candidate = f"{base}-{str(counter).zfill(5)}"
        result = await db.execute(select(ManufacturingOrder.id).filter(ManufacturingOrder.code == candidate).limit(1))
        if result.scalars().first() is None:
            return {"code": candidate}
        counter += 1

@router.get("/manufacturing-orders", response_model=PaginatedManufacturingOrderResponse)
async def get_manufacturing_orders(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None),
    all_levels: bool = False,
    slim: bool = False,  # dashboard-only: skip load_mo_tree, return minimal fields
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    # Build a lightweight query for root MO IDs only (used for count + pagination)
    id_query = select(ManufacturingOrder.id)

    # Filter only root MOs by default — exclude shared component MOs (they appear under PR view)
    if not all_levels:
        id_query = id_query.filter(
            ManufacturingOrder.parent_mo_id == None,
            ManufacturingOrder.is_shared_component == False,
        )

    if start_date:
        id_query = id_query.filter(ManufacturingOrder.created_at >= start_date)
    if end_date:
        id_query = id_query.filter(ManufacturingOrder.created_at <= end_date)

    if search and search.strip():
        like = f"%{search.strip()}%"
        id_query = (
            id_query
            .outerjoin(Item, Item.id == ManufacturingOrder.item_id)
            .outerjoin(BOM, BOM.id == ManufacturingOrder.bom_id)
            .filter(or_(
                ManufacturingOrder.code.ilike(like),
                Item.name.ilike(like),
                Item.code.ilike(like),
                BOM.code.ilike(like),
            ))
        )

    count_result = await db.execute(select(func.count()).select_from(id_query.subquery()))
    total = count_result.scalar()

    root_id_result = await db.execute(
        id_query.order_by(ManufacturingOrder.created_at.desc()).offset(skip).limit(limit)
    )
    root_ids = [row[0] for row in root_id_result.fetchall()]

    # Slim mode: single query, no tree load. Used by the dashboard WO monitoring table
    # which only needs id/code/status/item_id/qty/qty_completed_total/target_end_date.
    if slim:
        qty_completed_sub = (
            select(func.coalesce(func.sum(MOCompletion.qty_completed), 0))
            .where(MOCompletion.mo_id == ManufacturingOrder.id, MOCompletion.rejected == False)  # noqa: E712
            .correlate(ManufacturingOrder)
            .scalar_subquery()
        )
        slim_result = await db.execute(
            select(
                ManufacturingOrder.id,
                ManufacturingOrder.code,
                ManufacturingOrder.status,
                ManufacturingOrder.item_id,
                ManufacturingOrder.qty,
                ManufacturingOrder.target_end_date,
                qty_completed_sub.label("qty_completed_total"),
            )
            .where(ManufacturingOrder.id.in_(root_ids))
            .order_by(ManufacturingOrder.created_at.desc())
        )
        slim_items = [
            {
                "id": str(row.id),
                "code": row.code,
                "status": row.status,
                "item_id": str(row.item_id) if row.item_id else None,
                "qty": float(row.qty or 0),
                "qty_completed_total": float(row.qty_completed_total or 0),
                "target_end_date": row.target_end_date.isoformat() if row.target_end_date else None,
                # stub fields the frontend schema expects
                "work_orders": [], "child_mos": [], "completions": [], "planned_components": [],
                "attribute_values": [], "required_mo_ids": [], "batch_trace": [],
                "is_material_available": True, "bom_id": None, "bom": None,
                "item": None, "sales_order": None, "is_shared_component": False,
                "parent_mo_id": None,
            }
            for row in slim_result.all()
        ]
        return JSONResponse({"items": slim_items, "total": total, "page": (skip // limit) + 1, "size": len(slim_items)})

    # Load the full tree (unlimited depth) for the paginated root MOs
    mo_map = await load_mo_tree(db, root_ids)
    items_list = [mo_map[rid] for rid in root_ids if rid in mo_map]

    # Plant-level material availability: sum on-hand across ALL locations per
    # (item, variant), matching the location-agnostic netting model.
    needed_item_ids = set()
    for item in items_list:
        populate_mo_ids(item)
        if item.status == "PENDING" and item.planned_components:
            for comp in item.planned_components:
                needed_item_ids.add(comp.item_id)

    onhand_map: dict[tuple, float] = {}
    if needed_item_ids:
        for iid, vk, q in (await db.execute(
            select(StockBalance.item_id, StockBalance.variant_key, func.sum(StockBalance.qty))
            .where(StockBalance.item_id.in_(needed_item_ids))
            .group_by(StockBalance.item_id, StockBalance.variant_key)
        )).all():
            onhand_map[(str(iid), vk or "")] = float(q or 0)

    for item in items_list:
        item.is_material_available = True
        if item.status == "PENDING" and item.planned_components:
            for comp in item.planned_components:
                if not comp.percentage:
                    continue
                req = (float(item.qty) * float(comp.percentage)) / 100
                tol = float(item.bom.tolerance_percentage or 0) if item.bom else 0
                if tol > 0: req *= (1 + (tol / 100))

                v_key = ",".join(sorted(comp.attribute_value_ids))
                if onhand_map.get((str(comp.item_id), v_key), 0) < req:
                    item.is_material_available = False
                    break

    return {
        "items": items_list,
        "total": total,
        "page": (skip // limit) + 1,
        "size": len(items_list)
    }


@router.get("/manufacturing-orders/{mo_id}", response_model=ManufacturingOrderResponse)
async def get_manufacturing_order(
    mo_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    mo_map = await load_mo_tree(db, [mo_id])
    if not mo_map:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    mo = mo_map[list(mo_map.keys())[0]]
    populate_mo_ids(mo)
    return mo


@router.get("/work-orders", response_model=WorkOrderFlatPageResponse)
async def list_work_orders_flat(
    skip: int = 0,
    limit: int = 50,
    status: str = Query(""),
    work_center_id: str = Query(""),
    group_id: str = Query(""),
    center_type: str = Query(""),
    search: str = Query(""),
    component_item_id: str = Query(""),
    unprinted: bool = Query(False),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import and_

    conditions = []
    if unprinted:
        # "Not fully printed" = the Kartu Kerja card was never printed, OR this is a
        # lot-producing WO that has weighed bags whose labels are unprinted / stale
        # (bags logged after the last label print). Mirrors the client badge logic.
        latest_bag = (
            select(func.max(MOCompletion.created_at))
            .where(MOCompletion.work_order_id == WorkOrderModel.id, MOCompletion.rejected == False)  # noqa: E712
            .correlate(WorkOrderModel)
            .scalar_subquery()
        )
        lot_wc_subq = select(WorkCenter.id).where(
            func.upper(WorkCenter.center_type).in_(["WEAVING", "TENUN", "DYEING", "CELUP", "BEAMING"])
        ).scalar_subquery()
        labels_missing = and_(
            WorkOrderModel.work_center_id.in_(lot_wc_subq),
            latest_bag.isnot(None),
            or_(
                WorkOrderModel.labels_printed_at.is_(None),
                WorkOrderModel.labels_printed_at < latest_bag,
            ),
        )
        conditions.append(or_(WorkOrderModel.card_printed_at.is_(None), labels_missing))
    if component_item_id:
        bom_ids_subq = select(BOMLine.bom_id).where(BOMLine.item_id == component_item_id).scalar_subquery()
        mo_ids_subq = select(ManufacturingOrder.id).where(ManufacturingOrder.bom_id.in_(bom_ids_subq)).scalar_subquery()
        conditions.append(WorkOrderModel.manufacturing_order_id.in_(mo_ids_subq))
    if status:
        conditions.append(WorkOrderModel.status == status)
    if work_center_id:
        conditions.append(WorkOrderModel.work_center_id == work_center_id)
    if group_id:
        wc_subq = select(WorkCenter.id).where(WorkCenter.parent_id == group_id).scalar_subquery()
        conditions.append(WorkOrderModel.work_center_id.in_(wc_subq))
    if center_type:
        ct = center_type.upper()
        alias_map = {"BEAMING": ["BEAMING"], "WEAVING": ["WEAVING", "TENUN"], "DYEING": ["DYEING", "CELUP"]}
        if ct == "OTHERS":
            named_subq = select(WorkCenter.id).where(
                func.upper(WorkCenter.center_type).in_(["BEAMING", "WEAVING", "TENUN", "DYEING", "CELUP"])
            ).scalar_subquery()
            conditions.append(or_(
                WorkOrderModel.work_center_id.is_(None),
                WorkOrderModel.work_center_id.notin_(named_subq),
            ))
        else:
            types = alias_map.get(ct, [ct])
            wc_subq = select(WorkCenter.id).where(func.upper(WorkCenter.center_type).in_(types)).scalar_subquery()
            conditions.append(WorkOrderModel.work_center_id.in_(wc_subq))
    if search and search.strip():
        like = f"%{search.strip()}%"
        conditions.append(or_(
            WorkOrderModel.name.ilike(like),
            WorkOrderModel.code.ilike(like),
            ManufacturingOrder.code.ilike(like),
        ))

    base_join = select(WorkOrderModel).join(
        ManufacturingOrder, WorkOrderModel.manufacturing_order_id == ManufacturingOrder.id
    )
    count_stmt = select(func.count(WorkOrderModel.id)).join(
        ManufacturingOrder, WorkOrderModel.manufacturing_order_id == ManufacturingOrder.id
    )
    if conditions:
        cond = and_(*conditions)
        base_join = base_join.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar() or 0

    data_stmt = (
        base_join
        .options(
            selectinload(WorkOrderModel.work_center),
            selectinload(WorkOrderModel.completions).selectinload(MOCompletion.actual_items),
            joinedload(WorkOrderModel.manufacturing_order).options(
                joinedload(ManufacturingOrder.item),
                joinedload(ManufacturingOrder.bom).selectinload(BOM.lines),
            ),
        )
        .order_by(WorkOrderModel.created_at.desc(), WorkOrderModel.sequence)
        .offset(skip)
        .limit(limit)
    )

    wos = (await db.execute(data_stmt)).scalars().unique().all()

    result = []
    for wo in wos:
        mo = wo.manufacturing_order
        bom_line_item_ids = [str(ln.item_id) for ln in (mo.bom.lines if mo and mo.bom else [])]

        completions_flat = []
        for c in sorted(wo.completions or [], key=lambda x: x.created_at or datetime.min, reverse=True):
            items_flat = [
                WorkOrderCompletionItemFlat(
                    item_id=str(ai.item_id),
                    item_code=ai.item.code if ai.item else None,
                    qty_used=float(ai.qty_used),
                )
                for ai in (c.actual_items or [])
            ]
            completions_flat.append(WorkOrderCompletionFlat(
                id=str(c.id),
                qty_completed=float(c.qty_completed),
                operator_name=c.operator_name,
                work_center_name=c.work_center.name if c.work_center else None,
                created_at=c.created_at,
                notes=c.notes,
                actual_items=items_flat,
                rejected=bool(c.rejected),
                reject_reason=c.reject_reason,
                output_batch_number=c.output_batch_number,
            ))

        result.append(WorkOrderFlatResponse(
            id=str(wo.id),
            code=wo.code,
            sequence=wo.sequence,
            name=wo.name,
            status=wo.status,
            qty=float(wo.qty) if wo.qty is not None else None,
            qty_completed_total=float(wo.qty_completed_total) if wo.qty_completed_total is not None else None,
            planned_duration_hours=wo.planned_duration_hours,
            actual_duration_hours=wo.actual_duration_hours,
            target_start_date=wo.target_start_date,
            target_end_date=wo.target_end_date,
            actual_start_date=wo.actual_start_date,
            actual_end_date=wo.actual_end_date,
            card_printed_at=wo.card_printed_at,
            labels_printed_at=wo.labels_printed_at,
            notes=wo.notes,
            created_at=wo.created_at,
            work_center_id=str(wo.work_center_id) if wo.work_center_id else None,
            work_center_name=wo.work_center.name if wo.work_center else None,
            work_center_type=wo.work_center.center_type if wo.work_center else None,
            input_location=wo.input_location,
            output_location=wo.output_location,
            next_destination_location_id=str(wo.next_destination_location_id) if wo.next_destination_location_id else None,
            next_destination_work_center_id=str(wo.next_destination_work_center_id) if wo.next_destination_work_center_id else None,
            next_destination_location_name=wo.next_destination_location_name,
            next_destination_work_center_name=wo.next_destination_work_center_name,
            ends=wo.ends,
            staging_status=wo.staging_status or "NOT_STAGED",
            bom_operation_id=str(wo.bom_operation_id) if wo.bom_operation_id else None,
            mo_id=str(mo.id),
            mo_code=mo.code,
            item_name=mo.item.name if mo and mo.item else "",
            item_id=str(mo.item_id) if mo else "",
            completions=completions_flat,
            bom_line_item_ids=bom_line_item_ids,
        ))

    return WorkOrderFlatPageResponse(
        items=result,
        total=total,
        page=(skip // limit) + 1,
        size=limit,
    )


@router.put("/manufacturing-orders/{mo_id}/status")
async def update_manufacturing_order_status(mo_id: str, status: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('work_order.manage'))):
    result = await db.execute(
        select(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .options(*get_mo_options())
    )
    mo = result.unique().scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    previous_status = mo.status
    valid_statuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    if status == "IN_PROGRESS" and previous_status != "IN_PROGRESS":
        # No stock gate at start. Material availability is decided at PR/MO creation
        # (plant-level netting) and enforced physically at staging + completion
        # (negative-stock guard). Starting an MO never requires stock to be on hand.
        mo.actual_start_date = datetime.utcnow()

    if status == "COMPLETED" and previous_status != "COMPLETED":
        mo.actual_end_date = datetime.utcnow()

        # Stock movement is owned by WO completions — no bulk deduct/credit here.
        # Update Sales Order status if root MO
        if mo.sales_order_id and mo.parent_mo_id is None:
            res = await db.execute(select(SalesOrder).filter(SalesOrder.id == mo.sales_order_id))
            so = res.scalars().first()
            if so:
                so.status = "READY"
                await audit_service.log_activity(db, current_user.id, "STATUS_CHANGE", "SalesOrder", str(so.id), f"Ready by root MO {mo.code}")

    mo.status = status
    await db.commit()

    await audit_service.log_activity(db, current_user.id, "UPDATE_STATUS", "ManufacturingOrder", mo_id, f"{previous_status} -> {status}")
    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": mo_id, "status": status, "code": mo.code})

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": f"Updated to {status}"}

@router.patch("/manufacturing-orders/{mo_id}/attributes", response_model=ManufacturingOrderResponse)
async def update_mo_attributes(
    mo_id: str,
    payload: MOAttributeUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    result = await db.execute(
        select(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .options(selectinload(ManufacturingOrder.attribute_values))
    )
    mo = result.unique().scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status != "PENDING":
        raise HTTPException(status_code=400, detail="Attributes can only be edited on a PENDING Manufacturing Order")

    old_ids = [str(v.id) for v in mo.attribute_values]

    if payload.attribute_value_ids:
        attr_result = await db.execute(
            select(AttributeValue).filter(AttributeValue.id.in_([str(v) for v in payload.attribute_value_ids]))
        )
        new_values = attr_result.scalars().all()
    else:
        new_values = []

    mo.attribute_values = new_values
    await db.commit()

    mo_map = await load_mo_tree(db, [mo.id])
    mo = mo_map.get(mo.id)

    await audit_service.log_activity(
        db, current_user.id, "UPDATE", "ManufacturingOrder", str(mo.id),
        f"Updated attributes on MO {mo.code}: {old_ids} -> {[str(v) for v in payload.attribute_value_ids]}"
    )
    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": str(mo.id), "status": mo.status, "code": mo.code})

    populate_mo_ids(mo)
    return mo

@router.patch("/manufacturing-orders/{mo_id}/putaway", response_model=ManufacturingOrderResponse)
async def update_mo_putaway(
    mo_id: str,
    payload: MOPutawayUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    """Assign the planned putaway bin — planning/store decides where the output
    will be stored before production finishes. Completions book output stock to
    this location; the WO output location is only the fallback."""
    result = await db.execute(
        select(ManufacturingOrder).filter(ManufacturingOrder.id == mo_id)
    )
    mo = result.unique().scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")
    if mo.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot set putaway on a {mo.status} MO")

    old_id = str(mo.planned_putaway_location_id) if mo.planned_putaway_location_id else None
    loc = None
    if payload.location_id:
        loc_res = await db.execute(select(Location).filter(Location.id == payload.location_id))
        loc = loc_res.scalars().first()
        if not loc:
            raise HTTPException(status_code=404, detail="Location not found")
    mo.planned_putaway_location_id = payload.location_id
    await db.commit()

    await audit_service.log_activity(
        db, current_user.id, "UPDATE", "ManufacturingOrder", str(mo.id),
        f"Putaway bin on MO {mo.code}: {old_id or 'none'} -> {loc.code if loc else 'none'}"
    )
    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": str(mo.id), "status": mo.status, "code": mo.code})
    # expire_on_commit=False: the cached instance still holds the OLD (possibly
    # None) planned_putaway_location relationship — expire so the reload joins
    # fresh. Capture the pk first: reading mo.id after expire would trigger a
    # sync lazy refresh (MissingGreenlet).
    mo_pk = mo.id
    db.expire_all()

    mo_map = await load_mo_tree(db, [mo_pk])
    mo = mo_map.get(mo_pk)
    populate_mo_ids(mo)
    return mo


@router.post("/manufacturing-orders/{mo_id}/completions", response_model=ManufacturingOrderResponse)
async def add_mo_completion(
    mo_id: str,
    payload: MOCompletionCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_any_permission('work_order.manage', 'work_order.log')),
):
    result = await db.execute(
        select(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .options(*get_mo_options())
    )
    mo = result.unique().scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot log completion on a {mo.status} MO")

    if payload.qty_completed <= 0:
        raise HTTPException(status_code=400, detail="qty_completed must be positive")

    # Validate WO if provided
    wo = None
    wo_machine_assigned = None
    if payload.work_order_id:
        wo = next((w for w in mo.work_orders if str(w.id) == str(payload.work_order_id)), None)
        if not wo:
            raise HTTPException(status_code=400, detail="Work order does not belong to this MO")
        if wo.status in ("COMPLETED", "CANCELLED"):
            raise HTTPException(status_code=400, detail=f"Cannot log on a {wo.status} work order")
        if wo.work_center_id:
            wc_type_res = await db.execute(
                select(WorkCenter.center_type).filter(WorkCenter.id == wo.work_center_id)
            )
            if not wo_scope_ok(current_user, wc_type_res.scalar()):
                raise HTTPException(status_code=403, detail="Your role is not scoped to this work order's work center type")

        # WOs created without a machine have no input/output location, so
        # completions would silently skip stock movement. Force the operator
        # to pick a machine here and persist its locations onto the WO.
        if not wo.input_location_id or not wo.output_location_id:
            if not payload.work_center_id:
                raise HTTPException(
                    status_code=400,
                    detail="This work order has no input/output location — select a Machine below to assign one before logging.",
                )
            wc_result = await db.execute(select(WorkCenter).filter(WorkCenter.id == payload.work_center_id))
            wc = wc_result.scalars().first()
            if not wc:
                raise HTTPException(status_code=404, detail="Work center not found")
            if not wc.input_location_id or not wc.output_location_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Machine '{wc.name}' has no input/output location configured — set it on the Work Center first.",
                )
            wo.work_center_id = wc.id
            wo.input_location_id = wc.input_location_id
            wo.output_location_id = wc.output_location_id
            wo_machine_assigned = wc.name

    if mo.status == "PENDING":
        raise HTTPException(status_code=400, detail="MO must be started before logging completions")

    # --- Beam handling ---
    # Beam birth: an MO producing a Beam-category item registers each completion
    # as a physical beam batch. Batch stock rows always use variant_key="" — the
    # batch itself is the identity, so attrs are intentionally not stamped.
    wo_input_loc = wo.input_location_id if wo else None
    # Putaway priority: explicit payload override (API-level) -> planned putaway
    # bin assigned on the MO by planning/store -> WO output location fallback.
    wo_output_loc = mo.planned_putaway_location_id or (wo.output_location_id if wo else None)
    if payload.output_location_id:
        loc_chk = await db.execute(select(Location.id).filter(Location.id == payload.output_location_id))
        if not loc_chk.scalar():
            raise HTTPException(status_code=404, detail="Output location not found")
        wo_output_loc = payload.output_location_id

    wo_wc_type = None
    if wo and wo.work_center_id:
        wc_type_res2 = await db.execute(
            select(WorkCenter.center_type).filter(WorkCenter.id == wo.work_center_id)
        )
        wo_wc_type = (wc_type_res2.scalar() or "").upper()

    is_beam_output = bool(
        mo.item and mo.item.category and (mo.item.category.name or "").lower() == "beam"
    )
    # Beaming WOs can live on the produced item's MO (Plan Beaming flow) —
    # a completion on a BEAMING-type work center is also a beam birth.
    if not is_beam_output and wo_wc_type == "BEAMING":
        is_beam_output = True
    # Beam lineage: beams already merged (Start-WO, or an earlier completion on
    # this MO) peg to the MO with output_batch_id=None until a lot exists to
    # claim them. If a beam is about to merge in THIS completion instead, it
    # would peg the same way. Either case means the output must get a lot now,
    # even if the item itself isn't flagged lot_tracked — otherwise the beam
    # lineage is permanently orphaned with nothing to trace back from.
    pending_beam_pegs = [c for c in mo.batch_consumptions if c.output_batch_id is None]
    will_merge_beams = bool(wo and wo_input_loc and await beam_service.has_stageable_beams(db, wo))

    # Output lot: beams always get one; other items get one when lot_tracked,
    # or when this completion needs to claim/attach beam-consumption lineage.
    # The batch row is the identity/traceability record — created even when the WO
    # has no output location; stock booking below still requires the location.
    needs_output_lot = (
        is_beam_output
        or bool(mo.item and mo.item.lot_tracked)
        or bool(pending_beam_pegs)
        or will_merge_beams
        # Greige (weaving) and dyed (dyeing) output are always traceable lots,
        # even when the item itself isn't flagged lot_tracked.
        or wo_wc_type in ("WEAVING", "DYEING", "CELUP")
    )
    output_batch = None
    if needs_output_lot:
        # Prefix communicates what the lot physically is at a glance (greige vs.
        # dyed vs. generic) — lineage itself is tracked via source_wo_id regardless.
        if is_beam_output:
            label, lot_prefix = "Beam", "BM"
        elif wo_wc_type == "WEAVING":
            label, lot_prefix = "Greige", "GRG"
        elif wo_wc_type in ("DYEING", "CELUP"):
            label, lot_prefix = "Dyed Lot", "DYE"
        else:
            label, lot_prefix = "Lot", "LOT"
        lot_no = (payload.beam_number or "").strip()
        if lot_no:
            dup = await db.execute(select(Batch.id).filter(Batch.batch_number == lot_no).limit(1))
            if dup.scalars().first():
                raise HTTPException(status_code=400, detail=f"{label} number '{lot_no}' already exists")
        else:
            lot_no = await generate_batch_number(db, prefix=lot_prefix)
            # surface the generated number to the operator via completion notes
            payload.notes = f"{payload.notes} [{label} {lot_no}]" if payload.notes else f"{label} {lot_no}"
        if not wo_output_loc:
            warn = f"{label} {lot_no} not booked to stock: work order has no output location"
            payload.notes = f"{payload.notes} [{warn}]" if payload.notes else f"[{warn}]"
        # Beam ends: per-WO planned ends (utas) override the item default
        beam_ends = None
        if is_beam_output:
            beam_ends = (wo.ends if wo and wo.ends else None) or (mo.item.ends if mo.item else None)
        output_batch = Batch(
            batch_number=lot_no,
            item_id=mo.item_id,
            ends=beam_ends,
            source_wo_id=wo.id if wo else None,
            created_by=current_user.username,
        )
        db.add(output_batch)
        await db.flush()
        # Beam-merge consumptions stay pegged at MO level (output_batch_id NULL)
        # on purpose — one beam merges into a kg pool that MULTIPLE output lots
        # draw from, so the consumption is not owned by any single lot. Claiming
        # the dangling pegs to THIS lot orphans every sibling lot's lineage:
        # trace-back resolves beams via source_wo_id → MO → NULL-pegged rows, and
        # those rows must stay NULL for all sibling lots on this WO to find them.

    # Input lots: selected batches matched to material lines by item
    input_batch_ids = list(payload.consumed_batches)
    if payload.beam_batch_id:
        input_batch_ids.append(payload.beam_batch_id)
    batch_by_item: dict[str, Batch] = {}
    if input_batch_ids:
        res = await db.execute(select(Batch).filter(Batch.id.in_(input_batch_ids)))
        found = res.scalars().all()
        if len(found) != len({str(b) for b in input_batch_ids}):
            raise HTTPException(status_code=404, detail="One or more selected lots not found")
        for b in found:
            batch_by_item[str(b.item_id)] = b
    consumed_by_batch: dict[str, float] = {}

    # Multi-lot consumption (dyeing greige substrate): the operator scanned in
    # many staged lots; each is consumed at an explicit qty. These override the
    # BOM% deduction for their items — the physical lots loaded ARE the usage.
    lots_by_item: dict[str, list[tuple[Batch, float]]] = {}
    if payload.consumed_lots:
        lot_ids = [cl.batch_id for cl in payload.consumed_lots]
        lres = await db.execute(select(Batch).filter(Batch.id.in_(lot_ids)))
        lot_map = {str(b.id): b for b in lres.scalars().all()}
        if len(lot_map) != len({str(i) for i in lot_ids}):
            raise HTTPException(status_code=404, detail="One or more consumed lots not found")
        for cl in payload.consumed_lots:
            if float(cl.qty) <= 0:
                continue
            b = lot_map[str(cl.batch_id)]
            lots_by_item.setdefault(str(b.item_id), []).append((b, float(cl.qty)))
    lot_item_ids = set(lots_by_item.keys())

    # Per-operation consumption: a WO only consumes the materials allocated to its
    # routing step (planned_component.bom_operation_id == wo.bom_operation_id).
    # If the WO has no step (legacy BOM with no operations), fall back to the whole
    # recipe so older data keeps working.
    if wo and wo.bom_operation_id:
        step_comps = [
            c for c in mo.planned_components
            if c.bom_operation_id and str(c.bom_operation_id) == str(wo.bom_operation_id)
        ]
        # Step assigned on the WO but no BOM line pegged to it (routing not fully
        # wired): consume the whole recipe rather than nothing. Mirrors the
        # work-center-type/step-agnostic fallback used at staging so materials
        # staged for this WO are actually recognized here.
        if not step_comps:
            step_comps = list(mo.planned_components)
    else:
        step_comps = list(mo.planned_components)

    # Lot enforcement: every deducted lot-tracked material must have a batch selected
    if wo_input_loc:
        if payload.actual_items:
            deducted_ids = {str(ai.item_id) for ai in payload.actual_items if float(ai.qty_used) > 0}
        else:
            deducted_ids = {str(c.item_id) for c in step_comps if c.percentage}
        # Items supplied via explicit multi-lot consumption satisfy the requirement.
        missing = [i for i in deducted_ids if i not in batch_by_item and i not in lot_item_ids]
        if missing:
            lt_res = await db.execute(
                select(Item.code).filter(Item.id.in_(missing), Item.lot_tracked == True)  # noqa: E712
            )
            lt_codes = list(lt_res.scalars().all())
            if lt_codes:
                raise HTTPException(
                    status_code=400,
                    detail=f"Lot-tracked materials require a lot/batch selection: {', '.join(lt_codes)}",
                )

    # Create completion record
    completion = MOCompletion(
        mo_id=mo.id,
        qty_completed=payload.qty_completed,
        operator_name=payload.operator_name,
        notes=payload.notes,
        work_center_id=payload.work_center_id,
        work_order_id=payload.work_order_id,
        output_batch_id=output_batch.id if output_batch else None,
        output_location_id=wo_output_loc,
    )
    db.add(completion)
    await db.flush()

    # Auto-advance WO to IN_PROGRESS on first log
    if wo and wo.status == "PENDING":
        wo.status = "IN_PROGRESS"
        wo.actual_start_date = datetime.utcnow()

    # WEAVING: any beam still sitting as batch stock at the input location
    # (WO started via this log, or re-staged mid-run) merges into the
    # batch-less kg pool now, so the deduction below draws plain pool kg —
    # no per-beam selection. Idempotent, self-guards on work center type.
    if wo and wo_input_loc:
        # Peg at MO level (output_batch_id=None), NOT this completion's lot — the
        # merged beam feeds a pool every output lot on this WO draws from, so no
        # single lot owns it. See the beam-peg NOTE above.
        await beam_service.merge_staged_beams(db, wo, output_batch_id=None)

    # Save actual items used (substitutes)
    for ai in payload.actual_items:
        db.add(MOCompletionItem(
            completion_id=completion.id,
            item_id=ai.item_id,
            qty_used=ai.qty_used,
        ))

    # Stock movement driven by WO locations only — no MO-level fallback
    if wo_input_loc:
        # Explicit multi-lot consumption first (dyeing greige): deduct each lot at
        # its own qty from the input location; these items are then skipped below.
        for item_id, lots in lots_by_item.items():
            for b, qty in lots:
                await stock_service.add_stock_entry(
                    db,
                    item_id=uuid.UUID(item_id),
                    location_id=wo_input_loc,
                    qty_change=-qty,
                    reference_type="Manufacturing Order",
                    reference_id=mo.code,
                    attribute_value_ids=[],
                    batch_id=b.id,
                )
                consumed_by_batch[str(b.id)] = consumed_by_batch.get(str(b.id), 0.0) + qty
        if payload.actual_items:
            for ai in payload.actual_items:
                if str(ai.item_id) in lot_item_ids:
                    continue  # already consumed via explicit lots
                in_batch = batch_by_item.get(str(ai.item_id))
                await stock_service.add_stock_entry(
                    db,
                    item_id=ai.item_id,
                    location_id=wo_input_loc,
                    qty_change=-float(ai.qty_used),
                    reference_type="Manufacturing Order",
                    reference_id=mo.code,
                    attribute_value_ids=[],
                    batch_id=in_batch.id if in_batch else None,
                )
                if in_batch:
                    consumed_by_batch[str(in_batch.id)] = consumed_by_batch.get(str(in_batch.id), 0.0) + float(ai.qty_used)
        elif step_comps:
            for comp in step_comps:
                if not comp.percentage:
                    continue
                if str(comp.item_id) in lot_item_ids:
                    continue  # supplied by explicit lots, not BOM% deduction
                deduct_loc_id = comp.source_location_id or wo_input_loc
                req = (float(payload.qty_completed) * float(comp.percentage)) / 100
                in_batch = batch_by_item.get(str(comp.item_id))
                await stock_service.add_stock_entry(
                    db,
                    item_id=comp.item_id,
                    location_id=deduct_loc_id,
                    qty_change=-req,
                    reference_type="Manufacturing Order",
                    reference_id=mo.code,
                    # lot batch rows carry no variant attrs — the batch is the identity
                    attribute_value_ids=[] if in_batch else [uuid.UUID(s) for s in comp.attribute_value_ids],
                    batch_id=in_batch.id if in_batch else None,
                )
                if in_batch:
                    consumed_by_batch[str(in_batch.id)] = consumed_by_batch.get(str(in_batch.id), 0.0) + req

    unused = [b.batch_number for b in batch_by_item.values() if str(b.id) not in consumed_by_batch]
    if unused:
        raise HTTPException(
            status_code=400,
            detail=f"Selected lots not consumed — check WO input location and material lines: {', '.join(unused)}",
        )
    for bid, qty in consumed_by_batch.items():
        db.add(BatchConsumption(
            manufacturing_order_id=mo.id,
            input_batch_id=uuid.UUID(bid),
            output_batch_id=output_batch.id if output_batch else None,
            qty_consumed=qty,
        ))

    if wo_output_loc:
        await stock_service.add_stock_entry(
            db,
            item_id=mo.item_id,
            location_id=wo_output_loc,
            qty_change=float(payload.qty_completed),
            reference_type="Manufacturing Order",
            reference_id=mo.code,
            # Beam batch rows carry no variant attrs — the batch is the identity.
            # Other batched outputs (greige, dyed lots) keep their variant attrs
            # alongside the batch so per-color netting still finds them.
            attribute_value_ids=[] if is_beam_output else [v.id for v in mo.attribute_values],
            batch_id=output_batch.id if output_batch else None,
        )

    # Sum all non-rejected completions to check for auto-complete
    total_result = await db.execute(
        select(func.sum(MOCompletion.qty_completed))
        .filter(MOCompletion.mo_id == mo.id, MOCompletion.rejected == False)  # noqa: E712
    )
    total_completed = float(total_result.scalar() or 0)

    if total_completed >= float(mo.qty):
        mo.status = "COMPLETED"
        mo.actual_end_date = datetime.utcnow()
        if mo.sales_order_id and mo.parent_mo_id is None:
            res = await db.execute(select(SalesOrder).filter(SalesOrder.id == mo.sales_order_id))
            so = res.scalars().first()
            if so:
                so.status = "READY"
                await audit_service.log_activity(db, current_user.id, "STATUS_CHANGE", "SalesOrder", str(so.id), f"Ready by root MO {mo.code}")

    # Auto-complete WO if cumulative logged qty reaches WO target
    if wo and wo.qty:
        wo_total_result = await db.execute(
            select(func.sum(MOCompletion.qty_completed))
            .filter(
                MOCompletion.mo_id == mo.id,
                MOCompletion.work_order_id == wo.id,
                MOCompletion.rejected == False,  # noqa: E712
            )
        )
        wo_total = float(wo_total_result.scalar() or 0)
        if wo_total >= float(wo.qty) and wo.status != "COMPLETED":
            wo.status = "COMPLETED"
            wo.actual_end_date = datetime.utcnow()

    await db.commit()
    completion_log_detail = f"Logged {payload.qty_completed} completed (total {total_completed}/{mo.qty})"
    if wo_machine_assigned:
        completion_log_detail += f" | Machine '{wo_machine_assigned}' assigned to WO {wo.code or wo.name}"
    await audit_service.log_activity(db, current_user.id, "COMPLETION", "ManufacturingOrder", mo_id, completion_log_detail)
    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": mo_id, "status": mo.status, "code": mo.code})

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    mo_map = await load_mo_tree(db, [mo.id])
    mo = mo_map.get(mo.id)
    populate_mo_ids(mo)
    return mo


@router.post("/manufacturing-orders/{mo_id}/completions/{completion_id}/reject", response_model=ManufacturingOrderResponse)
async def reject_mo_completion(
    mo_id: str,
    completion_id: str,
    payload: MOCompletionReject,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_any_permission('work_order.manage', 'work_order.edit')),
):
    """QC reject of a produced lot. The completion stops counting toward MO/WO
    progress (MO reopens if it had auto-completed) and the output lot is marked
    REJECTED — it stays physically in stock but drops out of good-stock netting
    and consumption pickers. Rework is a NEW work order created manually for the
    shortfall; this endpoint does not touch the original WO."""
    result = await db.execute(
        select(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .options(*get_mo_options())
    )
    mo = result.unique().scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    comp = next((c for c in mo.completions if str(c.id) == str(completion_id)), None)
    if not comp:
        raise HTTPException(status_code=404, detail="Completion not found on this MO")
    if comp.rejected:
        raise HTTPException(status_code=400, detail="Completion is already rejected")

    if comp.work_order_id:
        wc_type_res = await db.execute(
            select(WorkCenter.center_type)
            .join(WorkOrderModel, WorkOrderModel.work_center_id == WorkCenter.id)
            .filter(WorkOrderModel.id == comp.work_order_id)
        )
        if not wo_scope_ok(current_user, wc_type_res.scalar()):
            raise HTTPException(status_code=403, detail="Your role is not scoped to this work order's work center type")

    # Resolve the output lot: linked at creation, or named explicitly for
    # legacy completions that predate the output_batch_id link.
    batch = None
    batch_id = payload.output_batch_id or comp.output_batch_id
    if batch_id:
        b_res = await db.execute(select(Batch).filter(Batch.id == batch_id))
        batch = b_res.scalars().first()
        if payload.output_batch_id and not batch:
            raise HTTPException(status_code=404, detail="Output lot not found")

    comp.rejected = True
    comp.reject_reason = (payload.reason or "").strip() or None
    comp.rejected_at = datetime.utcnow()
    comp.rejected_by = current_user.username

    if batch:
        # Lot stays in stock, flagged — netting/pickers exclude REJECTED lots.
        batch.quality_status = "REJECTED"
        if not comp.output_batch_id:
            comp.output_batch_id = batch.id
    else:
        # Un-lotted output can't be flagged — pull it back out of the location it
        # was actually booked to (putaway bin recorded on the completion; WO
        # output location for legacy rows) so it stops counting as good stock.
        wo = next((w for w in mo.work_orders if str(w.id) == str(comp.work_order_id)), None)
        out_loc = comp.output_location_id or (wo.output_location_id if wo else None)
        if out_loc:
            await stock_service.add_stock_entry(
                db,
                item_id=mo.item_id,
                location_id=out_loc,
                qty_change=-float(comp.qty_completed),
                reference_type="Reject",
                reference_id=mo.code,
                attribute_value_ids=[v.id for v in mo.attribute_values],
                batch_id=None,
            )

    # Progress returns to the MO: reopen if the reject drops it below target.
    total_result = await db.execute(
        select(func.sum(MOCompletion.qty_completed))
        .filter(MOCompletion.mo_id == mo.id, MOCompletion.rejected == False)  # noqa: E712
    )
    total_good = float(total_result.scalar() or 0)
    if mo.status == "COMPLETED" and total_good < float(mo.qty):
        mo.status = "IN_PROGRESS"
        mo.actual_end_date = None

    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "REJECT", "ManufacturingOrder", mo_id,
        f"Rejected completion of {float(comp.qty_completed):g}"
        + (f" (lot {batch.batch_number})" if batch else "")
        + (f": {comp.reject_reason}" if comp.reject_reason else "")
        + f" — good total {total_good:g}/{mo.qty}",
    )
    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": mo_id, "status": mo.status, "code": mo.code})
    await manager.broadcast({"type": "STOCK_UPDATE"})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    mo_map = await load_mo_tree(db, [mo.id])
    mo = mo_map.get(mo.id)
    populate_mo_ids(mo)
    return mo


@router.post("/manufacturing-orders/{mo_id}/complete-with-batches")
async def complete_manufacturing_order_with_batches(
    mo_id: str,
    payload: MOCompleteWithBatchesPayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    from app.models.batch import BatchConsumption

    result = await db.execute(
        select(ManufacturingOrder)
        .filter(ManufacturingOrder.id == mo_id)
        .options(*get_mo_options())
    )
    mo = result.unique().scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    if mo.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Already completed")

    # Build lookup: (item_id, sorted attr ids) -> batch_id + qty from payload
    batch_map: dict[tuple, uuid.UUID] = {}
    for mb in payload.material_batches:
        key = (str(mb.bom_line_item_id), ",".join(sorted(str(v) for v in mb.attribute_value_ids)))
        batch_map[key] = (mb.batch_id, mb.qty)

    if mo.planned_components:
        for comp in mo.planned_components:
            if not comp.percentage:
                continue
            req = (float(mo.qty) * float(comp.percentage)) / 100
            tol = float(mo.bom.tolerance_percentage or 0) if mo.bom else 0
            if tol > 0:
                req *= (1 + (tol / 100))

            deduct_loc_id = comp.source_location_id or mo.source_location_id
            if not deduct_loc_id:
                continue
            attr_ids = [uuid.UUID(s) for s in comp.attribute_value_ids]
            key = (str(comp.item_id), ",".join(sorted(str(v) for v in attr_ids)))
            batch_id, _ = batch_map.get(key, (None, req))

            await stock_service.add_stock_entry(
                db,
                item_id=comp.item_id,
                location_id=deduct_loc_id,
                qty_change=-req,
                reference_type="Manufacturing Order",
                reference_id=mo.code,
                attribute_value_ids=attr_ids,
                batch_id=batch_id,
            )

            # Record traceability if both batches known
            if batch_id and payload.output_batch_id:
                consumption = BatchConsumption(
                    manufacturing_order_id=mo.id,
                    input_batch_id=batch_id,
                    output_batch_id=payload.output_batch_id,
                    qty_consumed=req,
                )
                db.add(consumption)

    # FG credit requires a WO with output_location_id — this endpoint has no WO reference,
    # so stock movement is handled by WO completions via the standard completion path.

    mo.status = "COMPLETED"
    mo.actual_end_date = datetime.utcnow()

    if mo.sales_order_id and mo.parent_mo_id is None:
        res = await db.execute(select(SalesOrder).filter(SalesOrder.id == mo.sales_order_id))
        so = res.scalars().first()
        if so:
            so.status = "READY"

    await db.commit()
    await audit_service.log_activity(db, current_user.id, "COMPLETE", "ManufacturingOrder", mo_id, f"Completed with batch tracking")
    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": mo_id, "status": "COMPLETED", "code": mo.code})

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": "Completed with batch tracking"}


async def _collect_mo_delete_set(db: AsyncSession, root_id: uuid.UUID) -> set:
    """Collect the full set of MO ids to delete when deleting `root_id`:
    - the parent->child subtree (via parent_mo_id), recursively
    - any consolidated/shared component MOs pegged via MODependency, but ONLY
      when every MO that still depends on them is already inside the delete set
      (i.e. no surviving sibling root still needs them).
    Iterates to a fixpoint so nested components are handled."""
    delete_set: set = set()
    # 1. parent->child subtree via BFS
    frontier = [root_id]
    while frontier:
        current = frontier.pop()
        if current in delete_set:
            continue
        delete_set.add(current)
        rows = await db.execute(
            select(ManufacturingOrder.id).filter(ManufacturingOrder.parent_mo_id == current)
        )
        frontier.extend(rows.scalars().all())

    # 2. pull in exclusively-owned pegged component MOs, to a fixpoint
    changed = True
    while changed:
        changed = False
        # component MOs required by anything already in the delete set
        dep_rows = await db.execute(
            select(MODependency.required_mo_id).filter(
                MODependency.dependent_mo_id.in_(delete_set)
            )
        )
        candidates = {c for c in dep_rows.scalars().all() if c not in delete_set}
        for comp_id in candidates:
            # who still depends on this component?
            dependents = await db.execute(
                select(MODependency.dependent_mo_id).filter(
                    MODependency.required_mo_id == comp_id
                )
            )
            dependent_ids = set(dependents.scalars().all())
            # exclusively owned by the delete set -> safe to delete (pull in its
            # own subtree too via the outer loop)
            if dependent_ids.issubset(delete_set):
                # add component + its parent->child subtree
                sub_frontier = [comp_id]
                while sub_frontier:
                    cur = sub_frontier.pop()
                    if cur in delete_set:
                        continue
                    delete_set.add(cur)
                    changed = True
                    kids = await db.execute(
                        select(ManufacturingOrder.id).filter(ManufacturingOrder.parent_mo_id == cur)
                    )
                    sub_frontier.extend(kids.scalars().all())
    return delete_set


@router.delete("/manufacturing-orders/{mo_id}")
async def delete_manufacturing_order(mo_id: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('work_order.manage'))):
    result = await db.execute(select(ManufacturingOrder).filter(ManufacturingOrder.id == mo_id))
    mo = result.scalars().first()
    if not mo: raise HTTPException(status_code=404, detail="Not found")
    mo_code = mo.code

    delete_ids = await _collect_mo_delete_set(db, mo.id)
    # Load full objects so ORM cascades (work_orders, completions, planned_components,
    # MODependency rows) fire; delete children before parents to satisfy the
    # parent_mo_id FK (no DB-level ON DELETE CASCADE on the self-reference).
    objs_result = await db.execute(
        select(ManufacturingOrder).filter(ManufacturingOrder.id.in_(delete_ids))
    )
    objs = {o.id: o for o in objs_result.scalars().all()}

    # topological order: deepest (leaf) first via parent chain depth
    def _depth(oid):
        d, cur = 0, objs.get(oid)
        seen = set()
        while cur is not None and cur.parent_mo_id in objs and cur.parent_mo_id not in seen:
            seen.add(cur.id)
            d += 1
            cur = objs.get(cur.parent_mo_id)
        return d
    for oid in sorted(objs.keys(), key=_depth, reverse=True):
        await db.delete(objs[oid])

    await db.commit()
    deleted_count = len(delete_ids)
    await audit_service.log_activity(
        db, current_user.id, "DELETE", "manufacturing_order", mo_id,
        details=f"Deleted MO {mo_code} and {deleted_count - 1} descendant/component MO(s)"
    )

    await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": mo_id, "status": "DELETED", "code": mo_code})
    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success"}
