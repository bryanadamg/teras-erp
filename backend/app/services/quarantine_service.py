"""Quarantine hold: which locations hold stock, and which lots are released.

Two concepts live here so the API router and the packing gate agree:

* **Quarantine location** — `Location.is_quarantine`, inherited downward. A plant
  flags a hold *store* (warehouse) but stock physically lives in leaf bins, so a
  bin is quarantined when itself or any ancestor carries the flag.
* **Released lot** — `Batch.quarantine_status` (a snapshot of a `Quarantine
  Status` attribute value) whose text is in ``QUARANTINE_PASS_VALUES``. The
  status list is client-extensible on the Attributes page; the *pass* value is
  not, because it is a gate, not a label. Adding another releasing status is a
  deliberate code change here, never an accident of typing a new value.
"""
import uuid
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.location import Location
from app.models.batch import Batch
from app.models.item import Item
from app.models.attribute import Attribute, AttributeValue

# The one disposition that releases a lot to packing. Everything else — Bulk
# Sample, Waiting Approval, anything the client adds later — holds.
QUARANTINE_PASS_VALUES = {"OK"}

# system_role of the attribute whose values are the disposition list.
QUARANTINE_STATUS_ROLE = "quarantine_status"


def is_pass(status_text: Optional[str]) -> bool:
    return (status_text or "").strip().upper() in QUARANTINE_PASS_VALUES


async def _location_rows(db: AsyncSession) -> list[Location]:
    """Every location. The table is small (hundreds of rows) and both callers
    need the whole parent/child map, so one flat read beats a recursive CTE per
    lookup."""
    return list((await db.execute(select(Location))).scalars().all())


def _expand_quarantine(rows: Iterable[Location]) -> set[uuid.UUID]:
    rows = list(rows)
    flagged = {r.id for r in rows if r.is_quarantine}
    if not flagged:
        return flagged
    # Max depth is 3 (warehouse > zone > bin), so two widening passes close it.
    out = set(flagged)
    for _ in range(2):
        grew = {r.id for r in rows if r.parent_id in out} - out
        if not grew:
            break
        out |= grew
    return out


async def quarantine_location_ids(db: AsyncSession) -> set[uuid.UUID]:
    """Flagged locations plus everything under them — stock only ever sits in leaves."""
    return _expand_quarantine(await _location_rows(db))


async def is_quarantine_location(db: AsyncSession, location_id) -> bool:
    if not location_id:
        return False
    return location_id in await quarantine_location_ids(db)


async def status_values(db: AsyncSession) -> list[AttributeValue]:
    """The `Quarantine Status` attribute's values, in insertion order."""
    result = await db.execute(
        select(AttributeValue)
        .join(Attribute, Attribute.id == AttributeValue.attribute_id)
        .filter(Attribute.system_role == QUARANTINE_STATUS_ROLE)
        .order_by(AttributeValue.value)
    )
    return list(result.scalars().all())


async def resolve_status_value(db: AsyncSession, value_id) -> AttributeValue:
    """Load a disposition value, rejecting one belonging to any other attribute.

    Same guard as dye-recipe wash-bath steps: the FK alone would happily accept
    a colour or a size, and the snapshot would then lie about what it is.
    """
    result = await db.execute(
        select(AttributeValue)
        .join(Attribute, Attribute.id == AttributeValue.attribute_id)
        .filter(AttributeValue.id == value_id, Attribute.system_role == QUARANTINE_STATUS_ROLE)
    )
    val = result.scalars().first()
    if not val:
        raise ValueError(
            "Not a Quarantine Status value — pick one of the values defined on the "
            "'Quarantine Status' attribute (Inventory > Attributes)."
        )
    return val


async def assert_lots_released(
    db: AsyncSession,
    *,
    source_location_id,
    item_id,
    batch_ids: list,
) -> None:
    """Raise ValueError unless every lot being packed out of a hold area is released.

    No-op when the source location is not a quarantine location — packing from
    FG or any normal store is unaffected by this feature.

    Un-lotted stock is only blocked when the item is lot-tracked: a non-lot-tracked
    FG has nothing to disposition, so gating it would deadlock packing forever.
    That is a deliberate hole — quarantine control presumes lot tracking on the
    packed item.
    """
    if not await is_quarantine_location(db, source_location_id):
        return

    real_ids = [b for b in batch_ids if b]
    if len(real_ids) < len(batch_ids):
        lot_tracked = (await db.execute(
            select(Item.lot_tracked).filter(Item.id == item_id)
        )).scalar()
        if lot_tracked:
            raise ValueError(
                "Packing from a quarantine location needs a lot per line so its "
                "quarantine status can be checked."
            )
    if not real_ids:
        return

    rows = (await db.execute(select(Batch).filter(Batch.id.in_(real_ids)))).scalars().all()
    blocked = [b for b in rows if not is_pass(b.quarantine_status)]
    if blocked:
        detail = ", ".join(
            f"{b.batch_number} ({b.quarantine_status or 'no status'})" for b in blocked
        )
        raise ValueError(
            f"Held in quarantine — set the status to OK on the Quarantine Packing "
            f"page before packing: {detail}"
        )
