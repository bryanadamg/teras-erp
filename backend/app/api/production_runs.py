from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload, selectinload
from app.db.session import get_async_db
from uuid import UUID
from app.models.production_run import ProductionRun
from app.models.manufacturing import ManufacturingOrder
from app.models.bom import BOM, BOMLine, BOMSize
from app.models.work_order import WorkOrder as WorkOrderModel
from app.models.location import Location
from app.models.batch import BatchConsumption
from app.schemas import (
    ProductionRunCreate, ProductionRunResponse,
    PaginatedProductionRunResponse, PaginatedProductionRunListResponse,
    ManufacturingOrderCreate,
    PRMaterialRequirementItem, PRMOContribution,
    ProductionRunPreviewRequest, NettingPreviewNode,
)
from app.models.production_run import PRBomEntry, PRBomEntrySize
from app.models.item import Item
from app.models.stock_balance import StockBalance
from app.models.attribute import AttributeValue
from app.services import stock_service, mrp_service
from app.services.netting_service import Availability, preview_production_run
from collections import defaultdict
from app.models.auth import User
from app.api.auth import get_current_user, require_permission
from app.services import audit_service
from app.core.ws_manager import manager
import uuid
from datetime import datetime

router = APIRouter()


async def _find_unique_mo_code(db: AsyncSession, candidate: str) -> str:
    """Return candidate if unused, otherwise append -02, -03, ... until unique."""
    existing = await db.execute(
        select(ManufacturingOrder.id).filter(ManufacturingOrder.code == candidate).limit(1)
    )
    if existing.scalars().first() is None:
        return candidate
    n = 2
    while True:
        new_candidate = f"{candidate}-{n:02d}"
        existing = await db.execute(
            select(ManufacturingOrder.id).filter(ManufacturingOrder.code == new_candidate).limit(1)
        )
        if existing.scalars().first() is None:
            return new_candidate
        n += 1



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
        # Originating Sales Order (for lineage display)
        joinedload(ProductionRun.sales_order),
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


def _pr_list_load_options():
    """Eager-load set for the Production Runs LIST view (serialized via
    ProductionRunListItem). Identical to _pr_load_options for the MO branch EXCEPT
    it omits the two heaviest, list-unused pieces: each MO's deep BOM sub-tree
    (bom.item/customer/work_center/lines/lines.item/lines.attribute_values/
    operations/sizes) and planned_components. The BOM/entry BOMs are loaded shallow
    (item only) — enough for the code/item_name/item_code the list renders — instead
    of the full nested tree. Everything the SO-page PR-dedup and the MO-page
    shared-component tree read (work_orders, completions, child_mos,
    required_dependencies, batch_consumptions, item, attribute_values, all scalars)
    is retained."""
    mos = selectinload(ProductionRun.manufacturing_orders)
    return [
        joinedload(ProductionRun.sales_order),
        # Legacy single-bom fallback + multi-bom entries — shallow (item only)
        joinedload(ProductionRun.bom).joinedload(BOM.item),
        selectinload(ProductionRun.bom_entries).joinedload(PRBomEntry.bom).joinedload(BOM.item),
        # MO branch: everything except the deep bom tree + planned_components
        mos.selectinload(ManufacturingOrder.item),
        mos.selectinload(ManufacturingOrder.attribute_values),
        mos.selectinload(ManufacturingOrder.child_mos),
        mos.selectinload(ManufacturingOrder.required_dependencies),
        mos.selectinload(ManufacturingOrder.completions),
        mos.selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.input_batch),
        mos.selectinload(ManufacturingOrder.batch_consumptions).selectinload(BatchConsumption.output_batch),
        mos.selectinload(ManufacturingOrder.work_orders).selectinload(WorkOrderModel.work_center),
        mos.selectinload(ManufacturingOrder.work_orders).selectinload(WorkOrderModel.completions),
    ]


