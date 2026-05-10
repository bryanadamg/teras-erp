from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload
from app.db.session import get_async_db
from uuid import UUID
from app.models.production_run import ProductionRun
from app.models.manufacturing import ManufacturingOrder, MODependency, MOPlannedComponent
from app.models.bom import BOM, BOMLine, BOMSize
from app.models.work_order import WorkOrder as WorkOrderModel
from app.models.location import Location
from app.models.batch import BatchConsumption
from app.schemas import (
    ProductionRunCreate, ProductionRunResponse,
    PaginatedProductionRunResponse, ManufacturingOrderCreate,
    PRMaterialRequirementItem, PRMOContribution,
)
from app.models.production_run import PRBomEntry, PRBomEntrySize
from app.models.item import Item
from app.services import stock_service
from app.api.manufacturing import create_mo_recursive
from collections import defaultdict
from app.models.auth import User
from app.api.auth import get_current_user
from app.services import audit_service
from app.core.ws_manager import manager
import uuid
from datetime import datetime

router = APIRouter()


async def _create_consolidated_component_mos(
    db: AsyncSession,
    bom_ro_pairs: list[tuple],
    location,
    source_location,
    sales_order_id,
    production_run_id,
    target_start_date,
    target_end_date,
    user_id,
):
    """Pass 2 of PR creation: walk all BOMs in the run, aggregate component demand across
    ALL root MOs from ALL BOM entries, create ONE consolidated component MO per unique
    sub-assembly (keyed on item_id + sub_bom_id + src_loc), and write MODependency
    pegging records. This consolidates shared greige/base items across color variants."""

    # Aggregate demand: (item_id, sub_bom_id, src_loc_id) → {sub_bom_id, total_qty, contributions}
    demand: dict[tuple, dict] = {}

    for bom, root_mos in bom_ro_pairs:
        bom_result = await db.execute(
            select(BOM).options(selectinload(BOM.lines)).filter(BOM.id == bom.id)
        )
        bom_with_lines = bom_result.scalars().first()
        if not bom_with_lines:
            continue

        for line in bom_with_lines.lines:
            if not line.percentage:
                continue
            sub_bom_result = await db.execute(
                select(BOM).filter(BOM.item_id == line.item_id, BOM.active == True).limit(1)
            )
            sub_bom = sub_bom_result.scalars().first()
            if not sub_bom:
                continue

            src_loc_id = line.source_location_id or (source_location.id if source_location else None)
            key = (str(line.item_id), str(sub_bom.id), str(src_loc_id))

            if key not in demand:
                demand[key] = {"sub_bom_id": sub_bom.id, "total_qty": 0.0, "src_loc_id": src_loc_id, "contributions": {}}

            for root_mo in root_mos:
                contrib_qty = (float(root_mo.qty) * float(line.percentage)) / 100
                demand[key]["total_qty"] += contrib_qty
                demand[key]["contributions"][root_mo.id] = demand[key]["contributions"].get(root_mo.id, 0.0) + contrib_qty

    # Create one consolidated component MO per unique sub-assembly, write pegging records
    for data in demand.values():
        component_mo = await create_mo_recursive(
            db,
            data["sub_bom_id"],
            data["total_qty"],
            location.id,
            user_id,
            parent_mo_id=None,
            source_location_id=data["src_loc_id"],
            sales_order_id=None,
            production_run_id=production_run_id,
            target_start_date=target_start_date,
            target_end_date=target_end_date,
            create_children=True,
        )
        component_mo.is_shared_component = True
        await db.flush()

        for root_mo_id, contrib_qty in data["contributions"].items():
            db.add(MODependency(
                dependent_mo_id=root_mo_id,
                required_mo_id=component_mo.id,
                qty=contrib_qty,
            ))

    await db.flush()

def _bom_load_options():
    return [
        joinedload(BOM.item),
        joinedload(BOM.customer),
        joinedload(BOM.work_center),
        selectinload(BOM.attribute_values),
        selectinload(BOM.lines).selectinload(BOMLine.item),
        selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
        selectinload(BOM.operations),
        selectinload(BOM.sizes).selectinload(BOMSize.size),
    ]

