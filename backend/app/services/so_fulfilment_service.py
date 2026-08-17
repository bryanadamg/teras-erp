"""Sales-order fulfilment aggregation, and the single owner of SO status.

Four numbers per SO line, all *derived* — nothing is stored on the line, so there
is no second source of truth to drift (`StockBalance` is the only sanctioned
materialization in this codebase):

    made              produced against the line (root MO completions, rejects out)
    packed            ever packed into cartons  (PackingCompletion.qty)
    packed_available  cartons still in stock    (PackedUnit StockBalance > 0)
    dispatched        shipped                   (DISPATCHED pick list lines)

`packed_available` is the READY driver: an order is shippable when every line has
cartons physically in stock, not merely when the loom finished.

`recompute_so_status` replaces the scattered `so.status = "READY"` writes that
used to live in api/manufacturing.py and api/pick_lists.py. Those flipped the
whole order the moment the *first* root MO delivered, so a multi-line SO read as
shippable while most of it was still in production.

Line -> production peg: neither `ManufacturingOrder` nor `PRBomEntry` carries a
`sales_order_line_id`, so `made` matches root MOs on (item, bom, bom_size, color)
with nulls on the line treated as wildcards. Lines on one SO differ by item, so
this resolves uniquely in practice; if two lines ever claim the same MO the qty
is split pro-rata rather than double-counted.
"""

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.batch import Batch
from app.models.manufacturing import ManufacturingOrder, MOCompletion
from app.models.packing import PackingCompletion, PackingOrder
from app.models.pick_list import PickList, PickListLine
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.stock_balance import StockBalance

EPS = 1e-6

# Statuses this module owns. SENT/DELIVERED/CANCELLED are terminal or manually
# set downstream and are never recomputed back into an earlier stage.
_RECOMPUTABLE = ("PENDING", "READY", "PARTIAL")

_ZERO = {"made": 0.0, "packed": 0.0, "packed_available": 0.0, "dispatched": 0.0}


def _f(v) -> float:
    return float(v or 0)


async def fulfilment_map(db: AsyncSession, so_ids: list) -> dict:
    """{str(so_line_id): {made, packed, packed_available, dispatched}} for these SOs.

    Four grouped aggregates for the whole set — no per-order or per-line queries,
    so this stays flat when called for a full page of sales orders.
    """
    so_ids = [i for i in so_ids if i]
    if not so_ids:
        return {}

    line_rows = (
        await db.execute(
            select(
                SalesOrderLine.id,
                SalesOrderLine.sales_order_id,
                SalesOrderLine.item_id,
                SalesOrderLine.bom_id,
                SalesOrderLine.bom_size_id,
                SalesOrderLine.color_id,
                SalesOrderLine.qty,
            ).filter(SalesOrderLine.sales_order_id.in_(so_ids))
        )
    ).all()
    if not line_rows:
        return {}

    line_ids = [r[0] for r in line_rows]
    out = {str(r[0]): dict(_ZERO) for r in line_rows}

    # --- dispatched: only a DISPATCHED pick list has posted stock OUT ---
    for sol_id, qty in (
        await db.execute(
            select(
                PickListLine.sales_order_line_id,
                func.coalesce(func.sum(PickListLine.qty_picked), 0),
            )
            .join(PickList, PickListLine.pick_list_id == PickList.id)
            .filter(
                PickList.sales_order_id.in_(so_ids),
                PickList.status == "DISPATCHED",
            )
            .group_by(PickListLine.sales_order_line_id)
        )
    ).all():
        if str(sol_id) in out:
            out[str(sol_id)]["dispatched"] = _f(qty)

    # --- packed: every carton ever minted against the line ---
    for sol_id, qty in (
        await db.execute(
            select(
                PackingOrder.sales_order_line_id,
                func.coalesce(func.sum(PackingCompletion.qty), 0),
            )
            .join(PackingCompletion, PackingCompletion.packing_order_id == PackingOrder.id)
            .filter(PackingOrder.sales_order_line_id.in_(line_ids))
            .group_by(PackingOrder.sales_order_line_id)
        )
    ).all():
        if str(sol_id) in out:
            out[str(sol_id)]["packed"] = _f(qty)

    # --- packed_available: cartons still holding stock. Carton qty lives only in
    # the StockBalance row keyed by the batch, never on the Batch itself.
    # `quality_status == "GOOD"` mirrors the same gate pick_lists.py uses to decide
    # what's pickable (readiness board query, carton-scan endpoint) — a rejected or
    # disposed carton still has StockBalance.qty > 0 sitting in the defect store,
    # but it can never be picked, so it must not count toward READY either.
    for sol_id, qty in (
        await db.execute(
            select(
                PackingOrder.sales_order_line_id,
                func.coalesce(func.sum(StockBalance.qty), 0),
            )
            .select_from(PackingOrder)
            .join(Batch, Batch.packing_order_id == PackingOrder.id)
            .join(StockBalance, StockBalance.batch_key == cast(Batch.id, String))
            .filter(
                PackingOrder.sales_order_line_id.in_(line_ids),
                Batch.quality_status == "GOOD",
                StockBalance.qty > 0,
            )
            .group_by(PackingOrder.sales_order_line_id)
        )
    ).all():
        if str(sol_id) in out:
            out[str(sol_id)]["packed_available"] = _f(qty)

    # --- made: root MO completions, matched to lines on the variant tuple ---
    mo_rows = (
        await db.execute(
            select(
                ManufacturingOrder.sales_order_id,
                ManufacturingOrder.item_id,
                ManufacturingOrder.bom_id,
                ManufacturingOrder.bom_size_id,
                ManufacturingOrder.color_id,
                func.coalesce(func.sum(MOCompletion.qty_completed), 0),
            )
            .outerjoin(
                MOCompletion,
                (MOCompletion.mo_id == ManufacturingOrder.id)
                & (MOCompletion.rejected == False),  # noqa: E712 - SQL boolean
            )
            .filter(
                ManufacturingOrder.sales_order_id.in_(so_ids),
                ManufacturingOrder.parent_mo_id.is_(None),
                ManufacturingOrder.is_shared_component == False,  # noqa: E712
                ManufacturingOrder.status != "CANCELLED",
            )
            .group_by(
                ManufacturingOrder.sales_order_id,
                ManufacturingOrder.item_id,
                ManufacturingOrder.bom_id,
                ManufacturingOrder.bom_size_id,
                ManufacturingOrder.color_id,
            )
        )
    ).all()

    for mo_so_id, mo_item, mo_bom, mo_size, mo_color, produced in mo_rows:
        produced = _f(produced)
        if produced <= 0:
            continue
        # Lines of the same SO this MO group could belong to. A null on the line
        # is a wildcard: legacy rows predate bom_id/color_id on the SO line.
        claimants = [
            r
            for r in line_rows
            if r[1] == mo_so_id
            and r[2] == mo_item
            and (r[3] is None or r[3] == mo_bom)
            and (r[4] is None or r[4] == mo_size)
            and (r[5] is None or r[5] == mo_color)
        ]
        if not claimants:
            continue
        if len(claimants) == 1:
            out[str(claimants[0][0])]["made"] += produced
            continue
        # Ambiguous (two lines, same item + recipe + size + shade). Split by
        # ordered qty so the totals still reconcile against the SO.
        total = sum(_f(r[6]) for r in claimants)
        if total <= 0:
            share = produced / len(claimants)
            for r in claimants:
                out[str(r[0])]["made"] += share
        else:
            for r in claimants:
                out[str(r[0])]["made"] += produced * (_f(r[6]) / total)

    return out


