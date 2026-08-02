"""Packing / PackedUnit domain logic.

A PackedUnit is a physical carton. It is stored as a `Batch` row — the same
modelling choice already made for warp beams — so its quantity lives in the
normal `StockBalance` row keyed by `batch_key = <batch id>` at the packed
location, and there is no second qty record to drift. `Batch.packing_order_id`
is the discriminator: non-null means "this batch is a carton".
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.batch import Batch, BatchConsumption
from app.models.packing import PackingOrder, PackingCompletion
from app.models.pick_list import PickList, PickListLine
from app.models.stock_balance import StockBalance
from app.services import stock_service
from app.services.stock_service import _generate_variant_key
from app.api.batches import generate_batch_number


PACKED_UNIT_PREFIX = "PU"


def is_packed_unit(batch: Batch) -> bool:
    return batch is not None and batch.packing_order_id is not None


def packed_unit_filter():
    """SQL filter selecting only PackedUnit batches — the single definition,
    mirroring `beam_service.beam_item_ids()`. Never inline the column test."""
    return Batch.packing_order_id.isnot(None)


def split_qty(total: float, count: int) -> list[float]:
    """Even split across cartons, remainder onto the last one.

    Rounded to 4dp to match Numeric(14, 4); the last carton absorbs the rounding
    residue so the cartons always sum back to exactly `total`.
    """
    count = max(1, int(count))
    total = float(total)
    each = round(total / count, 4)
    parts = [each] * (count - 1)
    parts.append(round(total - each * (count - 1), 4))
    return parts


async def _next_package_no(db: AsyncSession, packing_order_id) -> int:
    """Carton numbering continues across the whole packing order, not per event."""
    result = await db.execute(
        select(func.max(Batch.package_no)).filter(Batch.packing_order_id == packing_order_id)
    )
    return int(result.scalar() or 0) + 1


async def mint_packed_units(
    db: AsyncSession,
    po: PackingOrder,
    completion: PackingCompletion,
    qty: float,
    package_count: int,
    attribute_value_ids: list[str],
    color_id,
    username: Optional[str] = None,
    source_batch_id=None,
) -> list[Batch]:
    """Consume bulk FG and mint `package_count` cartons for one completion event.

    Stock moves twice per carton: OUT of the packing order's source location on
    the incoming lot, IN at the output location keyed by the new carton batch.
    `BatchConsumption` pegs input lot -> carton so lot genealogy survives packing.
    """
    if not po.output_location_id:
        raise ValueError("Packing order has no output location")
    if not po.source_location_id:
        raise ValueError("Packing order has no source location")

    qtys = split_qty(qty, package_count)
    next_no = await _next_package_no(db, po.id)
    units: list[Batch] = []

    for offset, carton_qty in enumerate(qtys):
        pu = Batch(
            batch_number=await generate_batch_number(db, prefix=PACKED_UNIT_PREFIX),
            item_id=po.item_id,
            packing_order_id=po.id,
            packing_completion_id=completion.id,
            package_no=next_no + offset,
            package_label=po.package_label or "Carton",
            # Soft tag only — a carton packed for an SO stays pickable by any
            # pick list. See the design note on models/packing.py.
            packed_for_so_id=po.sales_order_id,
            created_by=username,
        )
        db.add(pu)
        await db.flush()

        await stock_service.add_stock_entry(
            db,
            item_id=po.item_id,
            location_id=po.source_location_id,
            qty_change=-float(carton_qty),
            reference_type="PACKING",
            reference_id=po.code,
            attribute_value_ids=attribute_value_ids,
            color_id=color_id,
            batch_id=source_batch_id,
        )
        await stock_service.add_stock_entry(
            db,
            item_id=po.item_id,
            location_id=po.output_location_id,
            qty_change=float(carton_qty),
            reference_type="PACKING",
            reference_id=po.code,
            attribute_value_ids=attribute_value_ids,
            color_id=color_id,
            batch_id=pu.id,
        )

        if source_batch_id:
            db.add(BatchConsumption(
                packing_order_id=po.id,
                input_batch_id=source_batch_id,
                output_batch_id=pu.id,
                qty_consumed=float(carton_qty),
            ))
        units.append(pu)

    return units


async def consume_packaging_materials(
    db: AsyncSession,
    po: PackingOrder,
    materials: list,
    default_location_id=None,
) -> None:
    """Deduct free-entry packaging material (carton, poly bag, label) from stock.

    `materials` are PackingCompletionMaterial rows already attached to the
    completion; each may name its own location, otherwise the packing order's
    source location is used.
    """
    for m in materials:
        loc = m.location_id or default_location_id or po.source_location_id
        if not loc or float(m.qty or 0) <= 0:
            continue
        await stock_service.add_stock_entry(
            db,
            item_id=m.item_id,
            location_id=loc,
            qty_change=-float(m.qty),
            reference_type="PACKING_MATERIAL",
            reference_id=po.code,
            batch_id=m.batch_id,
        )


async def allocated_unit_ids(db: AsyncSession) -> set:
    """Carton batch ids already sitting on a live (non-cancelled) pick list.

    Cartons are soft-reserved, not locked to an SO — but a carton already on
    someone else's open pick list must not be suggested twice.
    """
    result = await db.execute(
        select(PickListLine.batch_id)
        .join(PickList, PickListLine.pick_list_id == PickList.id)
        .filter(PickListLine.batch_id.isnot(None), PickList.status != "CANCELLED")
    )
    return {r[0] for r in result.all() if r[0]}


async def available_packed_units(
    db: AsyncSession,
    item_id,
    location_id=None,
    attribute_value_ids: list[str] = [],
    color_id=None,
    exclude_ids: set = None,
    limit: int = 200,
) -> list[tuple[Batch, StockBalance]]:
    """In-stock cartons for an item/variant, oldest first (FIFO).

    Returns (carton, its balance row) pairs so callers get the carton qty without
    a second lookup. Rejected lots are excluded, matching every other picker.
    """
    v_key = _generate_variant_key(attribute_value_ids, color_id)
    query = (
        select(Batch, StockBalance)
        .join(StockBalance, StockBalance.batch_key == cast(Batch.id, String))
        .filter(
            packed_unit_filter(),
            Batch.item_id == item_id,
            Batch.quality_status == "GOOD",
            StockBalance.item_id == item_id,
            StockBalance.variant_key == v_key,
            StockBalance.qty > 0,
        )
        .order_by(Batch.created_at.asc(), Batch.package_no.asc())
        .limit(limit)
    )
    if location_id:
        query = query.filter(StockBalance.location_id == location_id)

    rows = (await db.execute(query)).all()
    if exclude_ids:
        rows = [r for r in rows if r[0].id not in exclude_ids]
    # A carton is atomic, but nothing in the schema stops it having balance rows at
    # more than one location (e.g. after a manual move that left a zeroed row).
    # Keep one row per carton so a pick suggestion can never list the same physical
    # box twice.
    seen = set()
    out = []
    for batch, bal in rows:
        if batch.id in seen:
            continue
        seen.add(batch.id)
        out.append((batch, bal))
    return out


async def suggest_units_for_line(
    db: AsyncSession,
    item_id,
    remaining_qty: float,
    location_id=None,
    attribute_value_ids: list[str] = [],
    color_id=None,
    exclude_ids: set = None,
) -> list[tuple[Batch, float]]:
    """Pick whole cartons FIFO until `remaining_qty` is covered.

    Cartons are indivisible here on purpose: the picker moves a physical box, so
    the last carton may overshoot the outstanding qty rather than be split.
    """
    units = await available_packed_units(
        db, item_id, location_id=location_id,
        attribute_value_ids=attribute_value_ids, color_id=color_id,
        exclude_ids=exclude_ids,
    )
    picked: list[tuple[Batch, float]] = []
    covered = 0.0
    for pu, bal in units:
        if covered >= float(remaining_qty) - 1e-6:
            break
        qty = float(bal.qty)
        picked.append((pu, qty))
        covered += qty
    return picked