def _pr_material_req_load_options():
    """Minimal eager-load set for the /material-requirements endpoint. Called once
    per visible PR row on the Production Runs page, so it must stay lean. Loads ONLY
    what the requirements aggregation (mo.qty, mo.planned_components, mo.bom.tolerance)
    and _bom_traversal_order (mo.bom.operations, mo.required_dependencies,
    mo.is_shared_component, mo.bom_id) actually read — NOT the full nested MO tree
    that _pr_load_options pulls for the list view. Item + StockBalance are fetched
    separately in the endpoint, so no bom.lines / bom.item / work_orders / completions
    / batch_consumptions / bom_entries here."""
    mos = selectinload(ProductionRun.manufacturing_orders)
    return [
        mos.selectinload(ManufacturingOrder.planned_components),
        mos.selectinload(ManufacturingOrder.required_dependencies),
        mos.selectinload(ManufacturingOrder.bom).selectinload(BOM.operations),
    ]


def _post_process_pr(pr: ProductionRun):
    """Populate all calculated fields on every MO within a PR after eager loading."""
    from app.api.manufacturing import populate_mo_ids
    # Populate originating SO code (eager-loaded via _pr_load_options)
    pr.sales_order_code = pr.sales_order.po_number if pr.sales_order else None
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

@router.get("/production-runs", response_model=PaginatedProductionRunListResponse)
async def list_production_runs(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    conditions = []
    if search and search.strip():
        like = f"%{search.strip()}%"
        # Match by entry BOM code / item name / item code (multi-BOM path)
        entry_match = (
            select(PRBomEntry.id)
            .join(BOM, BOM.id == PRBomEntry.bom_id)
            .join(Item, Item.id == BOM.item_id)
            .where(
                PRBomEntry.pr_id == ProductionRun.id,
                or_(BOM.code.ilike(like), Item.name.ilike(like), Item.code.ilike(like)),
            )
            .exists()
        )
        # Match by directly-linked BOM (legacy single-BOM path)
        legacy_match = (
            select(BOM.id)
            .join(Item, Item.id == BOM.item_id)
            .where(
                BOM.id == ProductionRun.bom_id,
                or_(BOM.code.ilike(like), Item.name.ilike(like), Item.code.ilike(like)),
            )
            .exists()
        )
        conditions.append(or_(ProductionRun.code.ilike(like), entry_match, legacy_match))

    count_query = select(func.count()).select_from(ProductionRun)
    list_query = (
        select(ProductionRun)
        .options(*_pr_list_load_options())
        .order_by(ProductionRun.created_at.desc())
    )
    if conditions:
        count_query = count_query.where(*conditions)
        list_query = list_query.where(*conditions)
    count_result = await db.execute(count_query)
    total = count_result.scalar()
    result = await db.execute(list_query.offset(skip).limit(limit))
    prs = result.unique().scalars().all()
    for pr in prs:
        _post_process_pr(pr)
    page = (skip // limit) + 1
    return {"items": prs, "total": total, "page": page, "size": limit}

def _bom_traversal_order(pr) -> dict[tuple, int]:
    """DFS from root MOs → component MOs via required_dependencies.
    Components within each MO are ordered by BOMOperation.sequence.
    Returns {(item_id_str, attr_key): rank} for top-down BOM ordering."""
    mo_map = {mo.id: mo for mo in pr.manufacturing_orders}

    op_seq: dict = {}
    for mo in pr.manufacturing_orders:
        if mo.bom and mo.bom.operations:
            op_seq[mo.bom_id] = {op.id: int(op.sequence) for op in mo.bom.operations}

    visited_keys: set = set()
    visited_mo_ids: set = set()
    order: list = []

    def visit_mo(mo):
        if mo.id in visited_mo_ids:
            return
        visited_mo_ids.add(mo.id)

        seq_map = op_seq.get(mo.bom_id, {})

        def comp_key(c):
            return seq_map.get(c.bom_operation_id, 9999) if c.bom_operation_id else 9999

        for comp in sorted(mo.planned_components, key=comp_key):
            attr_ids = sorted(str(a) for a in (comp.attribute_value_ids or []))
            key = (str(comp.item_id), ",".join(attr_ids))
            if key not in visited_keys:
                visited_keys.add(key)
                order.append(key)

        for dep in (mo.required_dependencies or []):
            child_mo = mo_map.get(dep.required_mo_id)
            if child_mo:
                visit_mo(child_mo)

    for mo in pr.manufacturing_orders:
        if not mo.is_shared_component:
            visit_mo(mo)
    # Safety net: catch MOs not reachable from roots
    for mo in pr.manufacturing_orders:
        visit_mo(mo)

    return {key: i for i, key in enumerate(order)}


@router.get("/production-runs/{pr_id}/material-requirements", response_model=list[PRMaterialRequirementItem])
async def get_production_run_material_requirements(
    pr_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProductionRun).options(*_pr_material_req_load_options()).filter(ProductionRun.id == pr_id)
    )
    pr = result.unique().scalars().first()
    if not pr:
        raise HTTPException(status_code=404, detail="Production Run not found")

    # Aggregate requirements plant-wide: key = (item_id, attr_key). Location is not
    # part of the key (location-agnostic netting); on-hand sums across all locations.
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
            key = (str(comp.item_id), attr_key)

            agg[key]["item_id"] = comp.item_id
            agg[key]["attr_ids"] = attr_ids
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

    # Plant-wide on-hand: sum StockBalance across ALL locations per (item, variant_key).
    onhand_map: dict[tuple, float] = {}
    onhand_by_item: dict[str, float] = defaultdict(float)
    for iid, vk, q in (await db.execute(
        select(StockBalance.item_id, StockBalance.variant_key, func.sum(StockBalance.qty))
        .where(StockBalance.item_id.in_(item_ids))
        .group_by(StockBalance.item_id, StockBalance.variant_key)
    )).all():
        onhand_map[(str(iid), vk or "")] = float(q or 0)
        onhand_by_item[str(iid)] += float(q or 0)

    results = []
    for (item_id_str, attr_key), data in agg.items():
        item = item_map.get(data["item_id"])
        # Batch/lot-identity items (beams, lot-tracked items) never stamp variant
        # attrs on their stock rows (variant_key is always "" — the batch itself is
        # the identity), so match plant-wide on-hand by item only, not by variant.
        is_batch_identity = bool(item and (item.lot_tracked or (item.category and (item.category.name or "").lower() == "beam")))
        if is_batch_identity:
            available = onhand_by_item.get(item_id_str, 0.0)
        else:
            v_key = ",".join(sorted(data["attr_ids"]))
            available = onhand_map.get((item_id_str, v_key), 0.0)
        total = data["total_required"]
        results.append(PRMaterialRequirementItem(
            item_id=data["item_id"],
            item_code=item.code if item else str(data["item_id"]),
            item_name=item.name if item else str(data["item_id"]),
            uom=item.uom if item else "",
            attribute_value_ids=[UUID(a) for a in data["attr_ids"]],
            location_id=item.default_source_location_id if item else None,
            total_required=total,
            qty_available=available,
            shortfall=max(0.0, total - available),
            mo_contributions=data["mo_contributions"],
        ))

    bom_order = _bom_traversal_order(pr)
    results.sort(key=lambda r: (
        bom_order.get(
            (str(r.item_id), ",".join(sorted(str(a) for a in r.attribute_value_ids))),
            9999,
        ),
        r.item_code,
    ))
    return results


@router.post("/production-runs/preview", response_model=list[NettingPreviewNode])
async def preview_production_run_plan(
    payload: ProductionRunPreviewRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    """Dry-run: shows the netting plan (per component: net-from location, gross,
    net-free, net qty, decision) for a PR before it is created. Creates nothing."""
    if not payload.bom_entries:
        return []
    location = None
    if payload.location_code:
        loc_result = await db.execute(select(Location).filter(Location.code == payload.location_code))
        location = loc_result.scalars().first()
    source_location = None
    if payload.source_location_code:
        src_result = await db.execute(select(Location).filter(Location.code == payload.source_location_code))
        source_location = src_result.scalars().first()
    return await preview_production_run(
        db, payload.bom_entries, location, source_location, exclude_pr_id=payload.exclude_pr_id
    )


@router.post("/production-runs", response_model=ProductionRunResponse)
async def create_production_run(
    payload: ProductionRunCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    if not payload.bom_entries:
        raise HTTPException(status_code=400, detail="At least one BOM entry is required")

    # Locations are optional. Output follows the WO output location; source follows
    # the item-master default / BOM-line override (resolved at staging).
    location = None
    if payload.location_code:
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
        location_id=location.id if location else None,
        source_location_id=source_location.id if source_location else None,
        status="PENDING",
        notes=payload.notes,
        target_start_date=payload.target_start_date,
        target_end_date=payload.target_end_date,
    )
    db.add(pr)
    await db.flush()

    # ── Pass 1: For each BOM entry, create root MO(s) ─────────────────────────
    # Net-free ledger excludes this PR's own root MOs (their demand IS the gross
    # we net); built up-front so root netting (this pass) and component netting
    # (Pass 2) share one running ledger and can't double-claim the same stock.
    availability = await Availability.create(db, exclude_pr_id=pr.id)
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

        pr_entry = PRBomEntry(
            pr_id=pr.id,
            bom_id=bom.id,
            total_qty=bom_entry.total_qty,
            attribute_value_ids=[str(v) for v in (bom_entry.attribute_value_ids or [])],
            color_id=bom_entry.color_id,
            labdip_variant_code=bom_entry.labdip_variant_code,
            force_create=bom_entry.force_create,
        )
        db.add(pr_entry)
        await db.flush()

        entry_root_mos: list[ManufacturingOrder] = []
        bom_label = bom.code if bom.code else (bom.item.code if bom.item else f"B{entry_idx+1}")

        # Variant the produced root will actually carry (entry override wins,
        # same precedence applied post-creation below) — this is the netting key.
        root_attrs = (
            [str(v) for v in bom_entry.attribute_value_ids]
            if bom_entry.attribute_value_ids
            else [str(v.id) for v in bom.attribute_values]
        )
        root_net_loc = source_location.id if source_location else (location.id if location else None)

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

                gross = float(size_entry.qty)
                if bom_entry.force_create:
                    net_qty = gross
                else:
                    net_qty = await availability.consume(bom.item_id, root_attrs, root_net_loc, gross, color_id=bom_entry.color_id)
                if net_qty <= 0:
                    continue  # fully covered by stock -> no root MO for this size line

                size_label = bom_size.label or (bom_size.size.name if bom_size.size else f"S{total_root_mo_count+1}")
                root_mo = await mrp_service.create_mo_recursive(
                    db, bom.id, net_qty, (location.id if location else None), current_user.id,
                    source_location_id=source_location.id if source_location else None,
                    sales_order_id=payload.sales_order_id,
                    production_run_id=pr.id,
                    target_start_date=payload.target_start_date,
                    target_end_date=payload.target_end_date,
                    bom_size_id=size_entry.bom_size_id,
                    create_children=False,
                )
                base_code = (
                    f"{payload.code}-{bom_label.upper()}-{entry_idx+1:03d}-{size_label.upper()}"
                    if len(payload.bom_entries) > 1
                    else f"{payload.code}-{size_label.upper()}"
                )
                root_mo.code = await _find_unique_mo_code(db, base_code)
                root_mo.color_id = bom_entry.color_id
                root_mo.labdip_variant_code = bom_entry.labdip_variant_code
                entry_root_mos.append(root_mo)
                total_root_mo_count += 1
                await db.flush()

        elif bom_entry.total_qty and bom_entry.total_qty > 0:
            gross = float(bom_entry.total_qty)
            if bom_entry.force_create:
                net_qty = gross
            else:
                net_qty = await availability.consume(bom.item_id, root_attrs, root_net_loc, gross, color_id=bom_entry.color_id)
            if net_qty > 0:
                root_mo = await mrp_service.create_mo_recursive(
                    db, bom.id, net_qty, (location.id if location else None), current_user.id,
                    source_location_id=source_location.id if source_location else None,
                    sales_order_id=payload.sales_order_id,
                    production_run_id=pr.id,
                    target_start_date=payload.target_start_date,
                    target_end_date=payload.target_end_date,
                    create_children=False,
                )
                suffix = f"{entry_idx+1:03d}"
                base_code = (
                    f"{payload.code}-{bom_label.upper()}-{suffix}"
                    if len(payload.bom_entries) > 1
                    else f"{payload.code}-{suffix}"
                )
                root_mo.code = await _find_unique_mo_code(db, base_code)
                root_mo.color_id = bom_entry.color_id
                root_mo.labdip_variant_code = bom_entry.labdip_variant_code
                entry_root_mos.append(root_mo)
                total_root_mo_count += 1
                await db.flush()
            # net_qty <= 0 -> fully covered by stock, no root MO for this entry

        if bom_entry.attribute_value_ids:
            attr_result = await db.execute(
                select(AttributeValue).filter(
                    AttributeValue.id.in_([str(v) for v in bom_entry.attribute_value_ids])
                )
            )
            attr_objs = attr_result.scalars().all()
            for mo in entry_root_mos:
                mo.attribute_values = list(attr_objs)
            await db.flush()

        if entry_root_mos:
            bom_ro_pairs.append((bom, entry_root_mos))

    # ── Pass 2: Aggregate demand across ALL BOM entries, create consolidated shared MOs ──
    # Reuses the same `availability` ledger Pass 1 netted roots against, so a
    # component can't claim stock a root already consumed (or vice versa).
    if bom_ro_pairs:
        all_root_mos = [mo for _, root_mos in bom_ro_pairs for mo in root_mos]
        await mrp_service.create_consolidated_component_mos(
            db, all_root_mos, location, source_location,
            payload.sales_order_id, pr.id,
            payload.target_start_date, payload.target_end_date,
            current_user.id,
            availability=availability,
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
    current_user: User = Depends(require_permission('work_order.manage')),
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
    await audit_service.log_activity(
        db, user_id=current_user.id, action="STATUS_CHANGE",
        entity_type="PRODUCTION_RUN", entity_id=pr_id,
        details=f"Status -> {status}"
    )
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
    current_user: User = Depends(require_permission('work_order.manage')),
):
    result = await db.execute(select(ProductionRun).filter(ProductionRun.id == pr_id))
    pr = result.scalars().first()
    if not pr:
        raise HTTPException(status_code=404, detail="Production Run not found")
    code = pr.code

    # Delete every MO belonging to this PR (roots + children + consolidated
    # shared-component MOs all carry production_run_id=pr.id). Delete children
    # before parents to satisfy the parent_mo_id FK (no DB-level cascade on the
    # self-reference); ORM cascades then remove WOs, completions, planned
    # components, and MODependency rows.
    mo_result = await db.execute(
        select(ManufacturingOrder).filter(ManufacturingOrder.production_run_id == pr.id)
    )
    mos = {o.id: o for o in mo_result.scalars().all()}

    def _depth(oid):
        d, cur = 0, mos.get(oid)
        seen = set()
        while cur is not None and cur.parent_mo_id in mos and cur.parent_mo_id not in seen:
            seen.add(cur.id)
            d += 1
            cur = mos.get(cur.parent_mo_id)
        return d
    for oid in sorted(mos.keys(), key=_depth, reverse=True):
        await db.delete(mos[oid])
    mo_count = len(mos)

    await db.delete(pr)
    await db.commit()
    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE",
        entity_type="PRODUCTION_RUN", entity_id=pr_id,
        details=f"Deleted Production Run {code} and {mo_count} associated MO(s)"
    )
    await manager.broadcast({"type": "PRODUCTION_RUN_UPDATE", "pr_id": pr_id, "status": "DELETED"})
    if mo_count:
        await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "status": "DELETED"})
    return {"status": "success"}
