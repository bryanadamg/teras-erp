from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload, selectinload
from app.models.stock_ledger import StockLedger
from app.models.stock_balance import StockBalance
from app.models.attribute import AttributeValue
from app.models.item import Item
from fastapi import HTTPException

def _generate_variant_key(attribute_value_ids: list[str], color_id=None) -> str:
    """Standardizes variant identification string.

    Color-type finished goods carry no color attribute value — the shade lives in
    a separate `color_id`. To keep per-color FG stock in distinct balance rows,
    the color is folded in as a trailing ``c:<uuid>`` token (after the sorted
    attribute UUIDs, so it never collides with them and stays deterministic).
    """
    parts = sorted(str(uid) for uid in attribute_value_ids)
    if color_id:
        parts.append(f"c:{color_id}")
    return ",".join(parts)


def _parse_variant_key(variant_key: str):
    """Inverse of _generate_variant_key: split a stored key back into
    (attribute_value_ids, color_id). Used when re-posting stock derived from an
    existing balance row (e.g. batch/beam moves) so the color token survives."""
    import uuid as _uuid
    attr_ids: list = []
    color_id = None
    for tok in (variant_key or "").split(","):
        if not tok:
            continue
        if tok.startswith("c:"):
            color_id = tok[2:]
        else:
            attr_ids.append(_uuid.UUID(tok))
    return attr_ids, color_id

async def get_stock_balance(db: AsyncSession, item_id, location_id, attribute_value_ids: list[str] = [], batch_key: str = "", color_id=None):
    """
    PRE-CALCULATED O(1) LOOKUP:
    Retrieves the exact balance from the summary table instead of summing the ledger.
    When batch_key is empty, returns the total across all batches for non-batch stock.
    """
    v_key = _generate_variant_key(attribute_value_ids, color_id)
    if batch_key:
        result = await db.execute(select(StockBalance).filter(
            StockBalance.item_id == item_id,
            StockBalance.location_id == location_id,
            StockBalance.variant_key == v_key,
            StockBalance.batch_key == batch_key
        ))
        balance = result.scalars().first()
        return float(balance.qty) if balance else 0.0
    else:
        # Sum all balances (batch and non-batch) for availability checks
        result = await db.execute(
            select(func.sum(StockBalance.qty)).filter(
                StockBalance.item_id == item_id,
                StockBalance.location_id == location_id,
                StockBalance.variant_key == v_key,
            )
        )
        total = result.scalar()
        return float(total) if total else 0.0

async def add_stock_entry(
    db: AsyncSession,
    item_id,
    location_id,
    qty_change,
    reference_type,
    reference_id,
    attribute_value_ids: list[str] = [],
    batch_id=None,
    cones_change: int = 0,
    boxes_change: int = 0,
    drums_change: int = 0,
    color_id=None,
):
    batch_key = str(batch_id) if batch_id else ""
    cones_change = int(cones_change or 0)
    boxes_change = int(boxes_change or 0)
    drums_change = int(drums_change or 0)
    v_key = _generate_variant_key(attribute_value_ids, color_id)

    # 1. Lock the relevant balance row(s) FIRST, then apply the negative-stock guard
    # against the locked value. Locking before checking (rather than checking with an
    # unlocked read and locking only for the later update) closes the race where two
    # concurrent deductions both read a sufficient balance before either applies.
    #
    # Guard applies to base qty only — packaging counts are advisory tallies
    # (no UOM conversion) and may legitimately drift, so they never block.
    if qty_change < 0 and not batch_key:
        # Aggregate guard: a plain (non-batch) deduction is checked against the total
        # on-hand across all batch rows for this item/location/variant, but only the
        # batch_key="" row is actually updated below — lock every row in that set
        # before summing so the guard and the update share one consistent snapshot.
        locked_result = await db.execute(
            select(StockBalance)
            .filter(
                StockBalance.item_id == item_id,
                StockBalance.location_id == location_id,
                StockBalance.variant_key == v_key,
            )
            .with_for_update()
        )
        locked_rows = locked_result.scalars().all()
        current_balance = sum(float(r.qty) for r in locked_rows)
        if current_balance + qty_change < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Current: {current_balance}, Required: {abs(qty_change)}"
            )
        balance = next((r for r in locked_rows if r.batch_key == ""), None)
    else:
        result = await db.execute(
            select(StockBalance)
            .filter(
                StockBalance.item_id == item_id,
                StockBalance.location_id == location_id,
                StockBalance.variant_key == v_key,
                StockBalance.batch_key == batch_key,
            )
            .with_for_update()
            .limit(1)
        )
        balance = result.scalars().first()
        if qty_change < 0:
            current_balance = float(balance.qty) if balance else 0.0
            if current_balance + qty_change < 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock. Current: {current_balance}, Required: {abs(qty_change)}"
                )

    # 2. Create the Ledger Entry
    entry = StockLedger(
        item_id=item_id,
        location_id=location_id,
        qty_change=qty_change,
        reference_type=reference_type,
        reference_id=reference_id,
        batch_id=batch_id,
        color_id=color_id,
        qty_cones_change=cones_change or None,
        qty_boxes_change=boxes_change or None,
        qty_drums_change=drums_change or None,
    )

    if attribute_value_ids:
        result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(attribute_value_ids)))
        vals = result.scalars().all()
        entry.attribute_values = vals

    db.add(entry)

    # 3. ATOMIC SUMMARY UPDATE (balance row already locked above)
    if not balance:
        balance = StockBalance(
            item_id=item_id,
            location_id=location_id,
            variant_key=v_key,
            batch_key=batch_key,
            qty=qty_change,
            qty_cones=cones_change,
            qty_boxes=boxes_change,
            qty_drums=drums_change,
        )
        if attribute_value_ids:
            result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(attribute_value_ids)))
            vals = result.scalars().all()
            balance.attribute_values = vals
        db.add(balance)
    else:
        balance.qty = float(balance.qty) + float(qty_change)
        balance.qty_cones = int(balance.qty_cones or 0) + cones_change
        balance.qty_boxes = int(balance.qty_boxes or 0) + boxes_change
        balance.qty_drums = int(balance.qty_drums or 0) + drums_change

    # Flush (not commit): the session uses autoflush=False, so without this, a second
    # add_stock_entry call in the same request for a balance row this call just created
    # (e.g. two lines merging into the same new pool row) wouldn't see it via the
    # business-key SELECT above and would insert a duplicate StockBalance. Flushing
    # sends the INSERT/UPDATE within the open transaction — visible to the next call,
    # still rolled back together with everything else if the caller never commits.
    # Caller commits once at the end so multi-entry operations (transfers, WO
    # completions, staging, dispatch) apply atomically in one transaction.
    await db.flush()

