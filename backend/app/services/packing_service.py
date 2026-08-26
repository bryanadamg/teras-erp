"""Packing / PackedUnit domain logic.

A PackedUnit is a physical carton. It is stored as a `Batch` row — the same
modelling choice already made for warp beams — so its quantity lives in the
normal `StockBalance` row keyed by `batch_key = <batch id>` at the packed
location, and there is no second qty record to drift. `Batch.packing_order_id`
is the discriminator: non-null means "this batch is a carton".
"""
import uuid
from collections import Counter, deque
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.batch import Batch, BatchConsumption
from app.models.packing import PackingOrder, PackingCompletion
from app.models.pick_list import PickList, PickListLine
from app.models.stock_balance import StockBalance
from app.services import stock_service, numbering_service
from app.services.stock_service import _generate_variant_key
from app.api.batches import generate_batch_number


PACKED_UNIT_PREFIX = "PU"


def is_packed_unit(batch: Batch) -> bool:
    return batch is not None and batch.packing_order_id is not None


def packed_unit_filter():
    """SQL filter selecting only PackedUnit batches — the single definition,
    mirroring `beam_service.beam_item_ids()`. Never inline the column test."""
    return Batch.packing_order_id.isnot(None)


def split_qty(total: float, box_size: float) -> list[float]:
    """Fixed-size boxes plus one remainder box, not an even split.

    A carton is a physical box of a known size (e.g. 5kg) — the packer expects
    `floor(total / box_size)` full boxes, with only the leftover in a smaller
    final box, never all boxes shrunk to absorb it. Rounded to 4dp to match
    Numeric(14, 4). `box_size <= 0` means no box size is configured — the whole
    qty goes into a single carton.
    """
    total = float(total)
    box_size = float(box_size)
    if box_size <= 0:
        return [round(total, 4)]
    full = int(total // box_size)
    remainder = round(total - full * box_size, 4)
    parts = [round(box_size, 4)] * full
    if remainder > 1e-6:
        parts.append(remainder)
    return parts or [round(total, 4)]


def describe_box_breakdown(qtys: list[float]) -> str:
    """Human-readable box breakdown for an audit log entry, e.g. "5 × 5 + 1 × 3".

    Groups equal-sized boxes together (largest first) rather than listing every
    carton, since a bulk log event can mint dozens of identically-sized boxes.
    """
    counts = Counter(round(float(q), 4) for q in qtys)
    return " + ".join(
        f"{n} × {q:g}" for q, n in sorted(counts.items(), key=lambda kv: -kv[0])
    )


def allocate_boxes_to_lots(
    lot_qtys: list[float],
    boxes: list[float],
    weights: Optional[list[Optional[float]]] = None,
) -> list[list[tuple[float, Optional[float]]]]:
    """Assign a user-edited, FIFO-ordered list of box quantities across lots.

    A physical carton can only be pegged to one lot (BatchConsumption is 1:1),
    so a box that doesn't fit in what's left of the current lot splits there —
    the leftover continues into the next lot as its own carton. This is what
    lets the packer edit one flat box list without caring which lot backs each
    box; the split only becomes visible (as one extra carton) at a lot seam.

    `weights` is the packer's scale reading per box, positional against `boxes`.
    A box that splits at a lot seam is physically two cartons, so its weight can
    only be shared out pro-rata by qty — the scale figure entered for one box no
    longer describes either half. Returns `(qty, weight)` pairs; a weight is None
    only where the caller passed none, which `assert_all_weighed` then rejects.
    """
    total_lots = round(sum(float(q) for q in lot_qtys), 4)
    total_boxes = round(sum(float(b) for b in boxes), 4)
    if abs(total_lots - total_boxes) > 1e-3:
        raise ValueError(
            f"Boxes total {total_boxes:g} does not match the {total_lots:g} being packed"
        )

    # (remaining qty, original qty, original weight) — the original qty is kept so
    # a split share stays proportional to the whole box, not to the remainder.
    queue: deque[tuple[float, float, Optional[float]]] = deque()
    for i, b in enumerate(boxes):
        qty = round(float(b), 4)
        if qty <= 1e-9:
            continue
        w = None
        if weights is not None and i < len(weights) and weights[i] is not None:
            w = float(weights[i])
        queue.append((qty, qty, w))

    out: list[list[tuple[float, Optional[float]]]] = []
    for lot_qty in lot_qtys:
        remaining = round(float(lot_qty), 4)
        cartons: list[tuple[float, Optional[float]]] = []
        while remaining > 1e-6 and queue:
            box, box_full, box_w = queue[0]
            take = round(min(box, remaining), 4)
            share = None if box_w is None else round(box_w * take / box_full, 4)
            cartons.append((take, share))
            remaining = round(remaining - take, 4)
            if take >= box - 1e-6:
                queue.popleft()
            else:
                queue[0] = (round(box - take, 4), box_full, box_w)
        out.append(cartons)
    return out


def assert_all_weighed(carton_qtys: list[tuple[float, Optional[float]]], package_label: str = "carton") -> None:
    """Every carton must carry the packer's scale reading.

    Packing is logged *after* the boxes are physically packed and weighed, so an
    unweighed carton is a missing measurement rather than one taken later — and
    it would print a carton label with a blank N.W. line and an empty net-weight
    barcode. Enforced here rather than in the form so no caller (desktop modal,
    mobile scanner, a future API client) can mint one.
    """
    missing = [i + 1 for i, (_, w) in enumerate(carton_qtys) if w is None or float(w) <= 0]
    if missing:
        label = (package_label or "carton").lower()
        raise ValueError(
            f"Net weight is required for every {label} — "
            f"{len(missing)} of {len(carton_qtys)} not weighed"
        )


async def resolve_lot_variant(db: AsyncSession, po: PackingOrder, batch_id) -> tuple[list, object, float]:
    """Variant identity + available qty of one source lot at the order's source store.

    The picked lot pins an exact `StockBalance` row, and that row's `variant_key`
    already IS the variant the bulk FG is held under — so the variant is read back
    off the stock rather than restated on the packing order. This is why the create
    form asks for a lot instead of a variant: a hand-picked variant that disagreed
    with the stock minted cartons into an empty pool while the real stock sat
    untouched.
    """
    rows = (await db.execute(
        select(StockBalance).filter(
            StockBalance.item_id == po.item_id,
            StockBalance.location_id == po.source_location_id,
            StockBalance.batch_key == str(batch_id),
            StockBalance.qty > 0,
        ).order_by(StockBalance.qty.desc())
    )).scalars().all()
    if not rows:
        raise ValueError("Lot has no stock at the packing order's source location")
    # A lot is one physical thing, so one variant — take the largest row if a
    # legacy split ever produced more than one.
    attr_ids, color_id = stock_service._parse_variant_key(rows[0].variant_key)
    return attr_ids, color_id, float(rows[0].qty)


async def resolve_bulk_variant(db: AsyncSession, po: PackingOrder) -> tuple[list, object]:
    """Variant for a pack event with no source lot (non-lot-tracked FG).

    Prefers the order's own attribute values when it has them (SO-line inheritance
    still sets these). Otherwise derives from the un-lotted stock at the source
    location — unambiguous when only one variant is held there, which is the
    normal case for a single FG item in a single bin.
    """
    if po.attribute_values or po.color_id:
        return [str(v.id) for v in (po.attribute_values or [])], po.color_id
    rows = (await db.execute(
        select(StockBalance.variant_key, func.sum(StockBalance.qty))
        .filter(
            StockBalance.item_id == po.item_id,
            StockBalance.location_id == po.source_location_id,
            StockBalance.batch_key == "",
            StockBalance.qty > 0,
        )
        .group_by(StockBalance.variant_key)
    )).all()
    if not rows:
        return [], None
    if len(rows) > 1:
        raise ValueError(
            "Several variants of this item are in stock at the source location — "
            "select a lot so the variant is unambiguous"
        )
    return stock_service._parse_variant_key(rows[0][0])


async def _next_package_no(db: AsyncSession, packing_order_id) -> int:
    """Carton numbering continues across the whole packing order, not per event.

    Allocated off a per-order number range. max(package_no)+1 raced: two packers
    scanning the same Kartu Packing at once both read the same maximum, and
    `package_no` has no unique constraint — so two cartons went out with the same
    number on their labels and the pick list could not tell them apart."""
    async def _seed() -> int:
        return int((await db.execute(
            select(func.max(Batch.package_no)).filter(Batch.packing_order_id == packing_order_id)
        )).scalar() or 0)

    return await numbering_service.allocate(db, f"PACKED_UNIT:{packing_order_id}", seed=_seed)


async def mint_packed_units(
    db: AsyncSession,
    po: PackingOrder,
    completion: PackingCompletion,
    carton_qtys: list[tuple[float, Optional[float]]],
    attribute_value_ids: list[str],
    color_id,
    username: Optional[str] = None,
    source_batch_id=None,
) -> list[tuple[Batch, float]]:
    """Consume bulk FG and mint one carton per `(qty, net_weight_kg)` entry.

    The caller decides the split (a fixed box size via `split_qty`, or an
    explicit user-edited list via `allocate_boxes_to_lots`) — this function
    just mints whatever list it's handed. Net weight is the packer's scale
    reading for that physical carton (None when not weighed); it is a measured
    figure, never derived from qty, which is why it is captured per box at pack
    time rather than computed here. Stock moves twice per carton: OUT of
    the packing order's source location on the incoming lot, IN at the output
    location keyed by the new carton batch. `BatchConsumption` pegs input lot ->
    carton so lot genealogy survives packing. Returns each minted carton
    alongside its qty, so a caller can render the box breakdown (e.g. for an
    audit log entry) without recomputing the split.
    """
    if not po.output_location_id:
        raise ValueError("Packing order has no output location")
    if not po.source_location_id:
        raise ValueError("Packing order has no source location")

    completion.package_count = len(carton_qtys)
    units: list[tuple[Batch, float]] = []

    for carton_qty, net_weight in carton_qtys:
        pu = Batch(
            batch_number=await generate_batch_number(db, prefix=PACKED_UNIT_PREFIX),
            item_id=po.item_id,
            packing_order_id=po.id,
            packing_completion_id=completion.id,
            weight_kg=net_weight,
            # Allocated per carton, not as a pre-reserved block: a block computed
            # up front overlaps a completion posted concurrently on the same order.
            package_no=await _next_package_no(db, po.id),
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
        units.append((pu, carton_qty))

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