def _pr_load_options():
    mos = selectinload(ProductionRun.manufacturing_orders)
    entries = selectinload(ProductionRun.bom_entries)
    return [
        # Legacy single-bom field (backward compat for old PRs)
        joinedload(ProductionRun.bom).options(*_bom_load_options()),
        # New multi-bom entries
        entries.joinedload(PRBomEntry.bom).options(*_bom_load_options()),
        entries.selectinload(PRBomEntry.sizes),
        mos.selectinload(ManufacturingOrder.item),
        mos.selectinload(ManufacturingOrder.attribute_values),
        mos.selectinload(ManufacturingOrder.child_mos),
        mos.selectinload(ManufacturingOrder.required_dependencies),
        mos.selectinload(ManufacturingOrder.completions),
        mos.selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.input_batch),
        mos.selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.output_batch),
        mos.selectinload(ManufacturingOrder.work_orders).selectinload(WorkOrderModel.work_center),
        mos.selectinload(ManufacturingOrder.work_orders).selectinload(WorkOrderModel.completions),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.item),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.attribute_values),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.customer),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.work_center),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.lines).selectinload(BOMLine.item),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.operations),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.sizes).selectinload(BOMSize.size),
        mos.selectinload(ManufacturingOrder.planned_components),
    ]


def _post_process_pr(pr: ProductionRun):
    """Populate all calculated fields on every MO within a PR after eager loading."""
    from app.api.manufacturing import populate_mo_ids
    for mo in pr.manufacturing_orders:
        populate_mo_ids(mo)