def derive_status(lines: list, fulfilment: dict) -> str:
    """Status implied by the fulfilment numbers. Pure — no DB, no mutation.

    Order matters: a partially dispatched order reports PARTIAL even though its
    remaining cartons no longer satisfy the READY test (dispatch removed them
    from stock).
    """
    if not lines:
        return "PENDING"

    def stat(line) -> dict:
        return fulfilment.get(str(line.id), _ZERO)

    if all(stat(l)["dispatched"] >= float(l.qty) - EPS for l in lines):
        return "SENT"
    if any(stat(l)["dispatched"] > EPS for l in lines):
        return "PARTIAL"
    if all(stat(l)["packed_available"] >= float(l.qty) - EPS for l in lines):
        return "READY"
    return "PENDING"


async def recompute_so_status(db: AsyncSession, so_id) -> str | None:
    """Re-derive one SO's status. Returns the new status, or None if unchanged.

    Does not commit — the calling endpoint owns the transaction.
    """
    if not so_id:
        return None
    so = (
        await db.execute(
            select(SalesOrder)
            .options(selectinload(SalesOrder.lines))
            .filter(SalesOrder.id == so_id)
        )
    ).scalars().first()
    if not so or so.status not in _RECOMPUTABLE:
        return None

    new_status = derive_status(so.lines, await fulfilment_map(db, [so.id]))
    if new_status == so.status:
        return None
    so.status = new_status
    return new_status


async def recompute_all(db: AsyncSession) -> int:
    """Startup repair pass: re-derive every recomputable SO. Returns rows changed.

    Mirrors `sync_stock_balances()` — the derivation is cheap and idempotent, and
    running it on boot keeps rows written under the old "first MO delivered wins"
    rule from lingering as false READY.
    """
    so_ids = [
        r[0]
        for r in (
            await db.execute(
                select(SalesOrder.id).filter(SalesOrder.status.in_(_RECOMPUTABLE))
            )
        ).all()
    ]
    if not so_ids:
        return 0

    fulfilment = await fulfilment_map(db, so_ids)
    orders = (
        await db.execute(
            select(SalesOrder)
            .options(selectinload(SalesOrder.lines))
            .filter(SalesOrder.id.in_(so_ids))
        )
    ).scalars().all()

    changed = 0
    for so in orders:
        new_status = derive_status(so.lines, fulfilment)
        if new_status != so.status:
            so.status = new_status
            changed += 1
    if changed:
        await db.commit()
    return changed
