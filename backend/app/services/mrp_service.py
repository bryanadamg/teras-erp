import re
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.bom import BOM, BOMLine, BOMOperation, BOMSize
from app.models.item import Item
from app.models.manufacturing import ManufacturingOrder, MODependency, MOPlannedComponent


async def snapshot_bom_lines(db: AsyncSession, mo: ManufacturingOrder, bom: BOM):
    """Snapshot BOM lines into MOPlannedComponent rows at MO creation time."""
    for line in bom.lines:
        attr_ids = [str(v.id) for v in line.attribute_values]
        db.add(MOPlannedComponent(
            mo_id=mo.id,
            item_id=line.item_id,
            percentage=line.percentage,
            qty=line.qty,
            source_location_id=line.source_location_id,
            bom_line_id=line.id,
            bom_operation_id=line.bom_operation_id,
            attribute_value_ids=attr_ids,
        ))


async def create_mo_recursive(
    db: AsyncSession,
    bom_id: uuid.UUID,
    qty: float,
    location_id: uuid.UUID,
    user_id: uuid.UUID,
    parent_mo_id: Optional[uuid.UUID] = None,
    source_location_id: Optional[uuid.UUID] = None,
    sales_order_id: Optional[uuid.UUID] = None,
    production_run_id: Optional[uuid.UUID] = None,
    target_start_date: Optional[datetime] = None,
    target_end_date: Optional[datetime] = None,
    bom_size_id: Optional[uuid.UUID] = None,
    create_children: bool = True,
    availability=None,
) -> ManufacturingOrder:
    """Recursively creates manufacturing orders for sub-assemblies.
    Pass create_children=False to create only the root MO (used in two-pass PR creation).

    When ``availability`` (a netting_service.Availability ledger) is supplied,
    each sub-assembly's gross requirement is netted against net-free stock before
    its MO is created: fully-covered children are skipped (no MO, no sub-tree),
    partially-covered children are resized to the shortfall. The root MO itself
    is never netted — only its children/descendants."""
    # 1. Fetch BOM with lines and operations
    result = await db.execute(
        select(BOM)
        .options(
            selectinload(BOM.lines).selectinload(BOMLine.attribute_values),
            selectinload(BOM.attribute_values),
            selectinload(BOM.operations).joinedload(BOMOperation.work_center),
        )
        .filter(BOM.id == bom_id)
    )
    bom = result.scalars().first()
    if not bom:
        raise ValueError(f"BOM {bom_id} not found")

    # 2. Generate a meaningful code based on the BOM's item name (MO-{ITEM_NAME}-001)
    item_result = await db.execute(select(Item).filter(Item.id == bom.item_id))
    item = item_result.scalars().first()
    raw_name = item.name if item else str(bom.item_id)[:8]
    safe_name = re.sub(r'[^A-Za-z0-9\-]', '-', raw_name).strip('-')
    base = f"MO-{safe_name}"
    counter = 1
    while True:
        candidate = f"{base}-{str(counter).zfill(5)}"
        existing = await db.execute(select(ManufacturingOrder.id).filter(ManufacturingOrder.code == candidate).limit(1))
        if existing.scalars().first() is None:
            mo_code = candidate
            break
        counter += 1

    # 3. Create this MO (bom_size_id only applies to the root MO, not sub-assemblies)
    mo = ManufacturingOrder(
        code=mo_code,
        bom_id=bom.id,
        item_id=bom.item_id,
        location_id=location_id,
        # MO source defaults to the item-master default issue location when no
        # explicit source is passed (industry chain; staging can still override).
        source_location_id=source_location_id or (item.default_source_location_id if item else None),
        sales_order_id=sales_order_id,
        production_run_id=production_run_id,
        parent_mo_id=parent_mo_id,
        bom_size_id=bom_size_id if parent_mo_id is None else None,
        qty=qty,
        target_start_date=target_start_date,
        target_end_date=target_end_date,
        status="PENDING"
    )
    mo.attribute_values = list(bom.attribute_values)
    db.add(mo)
    await db.flush()

    # Snapshot BOM size spec at creation time
    if bom_size_id and parent_mo_id is None:
        sz_result = await db.execute(
            select(BOMSize).options(joinedload(BOMSize.size)).filter(BOMSize.id == bom_size_id)
        )
        bom_sz = sz_result.unique().scalars().first()
        if bom_sz:
            mo.bom_size_snapshot = {
                "size_name": bom_sz.size.name if bom_sz.size else None,
                "label": bom_sz.label,
                "target_measurement": float(bom_sz.target_measurement) if bom_sz.target_measurement is not None else None,
                "measurement_min": float(bom_sz.measurement_min) if bom_sz.measurement_min is not None else None,
                "measurement_max": float(bom_sz.measurement_max) if bom_sz.measurement_max is not None else None,
            }

    # Snapshot BOM lines at creation time so future BOM edits don't affect this MO
    await snapshot_bom_lines(db, mo, bom)

    # 4. Look for sub-BOMs in lines — only active BOMs, percentage-based qty
    if create_children:
        for line in bom.lines:
            if not line.percentage:
                continue  # 0% or null = not needed
            sub_bom_result = await db.execute(
                select(BOM).options(selectinload(BOM.attribute_values))
                .filter(BOM.item_id == line.item_id, BOM.active == True).limit(1)
            )
            sub_bom = sub_bom_result.scalars().first()

            if sub_bom:
                sub_qty = (qty * float(line.percentage)) / 100
                if availability is not None:
                    # Net this sub-assembly against net-free stock at the planned
                    # source location, using the produced item's own variant.
                    sub_attrs = [str(v.id) for v in sub_bom.attribute_values]
                    sub_loc = source_location_id or location_id
                    sub_qty = await availability.consume(sub_bom.item_id, sub_attrs, sub_loc, sub_qty)
                    if sub_qty <= 0:
                        continue  # covered by stock -> skip MO and its sub-tree
                await create_mo_recursive(
                    db,
                    sub_bom.id,
                    sub_qty,
                    location_id,
                    user_id,
                    parent_mo_id=mo.id,
                    source_location_id=source_location_id,
                    sales_order_id=sales_order_id,
                    production_run_id=production_run_id,
                    target_start_date=target_start_date,
                    target_end_date=target_end_date,
                    availability=availability,
                )

    return mo