@router.get("/production-runs/available-code")
async def get_available_pr_code(
    base: str = "PR",
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    counter = 1
    while True:
        code = f"{base}-{counter:05d}"
        result = await db.execute(select(ProductionRun).filter(ProductionRun.code == code))
        if not result.scalars().first():
            return {"code": code}
        counter += 1

@router.get("/production-runs", response_model=PaginatedProductionRunResponse)
async def list_production_runs(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    count_result = await db.execute(select(func.count()).select_from(ProductionRun))
    total = count_result.scalar()
    result = await db.execute(
        select(ProductionRun)
        .options(*_pr_load_options())
        .order_by(ProductionRun.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    prs = result.unique().scalars().all()
    for pr in prs:
        _post_process_pr(pr)
    page = (skip // limit) + 1
    return {"items": prs, "total": total, "page": page, "size": limit}

@router.get("/production-runs/{pr_id}", response_model=ProductionRunResponse)
async def get_production_run(
    pr_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductionRun).options(*_pr_load_options()).filter(ProductionRun.id == pr_id)
    )
    pr = result.scalars().first()
    if not pr:
        raise HTTPException(status_code=404, detail="Production Run not found")
    _post_process_pr(pr)
    return pr

@router.get("/production-runs/{pr_id}/material-requirements", response_model=list[PRMaterialRequirementItem])
async def get_production_run_material_requirements(
    pr_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductionRun).options(*_pr_load_options()).filter(ProductionRun.id == pr_id)
    )
    pr = result.unique().scalars().first()
    if not pr:
        raise HTTPException(status_code=404, detail="Production Run not found")

    # Aggregate requirements: key = (item_id, attr_key, location_id)
    # value = { total_required, location_id, mo_contributions }
    agg: dict[tuple, dict] = defaultdict(lambda: {"total_required": 0.0, "mo_contributions": []})

    for mo in pr.manufacturing_orders:
        for comp in mo.planned_components:
            if not comp.percentage and not comp.qty:
                continue
            req = (float(mo.qty) * float(comp.percentage)) / 100 if comp.percentage else float(mo.qty) * float(comp.qty)
            tol = float(mo.bom.tolerance_percentage or 0) if mo.bom else 0
            if tol > 0:
                req *= (1 + tol / 100)

            attr_ids = sorted(comp.attribute_value_ids)
            attr_key = ",".join(attr_ids)
            loc_id = comp.source_location_id or mo.source_location_id or mo.location_id or pr.source_location_id or pr.location_id
            key = (str(comp.item_id), attr_key, str(loc_id))

            agg[key]["item_id"] = comp.item_id
            agg[key]["attr_ids"] = attr_ids
            agg[key]["location_id"] = loc_id
            agg[key]["total_required"] += req
            agg[key]["mo_contributions"].append(PRMOContribution(
                mo_id=mo.id,
                mo_code=mo.code,
                mo_qty=float(mo.qty),
                required_qty=req,
            ))

    if not agg:
        return []

    # Batch-fetch items
    item_ids = {v["item_id"] for v in agg.values()}
    item_result = await db.execute(select(Item).filter(Item.id.in_(item_ids)))
    item_map = {i.id: i for i in item_result.scalars().all()}

    # Batch-fetch stock balances
    requirements = [
        {"item_id": v["item_id"], "location_id": v["location_id"], "attribute_value_ids": v["attr_ids"]}
        for v in agg.values()
    ]
    balances_map = await stock_service.get_batch_stock_balances(db, requirements)

    results = []
    for (item_id_str, attr_key, loc_id_str), data in agg.items():
        item = item_map.get(data["item_id"])
        v_key = ",".join(sorted(data["attr_ids"]))
        available = balances_map.get((item_id_str, loc_id_str, v_key), 0.0)
        total = data["total_required"]
        results.append(PRMaterialRequirementItem(
            item_id=data["item_id"],
            item_code=item.code if item else str(data["item_id"]),
            item_name=item.name if item else str(data["item_id"]),
            uom=item.uom if item else "",
            attribute_value_ids=[UUID(a) for a in data["attr_ids"]],
            location_id=data["location_id"],
            total_required=total,
            qty_available=available,
            shortfall=max(0.0, total - available),
            mo_contributions=data["mo_contributions"],
        ))

    results.sort(key=lambda r: (r.shortfall > 0, r.item_code))
    return results


@router.post("/production-runs", response_model=ProductionRunResponse)
async def create_production_run(
    payload: ProductionRunCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.bom_entries:
        raise HTTPException(status_code=400, detail="At least one BOM entry is required")

    # Validate locations
    loc_result = await db.execute(select(Location).filter(Location.code == payload.location_code))
    location = loc_result.scalars().first()
    if not location:
        raise HTTPException(status_code=404, detail=f"Location '{payload.location_code}' not found")

    source_location = None
    if payload.source_location_code:
        src_result = await db.execute(select(Location).filter(Location.code == payload.source_location_code))
        source_location = src_result.scalars().first()

    # Validate code uniqueness
    existing = await db.execute(select(ProductionRun).filter(ProductionRun.code == payload.code))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Production Run code already exists")

    pr = ProductionRun(
        code=payload.code,
        bom_id=None,
        sales_order_id=payload.sales_order_id,
        location_id=location.id,
        source_location_id=source_location.id if source_location else None,
        status="PENDING",
        notes=payload.notes,
        target_start_date=payload.target_start_date,
        target_end_date=payload.target_end_date,
    )
    db.add(pr)
    await db.flush()

    # ── Pass 1: For each BOM entry, create root MO(s) ─────────────────────────
    bom_ro_pairs: list[tuple] = []  # [(bom, [root_mos])]
    total_root_mo_count = 0

    for entry_idx, bom_entry in enumerate(payload.bom_entries):
        bom_result = await db.execute(
            select(BOM).options(joinedload(BOM.item), selectinload(BOM.attribute_values))
            .filter(BOM.id == bom_entry.bom_id)
        )
        bom = bom_result.scalars().first()
        if not bom:
            raise HTTPException(status_code=404, detail=f"BOM {bom_entry.bom_id} not found")

        pr_entry = PRBomEntry(pr_id=pr.id, bom_id=bom.id, total_qty=bom_entry.total_qty)
        db.add(pr_entry)
        await db.flush()

        entry_root_mos: list[ManufacturingOrder] = []
        bom_label = bom.code if bom.code else (bom.item.code if bom.item else f"B{entry_idx+1}")

        if bom_entry.sizes:
            for size_entry in bom_entry.sizes:
                if size_entry.qty <= 0:
                    continue
                size_result = await db.execute(
                    select(BOMSize).options(joinedload(BOMSize.size))
                    .filter(BOMSize.id == size_entry.bom_size_id, BOMSize.bom_id == bom.id)
                )
                bom_size = size_result.scalars().first()
                if not bom_size:
                    raise HTTPException(status_code=404, detail=f"BOM size {size_entry.bom_size_id} not found in BOM {bom.id}")

                db.add(PRBomEntrySize(pr_bom_entry_id=pr_entry.id, bom_size_id=bom_size.id, qty=size_entry.qty))

                size_label = bom_size.label or (bom_size.size.name if bom_size.size else f"S{total_root_mo_count+1}")
                root_mo = await create_mo_recursive(
                    db, bom.id, float(size_entry.qty), location.id, current_user.id,
                    source_location_id=source_location.id if source_location else None,
                    sales_order_id=payload.sales_order_id,
                    production_run_id=pr.id,
                    target_start_date=payload.target_start_date,
                    target_end_date=payload.target_end_date,
                    bom_size_id=size_entry.bom_size_id,
                    create_children=False,
                )
                root_mo.code = f"{payload.code}-{bom_label.upper()}-{size_label.upper()}" if len(payload.bom_entries) > 1 else f"{payload.code}-{size_label.upper()}"
                entry_root_mos.append(root_mo)
                total_root_mo_count += 1
                await db.flush()

        elif bom_entry.total_qty and bom_entry.total_qty > 0:
            root_mo = await create_mo_recursive(
                db, bom.id, float(bom_entry.total_qty), location.id, current_user.id,
                source_location_id=source_location.id if source_location else None,
                sales_order_id=payload.sales_order_id,
                production_run_id=pr.id,
                target_start_date=payload.target_start_date,
                target_end_date=payload.target_end_date,
                create_children=False,
            )
            suffix = f"{entry_idx+1:03d}"
            root_mo.code = f"{payload.code}-{bom_label.upper()}" if len(payload.bom_entries) > 1 else f"{payload.code}-{suffix}"
            entry_root_mos.append(root_mo)
            total_root_mo_count += 1
            await db.flush()

        if entry_root_mos:
            bom_ro_pairs.append((bom, entry_root_mos))

    # ── Pass 2: Aggregate demand across ALL BOM entries, create consolidated shared MOs ──
    if bom_ro_pairs:
        await _create_consolidated_component_mos(
            db, bom_ro_pairs, location, source_location,
            payload.sales_order_id, pr.id,
            payload.target_start_date, payload.target_end_date,
            current_user.id,
        )

    await db.commit()

    result = await db.execute(
        select(ProductionRun).options(*_pr_load_options()).filter(ProductionRun.id == pr.id)
    )
    pr = result.unique().scalars().first()
    _post_process_pr(pr)

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE",
        entity_type="PRODUCTION_RUN", entity_id=str(pr.id),
        details=f"Created Production Run {pr.code} with {len(payload.bom_entries)} BOM entries, {total_root_mo_count} root MOs",
        changes=payload.model_dump()
    )
    await manager.broadcast({"type": "PRODUCTION_RUN_UPDATE", "pr_id": str(pr.id), "status": "PENDING"})
    return pr

@router.put("/production-runs/{pr_id}/status", response_model=ProductionRunResponse)
async def update_production_run_status(
    pr_id: str,
    status: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    valid = {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")

    result = await db.execute(
        select(ProductionRun).options(*_pr_load_options()).filter(ProductionRun.id == pr_id)
    )
    pr = result.unique().scalars().first()
    if not pr:
        raise HTTPException(status_code=404, detail="Production Run not found")

    pr.status = status
    if status == "IN_PROGRESS" and not pr.actual_start_date:
        pr.actual_start_date = datetime.utcnow()
    if status == "COMPLETED" and not pr.actual_end_date:
        pr.actual_end_date = datetime.utcnow()

    await db.commit()
    await manager.broadcast({"type": "PRODUCTION_RUN_UPDATE", "pr_id": pr_id, "status": status})

    result = await db.execute(
        select(ProductionRun).options(*_pr_load_options()).filter(ProductionRun.id == pr_id)
    )
    pr = result.unique().scalars().first()
    _post_process_pr(pr)
    return pr

@router.delete("/production-runs/{pr_id}")
async def delete_production_run(
    pr_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ProductionRun).filter(ProductionRun.id == pr_id))
    pr = result.scalars().first()
    if not pr:
        raise HTTPException(status_code=404, detail="Production Run not found")
    code = pr.code
    await db.delete(pr)
    await db.commit()
    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE",
        entity_type="PRODUCTION_RUN", entity_id=pr_id,
        details=f"Deleted Production Run {code}"
    )
    return {"status": "success"}