async def get_stock_entries(db: AsyncSession, skip: int = 0, limit: int = 100) -> tuple[list[StockLedger], int]:
    # Count total
    count_result = await db.execute(select(func.count()).select_from(StockLedger))
    total = count_result.scalar()
    
    # Get items
    result = await db.execute(
        select(StockLedger)
        .order_by(StockLedger.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = result.scalars().all()
    return items, total

async def get_all_stock_balances(db: AsyncSession, user=None):
    query = select(StockBalance)

    # item/location are to-one (joinedload = single JOIN, no row multiplication).
    # attribute_values is a collection — joinedload would multiply rows by value count
    # and force a Python-side .unique() dedup. selectinload fetches them in one extra
    # IN query instead, avoiding the cartesian blow-up. Cheaper CPU/RAM on the ARM host.
    result = await db.execute(query.options(
        selectinload(StockBalance.attribute_values),
        joinedload(StockBalance.item).joinedload(Item.category),
        joinedload(StockBalance.location),
    ))
    results = result.scalars().all()

    # batch_key is a plain string (str(batch_id) or ""), not a FK — resolve labels
    # in one extra query instead of making the frontend page through /batches to
    # build its own map (that list is capped and drops older lots/beams from it).
    batch_ids = {r.batch_key for r in results if r.batch_key}
    batch_number_map: dict[str, str] = {}
    if batch_ids:
        import uuid as _uuid
        from app.models.batch import Batch
        valid_ids = []
        for bid in batch_ids:
            try:
                valid_ids.append(_uuid.UUID(bid))
            except ValueError:
                continue
        if valid_ids:
            batch_rows = await db.execute(select(Batch.id, Batch.batch_number).filter(Batch.id.in_(valid_ids)))
            batch_number_map = {str(bid): bnum for bid, bnum in batch_rows.all()}

    return [
        {
            "item_id": r.item_id,
            "item_name": r.item.name if r.item else str(r.item_id),
            "item_code": r.item.code if r.item else str(r.item_id),
            "item_uom": r.item.uom if r.item else "",
            "item_ends": r.item.ends if r.item else None,
            "item_category_id": (r.item.category_id if r.item else None),
            "item_category_name": (r.item.category.name if r.item and r.item.category else None),
            "location_id": r.location_id,
            "location_name": r.location.name if r.location else str(r.location_id),
            "attribute_value_ids": [v.id for v in r.attribute_values],
            "qty": float(r.qty),
            "qty_cones": int(r.qty_cones or 0),
            "qty_boxes": int(r.qty_boxes or 0),
            "qty_drums": int(r.qty_drums or 0),
            "batch_key": r.batch_key,
            "batch_number": batch_number_map.get(r.batch_key) if r.batch_key else None,
        }
        for r in results
        if r.qty != 0 or r.qty_cones or r.qty_boxes or r.qty_drums
    ]

async def get_batch_stock_balances(db: AsyncSession, requirements: list[dict]):
    results_map = {}
    if not requirements:
        return {}

    item_ids = set(req['item_id'] for req in requirements)
    result = await db.execute(select(StockBalance).filter(StockBalance.item_id.in_(item_ids)))
    balances = result.scalars().all()

    for b in balances:
        key = (str(b.item_id), str(b.location_id), b.variant_key)
        results_map[key] = results_map.get(key, 0.0) + float(b.qty)

    return results_map