async def create_consolidated_component_mos(
    db: AsyncSession,
    bom_ro_pairs: list[tuple],
    location,
    source_location,
    sales_order_id,
    production_run_id,
    target_start_date,
    target_end_date,
    user_id,
    availability=None,
):
    """Pass 2 of PR creation: walk all BOMs in the run, aggregate component demand across
    ALL root MOs from ALL BOM entries, create ONE consolidated component MO per unique
    sub-assembly (keyed on item_id + sub_bom_id + src_loc), and write MODependency
    pegging records. This consolidates shared greige/base items across color variants.

    When ``availability`` is supplied, each consolidated demand is netted against
    net-free stock first: a component fully covered by stock gets no MO (and no
    sub-tree); a partially-covered one is resized to the shortfall and its pegging
    qty is scaled down proportionally. Deeper levels net via create_mo_recursive."""

    # Aggregate demand keyed on (item_id, sub_bom_id, size_key).
    #   size_key = None  -> pool across all roots (unsized/free sub-BOM, or size
    #                       unresolved) — the color-variant greige case.
    #   size_key = <greige BOMSize id> -> split: one component MO per size, so a
    #                       sized greige (L=68cm vs M=64cm) is never merged across
    #                       sizes. Its bom_size flows onto the component MO.
    demand: dict[tuple, dict] = {}

    # Preload the parent BOMSize rows that the root MOs carry, so we can map each
    # root's size identity onto the sub-BOM's own size rows (matched by shared
    # Size master, else by label).
    root_bs_ids = {rm.bom_size_id for _, rms in bom_ro_pairs for rm in rms if rm.bom_size_id}
    root_bs_by_id: dict = {}
    if root_bs_ids:
        rows = await db.execute(select(BOMSize).filter(BOMSize.id.in_(root_bs_ids)))
        root_bs_by_id = {bs.id: bs for bs in rows.scalars().all()}

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
                select(BOM).options(
                    selectinload(BOM.attribute_values), selectinload(BOM.sizes)
                )
                .filter(BOM.item_id == line.item_id, BOM.active == True).limit(1)
            )
            sub_bom = sub_bom_result.scalars().first()
            if not sub_bom:
                continue

            # Source kept only as the component MO's default source (staging
            # cascade). Industry chain: BOM-line override -> item-master default ->
            # PR source (legacy). Plant-level netting consolidates by (item, sub_bom)
            # alone — location is not part of the key.
            item_default_src = (await db.execute(
                select(Item.default_source_location_id).filter(Item.id == line.item_id)
            )).scalar()
            src_loc_id = (
                line.source_location_id
                or item_default_src
                or (source_location.id if source_location else None)
            )

            sub_attrs = [str(v.id) for v in sub_bom.attribute_values]
            # Only split when the sub-BOM is itself size-differentiated.
            sized = sub_bom.size_mode == 'sized'
            greige_by_size_id = {}
            greige_by_label = {}
            if sized:
                greige_by_size_id = {s.size_id: s for s in sub_bom.sizes if s.size_id}
                greige_by_label = {
                    (s.label or '').strip().lower(): s for s in sub_bom.sizes if s.label
                }

            for root_mo in root_mos:
                contrib_qty = (float(root_mo.qty) * float(line.percentage)) / 100

                # Resolve this root's size onto a sub-BOM size row (sized only).
                greige_bs = None
                if sized:
                    root_bs = root_bs_by_id.get(root_mo.bom_size_id)
                    if root_bs is not None:
                        if root_bs.size_id and root_bs.size_id in greige_by_size_id:
                            greige_bs = greige_by_size_id[root_bs.size_id]
                        elif root_bs.label:
                            greige_bs = greige_by_label.get(root_bs.label.strip().lower())
                size_key = str(greige_bs.id) if greige_bs is not None else None

                key = (str(line.item_id), str(sub_bom.id), size_key)
                if key not in demand:
                    demand[key] = {
                        "sub_bom_id": sub_bom.id,
                        "item_id": line.item_id,
                        "sub_attrs": sub_attrs,
                        "total_qty": 0.0,
                        "src_loc_id": src_loc_id,
                        "bom_size_id": greige_bs.id if greige_bs is not None else None,
                        "contributions": {},
                    }

                demand[key]["total_qty"] += contrib_qty
                demand[key]["contributions"][root_mo.id] = demand[key]["contributions"].get(root_mo.id, 0.0) + contrib_qty

    # Create one consolidated component MO per unique sub-assembly, write pegging records
    for data in demand.values():
        total = data["total_qty"]
        if total <= 0:
            continue

        # Net consolidated demand against net-free stock at the planned source location.
        net_qty = total
        if availability is not None:
            net_qty = await availability.consume(
                data["item_id"], data["sub_attrs"], data["src_loc_id"], total
            )
        if net_qty <= 0:
            continue  # fully covered by stock -> no component MO, no pegging, no sub-tree

        component_mo = await create_mo_recursive(
            db,
            data["sub_bom_id"],
            net_qty,
            location.id if location else None,
            user_id,
            parent_mo_id=None,
            source_location_id=data["src_loc_id"],
            sales_order_id=None,
            production_run_id=production_run_id,
            target_start_date=target_start_date,
            target_end_date=target_end_date,
            bom_size_id=data["bom_size_id"],
            create_children=True,
            availability=availability,
        )
        component_mo.is_shared_component = True
        await db.flush()

        # Scale pegging to what this MO actually supplies (remainder is pegged to stock).
        factor = net_qty / total
        for root_mo_id, contrib_qty in data["contributions"].items():
            db.add(MODependency(
                dependent_mo_id=root_mo_id,
                required_mo_id=component_mo.id,
                qty=contrib_qty * factor,
            ))

    await db.flush()
