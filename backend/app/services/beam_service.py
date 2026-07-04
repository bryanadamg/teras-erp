"""Warp-beam lifecycle around the weaving step.

Staged beams stay individually tracked (batch stock) at the loom's input
location while they wait. When the WEAVING WO actually starts, the beams are
"mounted": each staged beam's remaining kg is merged into the batch-less kg
pool at the input location — the beam disappears from lot tracking — and a
BatchConsumption row (output_batch_id NULL, MO-level) pegs the beam to the MO
for genealogy. Weaving completions then deduct plain pool kg with no per-beam
selection. Leftover warp after weaving is re-lotted manually via the
leftover-beam endpoint in api/work_orders.py.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.work_order import WorkOrder
from app.models.routing import WorkCenter
from app.models.stock_ledger import StockLedger
from app.models.stock_balance import StockBalance
from app.models.batch import BatchConsumption
from app.services import stock_service

WEAVING_TYPES = {"WEAVING", "TENUN"}


async def is_weaving_wo(db: AsyncSession, wo: WorkOrder) -> bool:
    if not wo.work_center_id:
        return False
    wc_type = (
        await db.execute(select(WorkCenter.center_type).where(WorkCenter.id == wo.work_center_id))
    ).scalar()
    return (wc_type or "").upper() in WEAVING_TYPES


async def merge_staged_beams(db: AsyncSession, wo: WorkOrder) -> int:
    """Consume every beam staged to a WEAVING WO into the batch-less kg pool
    at its input location. Idempotent — a beam whose batch balance is already
    zero (merged earlier, or physically moved away) is skipped. Returns the
    number of beams merged. Caller commits."""
    if not wo.input_location_id:
        return 0
    if not await is_weaving_wo(db, wo):
        return 0

    # Beams staged to this WO = positive Staging ledger rows carrying a batch,
    # posted to its input location.
    staged = await db.execute(
        select(StockLedger.batch_id, StockLedger.item_id)
        .where(
            StockLedger.reference_type == "Staging",
            StockLedger.reference_id == str(wo.id),
            StockLedger.location_id == wo.input_location_id,
            StockLedger.qty_change > 0,
            StockLedger.batch_id.isnot(None),
        )
        .distinct()
    )
    merged = 0
    for batch_id, item_id in staged.all():
        bal = (
            await db.execute(
                select(StockBalance.qty).where(
                    StockBalance.item_id == item_id,
                    StockBalance.location_id == wo.input_location_id,
                    StockBalance.variant_key == "",
                    StockBalance.batch_key == str(batch_id),
                )
            )
        ).scalar()
        qty = float(bal or 0)
        if qty <= 0:
            continue
        await stock_service.add_stock_entry(
            db, item_id=item_id, location_id=wo.input_location_id, qty_change=-qty,
            reference_type="Beam Merge", reference_id=str(wo.id),
            attribute_value_ids=[], batch_id=batch_id,
        )
        await stock_service.add_stock_entry(
            db, item_id=item_id, location_id=wo.input_location_id, qty_change=qty,
            reference_type="Beam Merge", reference_id=str(wo.id),
            attribute_value_ids=[], batch_id=None,
        )
        # MO-level pegging: no output lot exists yet at WO start, so the row
        # carries output_batch_id NULL; trace-back resolves it via the MO.
        db.add(BatchConsumption(
            manufacturing_order_id=wo.manufacturing_order_id,
            input_batch_id=batch_id,
            output_batch_id=None,
            qty_consumed=qty,
        ))
        merged += 1
    return merged
