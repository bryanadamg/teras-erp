"""QC reject routing — where scrap physically goes, and what a rejected lot may
still be used for.

Two rules drive this module:

* **Every reject lands in a defect store, never on the good shelf.** The bin is
  resolved, not typed in: the producing work center's `reject_location_id` first
  (inherited down the TYPE → GROUP → MACHINE tree, so "Gd Greige BS" can be set
  once on the WEAVING type), then the item master's
  `default_reject_location_id`, then whatever the caller explicitly passed. An
  explicit payload location always wins — the resolver only supplies defaults.
* **Reject is not always scrap.** A rejected warp beam can be re-mounted for
  certain items, so `Batch.quality_status` has two reject grades:
  ``REJECTED`` (quarantined, out of every picker) and ``REJECT_USABLE``
  (quarantined and out of *availability netting*, but still selectable in
  consumption/staging pickers with a warning). ``DISPOSED`` is the terminal
  write-off. Read the grades through the constants here — never inline the
  strings — because netting and the pickers must stay in agreement.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import Item
from app.models.location import Location
from app.services import stock_service, work_center_service

# Quality grades on Batch.quality_status.
GOOD = "GOOD"
REJECTED = "REJECTED"           # scrap-bound: excluded from netting AND pickers
REJECT_USABLE = "REJECT_USABLE"  # downgraded but re-usable: pickers may still take it
DISPOSED = "DISPOSED"           # written off, no stock left

REJECT_GRADES = (REJECTED, REJECT_USABLE)
#: Not good stock — excluded from availability netting and from good-stock views.
NON_GOOD_GRADES = (REJECTED, REJECT_USABLE, DISPOSED)
#: Never offered for consumption/staging. REJECT_USABLE is deliberately absent.
UNPICKABLE_GRADES = (REJECTED, DISPOSED)


def is_reject_grade(status: Optional[str]) -> bool:
    return str(status or GOOD).upper() in REJECT_GRADES


def normalize_grade(usable: bool | None) -> str:
    """Payload flag → stored grade. Default (no flag) is plain REJECTED."""
    return REJECT_USABLE if usable else REJECTED


async def resolve_reject_location(
    db: AsyncSession,
    *,
    item_id=None,
    work_center_id=None,
    explicit=None,
    loc_map: dict | None = None,
):
    """Defect store for this reject: explicit override → work center (own value,
    else inherited from its GROUP/TYPE) → item master default. Returns None when
    nothing is configured, in which case the caller leaves the stock where it is
    (a reject with no configured bin must still flag the lot, not 500).
    """
    if explicit:
        return explicit
    if work_center_id:
        wc_loc = await work_center_service.resolve_reject_location(db, work_center_id, loc_map)
        if wc_loc:
            return wc_loc
    if item_id:
        item_loc = (await db.execute(
            select(Item.default_reject_location_id).where(Item.id == item_id)
        )).scalar()
        if item_loc:
            return item_loc
    return None


async def quarantine_lot(
    db: AsyncSession,
    *,
    item_id,
    batch_id,
    location_id,
    reference_id: str,
    reference_type: str = "QC_REJECT",
) -> float:
    """Move a rejected lot's whole on-hand into the defect store. No-op (0.0) when
    no location resolved. Caller commits."""
    if not location_id or not batch_id:
        return 0.0
    return await stock_service.relocate_batch_stock(
        db, item_id=item_id, batch_id=batch_id, location_id=location_id,
        reference_type=reference_type, reference_id=reference_id,
    )


async def move_unlotted_reject(
    db: AsyncSession,
    *,
    item_id,
    qty: float,
    from_location_id,
    to_location_id,
    reference_id: str,
    attribute_value_ids: list | None = None,
    color_id=None,
    reference_type: str = "QC_REJECT",
) -> bool:
    """Un-lotted scrap: two-sided transfer out of the good bin into the defect
    store. Falls back to a one-sided write-off when no defect store is configured,
    which is what the pre-routing behaviour was. Returns True if it relocated
    (rather than wrote off). Caller commits."""
    if not from_location_id or qty <= 0:
        return False
    ids = attribute_value_ids or []
    await stock_service.add_stock_entry(
        db, item_id=item_id, location_id=from_location_id, qty_change=-float(qty),
        reference_type=reference_type, reference_id=reference_id,
        attribute_value_ids=ids, color_id=color_id, batch_id=None,
    )
    if not to_location_id or str(to_location_id) == str(from_location_id):
        return False
    await stock_service.add_stock_entry(
        db, item_id=item_id, location_id=to_location_id, qty_change=float(qty),
        reference_type=reference_type, reference_id=reference_id,
        attribute_value_ids=ids, color_id=color_id, batch_id=None,
    )
    return True


async def location_name(db: AsyncSession, location_id) -> Optional[str]:
    if not location_id:
        return None
    return (await db.execute(select(Location.name).where(Location.id == location_id))).scalar()
