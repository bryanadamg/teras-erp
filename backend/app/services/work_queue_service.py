"""Work-center dispatch queue — "what can I start next?" for a shop-floor PIC.

This is the operation-level dispatch list every MRP-II system ships (SAP COOIS /
CO24 missing-parts, Oracle Dispatch List, Odoo work-center kanban): the WOs of ONE
work-center type, in scheduled order, each stamped with a material-readiness
verdict. A Dyeing PIC opens it and sees which orders have greige behind them; they
never read a Production Run again.

Two rules make the verdict honest, and both are easy to get wrong:

1. **Allocation, not raw on-hand.** A column showing "greige on hand: 500 kg" makes
   three orders that each need 400 kg all look ready. The pool is therefore a
   MUTABLE ledger consumed in priority order (same shape as
   ``netting_service.Availability``): the first order claims its 400, the rest see
   what is actually left. Colour variants sharing one greige base (Item-B) is
   exactly the case that breaks without this.

2. **Staged stock is still in the pool.** Staging is a two-sided transfer, so
   material moved to a WO's input location is still counted by a plant-wide
   StockBalance sum. Every WO's staged qty is therefore deducted from the pool
   BEFORE anyone allocates (pass 0), or a staged order double-counts its own
   material and the next order in line reads ready when it is not.

Requirement maths deliberately mirror ``api/work_orders._wo_required_rows``
(same percentage/qty formula, no BOM input tolerance applied). If the two diverge,
the queue says READY and the staging modal says SHORT for the same order.

Only the step's SUBSTRATE gates the verdict — the greige for dyeing, the yarn for
warping. Auxiliary chemicals are reported alongside but never turn a row red: a
0.2 kg missing softener must not block a 500 kg dye lot. There is no chemical flag
on Item, so the substrate is the largest requirement of the step, which holds for
every textile routing here (dye chemicals are dosed per 100 kg of substrate).
Weaving is the exception: warp beams are loom resources counted in whole pieces
against ``WorkCenter.beam_slots``, never in kg, so a weaving row is gated by mounts.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func, or_, and_, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.work_order import WorkOrder
from app.models.manufacturing import (
    ManufacturingOrder, MOPlannedComponent, MOCompletion, MODependency,
)
from app.models.routing import WorkCenter
from app.models.bom import BOMOperation
from app.models.stock_balance import StockBalance
from app.models.stock_ledger import StockLedger
from app.models.batch import BeamMount
from app.services import beam_service, netting_service
from app.services.stock_service import _generate_variant_key

EPS = 1e-6

# Open-order statuses that still consume material. DELIVERED is excluded: its qty
# is met, so it is not queued work.
QUEUE_STATUSES = ("PENDING", "IN_PROGRESS")

# Same alias map the WO list filter uses — Indonesian center names coexist with
# the English ones on real installs.
CENTER_TYPE_ALIASES: dict[str, list[str]] = {
    "BEAMING": ["BEAMING"],
    "WARPING": ["WARPING"],
    "WEAVING": ["WEAVING", "TENUN"],
    "DYEING": ["DYEING", "CELUP"],
    "SETTING": ["SETTING"],
    "FINISHING": ["FINISHING"],
}

VERDICT_RUNNING = "RUNNING"
VERDICT_STAGED = "STAGED"
VERDICT_READY = "READY"
VERDICT_PARTIAL = "PARTIAL"
VERDICT_WAITING_UPSTREAM = "WAITING_UPSTREAM"
VERDICT_WAITING_PRIOR = "WAITING_PRIOR"
VERDICT_SHORT = "SHORT"
VERDICT_NO_MATERIALS = "NO_MATERIALS"

# Sort weight for the queue: the actionable rows float to the top of their date
# band, blocked ones sink. Within a weight, scheduled date decides.
_VERDICT_WEIGHT = {
    VERDICT_RUNNING: 0,
    VERDICT_STAGED: 1,
    VERDICT_READY: 2,
    VERDICT_PARTIAL: 3,
    VERDICT_WAITING_UPSTREAM: 4,
    VERDICT_SHORT: 5,
    VERDICT_WAITING_PRIOR: 6,
    VERDICT_NO_MATERIALS: 7,
}

_FAR_FUTURE = datetime(9999, 12, 31)


def center_type_ids_query(center_type: str):
    """Work-center ids of a center type (all aliases). Subquery, so it composes
    into the WO filter without a second round trip."""
    types = CENTER_TYPE_ALIASES.get(center_type.upper(), [center_type.upper()])
    return select(WorkCenter.id).where(
        func.upper(WorkCenter.center_type).in_(types)
    ).scalar_subquery()


async def _load_work_orders(db: AsyncSession, center_type: str, work_center_id: str) -> list[WorkOrder]:
    conds = [WorkOrder.status.in_(QUEUE_STATUSES)]
    if work_center_id:
        conds.append(WorkOrder.work_center_id == work_center_id)
    elif center_type:
        conds.append(WorkOrder.work_center_id.in_(center_type_ids_query(center_type)))

    stmt = (
        select(WorkOrder)
        .where(and_(*conds))
        .options(
            joinedload(WorkOrder.work_center),
            joinedload(WorkOrder.manufacturing_order).joinedload(ManufacturingOrder.item),
            joinedload(WorkOrder.manufacturing_order).selectinload(
                ManufacturingOrder.planned_components
            ).joinedload(MOPlannedComponent.item),
            joinedload(WorkOrder.manufacturing_order).joinedload(ManufacturingOrder.color),
        )
    )
    return list((await db.execute(stmt)).unique().scalars().all())


async def _op_center_types(db: AsyncSession, op_ids: list) -> dict[str, str]:
    """bom_operation_id -> center_type of the work center that step runs on.
    Bulk version of the per-WO lookup in ``_wo_step_components`` step 2."""
    if not op_ids:
        return {}
    rows = await db.execute(
        select(BOMOperation.id, WorkCenter.center_type)
        .join(WorkCenter, BOMOperation.work_center_id == WorkCenter.id)
        .where(BOMOperation.id.in_(list(op_ids)))
    )
    return {str(oid): (ct or "") for oid, ct in rows.all()}


def _step_components(wo: WorkOrder, mo: ManufacturingOrder, wc_type: str,
                     op_types: dict[str, str], beam_ids: set[str]) -> list[MOPlannedComponent]:
    """Which planned components this WO's step consumes. Same layered detection as
    ``api/work_orders._wo_step_components`` (exact op -> same center type -> weaving
    beams -> untagged lines), rewritten against pre-fetched maps so a 200-row queue
    does not fire four queries per row."""
    comps = list(mo.planned_components or [])
    if not comps:
        return []

    if wo.bom_operation_id:
        exact = [c for c in comps
                 if c.bom_operation_id and str(c.bom_operation_id) == str(wo.bom_operation_id)]
        if exact:
            return exact

    if not wo.work_center_id:
        return []

    if wc_type:
        by_type = [c for c in comps
                   if c.bom_operation_id and op_types.get(str(c.bom_operation_id)) == wc_type]
        if by_type:
            return by_type

    if wc_type.upper() in beam_service.WEAVING_TYPES:
        beams = [c for c in comps if str(c.item_id) in beam_ids]
        if beams:
            return beams

    return [c for c in comps if not c.bom_operation_id]


def _required_qty(wo: WorkOrder, mo: ManufacturingOrder, c: MOPlannedComponent) -> float:
    """Requirement for this WO's run size. Mirrors _wo_required_rows exactly —
    percentage-of-output first, else qty-per-unit. No BOM input tolerance: the
    staging screen does not apply it either, and a queue that promises more than
    staging demands would read READY on an order staging then refuses."""
    wo_qty = float(wo.qty or mo.qty or 0)
    if c.percentage:
        return (wo_qty * float(c.percentage)) / 100
    if c.qty:
        return wo_qty * float(c.qty)
    return 0.0


async def _staged_by_wo(db: AsyncSession, wos: list[WorkOrder]) -> dict[tuple[str, str], float]:
    """(wo_id, item_id) -> qty already staged to that WO's input location.
    One grouped query for the whole queue; the per-WO helper in api/work_orders
    runs one query per WO."""
    wo_ids = [str(w.id) for w in wos if w.input_location_id]
    if not wo_ids:
        return {}
    rows = await db.execute(
        select(StockLedger.reference_id, StockLedger.item_id, StockLedger.location_id,
               func.sum(StockLedger.qty_change))
        .where(
            StockLedger.reference_type == "Staging",
            StockLedger.reference_id.in_(wo_ids),
            StockLedger.qty_change > 0,
        )
        .group_by(StockLedger.reference_id, StockLedger.item_id, StockLedger.location_id)
    )
    input_loc = {str(w.id): str(w.input_location_id) for w in wos if w.input_location_id}
    out: dict[tuple[str, str], float] = {}
    for ref, item_id, loc_id, qty in rows.all():
        # Staging rows are written to the WO input location; a WO re-pointed at a
        # different input since then must not count stock left at the old one.
        if input_loc.get(str(ref)) != str(loc_id):
            continue
        out[(str(ref), str(item_id))] = out.get((str(ref), str(item_id)), 0.0) + float(qty or 0)
    return out


async def _on_hand_pool(db: AsyncSession, item_ids: set[str]) -> dict[tuple[str, str], float]:
    """(item_id, variant_key) -> good on-hand, summed plant-wide.

    Location-agnostic by design (single plant, see CLAUDE.md netting notes) and
    QC-rejected / disposed lots are excluded through the same subquery the MRP
    netting uses, so a rejected greige lot never makes an order look ready."""
    if not item_ids:
        return {}
    rows = await db.execute(
        select(StockBalance.item_id, StockBalance.variant_key, func.sum(StockBalance.qty))
        .where(
            StockBalance.item_id.in_([uuid.UUID(i) for i in item_ids]),
            StockBalance.qty > 0,
            or_(
                StockBalance.batch_key == "",
                StockBalance.batch_key.notin_(netting_service.rejected_batch_keys()),
            ),
        )
        .group_by(StockBalance.item_id, StockBalance.variant_key)
    )
    return {(str(i), v or ""): float(q or 0) for i, v, q in rows.all()}


async def _mo_logged_qty(db: AsyncSession, mo_ids: list) -> dict[str, float]:
    """MO -> good qty logged so far (rejected completions excluded)."""
    if not mo_ids:
        return {}
    rows = await db.execute(
        select(MOCompletion.mo_id, func.sum(MOCompletion.qty_completed))
        .where(MOCompletion.mo_id.in_(list(mo_ids)), MOCompletion.rejected == False)  # noqa: E712
        .group_by(MOCompletion.mo_id)
    )
    return {str(m): float(q or 0) for m, q in rows.all()}


async def _pegged_supply(db: AsyncSession, mo_ids: list) -> dict[tuple[str, str], dict]:
    """(dependent_mo_id, produced_item_id) -> {qty, mo_code, eta}.

    The MRP pegging table already records which component MO each order waits on,
    so "waiting upstream" is answered exactly — this order waits on MO-0399, due
    Thursday — instead of guessing from a plant-wide incoming total."""
    if not mo_ids:
        return {}
    rows = await db.execute(
        select(MODependency.dependent_mo_id, ManufacturingOrder)
        .join(ManufacturingOrder, MODependency.required_mo_id == ManufacturingOrder.id)
        .where(
            MODependency.dependent_mo_id.in_(list(mo_ids)),
            ManufacturingOrder.status.in_(netting_service.ONGOING),
        )
    )
    pairs = rows.all()
    if not pairs:
        return {}
    logged = await _mo_logged_qty(db, [m.id for _, m in pairs])

    out: dict[tuple[str, str], dict] = {}
    for dep_id, req_mo in pairs:
        outstanding = max(0.0, float(req_mo.qty or 0) - logged.get(str(req_mo.id), 0.0))
        if outstanding <= EPS:
            continue
        key = (str(dep_id), str(req_mo.item_id))
        cur = out.setdefault(key, {"qty": 0.0, "mo_code": req_mo.code, "eta": req_mo.target_end_date})
        cur["qty"] += outstanding
        # Report the LAST arrival — the order is only unblocked once every pegged
        # supplier has landed, so the earliest ETA would be an optimistic lie.
        if req_mo.target_end_date and (not cur["eta"] or req_mo.target_end_date > cur["eta"]):
            cur["eta"] = req_mo.target_end_date
    return out


async def _prior_ops_open(db: AsyncSession, wos: list[WorkOrder]) -> dict[str, str]:
    """wo_id -> code of the earlier-sequence WO still blocking it.

    Mirrors the completion gate in api/manufacturing: logging on a PENDING WO is
    rejected while any lower-sequence WO on the same MO is not COMPLETED. Material
    readiness is moot if the floor cannot log the order at all."""
    mo_ids = {w.manufacturing_order_id for w in wos}
    if not mo_ids:
        return {}
    rows = await db.execute(
        select(WorkOrder.manufacturing_order_id, WorkOrder.sequence, WorkOrder.code, WorkOrder.status)
        .where(WorkOrder.manufacturing_order_id.in_(list(mo_ids)))
    )
    by_mo: dict[str, list[tuple[int, str, str]]] = {}
    for mo_id, seq, code, status in rows.all():
        by_mo.setdefault(str(mo_id), []).append((int(seq or 0), code or "", status or ""))

    out: dict[str, str] = {}
    for w in wos:
        if w.status != "PENDING":
            continue
        blockers = [
            (s, c) for s, c, st in by_mo.get(str(w.manufacturing_order_id), [])
            if s < int(w.sequence or 0) and st != "COMPLETED"
        ]
        if blockers:
            out[str(w.id)] = sorted(blockers)[0][1]
    return out


async def _beam_readiness(db: AsyncSession, wcs: set, item_ids: set) -> dict[tuple[str, str], tuple[int, float]]:
    """(work_center_id, item_id) -> (mounted pcs, mounted kg) for open mounts.

    One query over the loom's live balances instead of beam_service.active_mounts
    per WO — the queue can hold every loom in the plant."""
    if not wcs or not item_ids:
        return {}
    rows = await db.execute(
        select(BeamMount.work_center_id, BeamMount.item_id, BeamMount.batch_id, StockBalance.qty)
        .outerjoin(
            StockBalance,
            and_(
                StockBalance.item_id == BeamMount.item_id,
                StockBalance.location_id == BeamMount.location_id,
                StockBalance.variant_key == "",
                StockBalance.batch_key == cast(BeamMount.batch_id, String),
            ),
        )
        .where(
            BeamMount.work_center_id.in_(list(wcs)),
            BeamMount.item_id.in_(list(item_ids)),
            BeamMount.dismounted_at.is_(None),
        )
    )
    out: dict[tuple[str, str], tuple[int, float]] = {}
    for wc_id, item_id, _batch, qty in rows.all():
        remaining = float(qty or 0)
        pcs, kg = out.get((str(wc_id), str(item_id)), (0, 0.0))
        # A depleted-but-not-yet-dismounted beam holds a slot but no warp.
        out[(str(wc_id), str(item_id))] = (pcs + (1 if remaining > EPS else 0), kg + remaining)
    return out


async def build_queue(
    db: AsyncSession,
    center_type: str = "",
    work_center_id: str = "",
    search: str = "",
) -> list[dict]:
    """The dispatch list. Returns plain dicts (serialized by WorkQueueRow)."""
    wos = await _load_work_orders(db, center_type, work_center_id)
    if not wos:
        return []

    # --- bulk prefetch -----------------------------------------------------
    wc_types = {
        str(w.work_center_id): (w.work_center.center_type or "")
        for w in wos if w.work_center_id and w.work_center
    }
    all_comps = [c for w in wos for c in (w.manufacturing_order.planned_components or [])]
    op_types = await _op_center_types(db, {c.bom_operation_id for c in all_comps if c.bom_operation_id})
    beam_ids = await beam_service.beam_item_ids(db, [c.item_id for c in all_comps])

    staged = await _staged_by_wo(db, wos)
    prior_blockers = await _prior_ops_open(db, wos)
    pegged = await _pegged_supply(db, [w.manufacturing_order_id for w in wos])

    # --- resolve each WO's step materials ----------------------------------
    resolved: list[dict] = []
    for w in wos:
        mo = w.manufacturing_order
        wc_type = wc_types.get(str(w.work_center_id), "")
        comps = _step_components(w, mo, wc_type, op_types, beam_ids)
        mats = []
        for c in comps:
            req = _required_qty(w, mo, c)
            if req <= 0:
                continue
            mats.append({
                "comp": c,
                "required": req,
                "variant_key": _generate_variant_key(list(c.attribute_value_ids or [])),
                "is_beam": str(c.item_id) in beam_ids,
                "staged": staged.get((str(w.id), str(c.item_id)), 0.0),
            })
        resolved.append({"wo": w, "mo": mo, "wc_type": wc_type, "mats": mats})

    beam_state = await _beam_readiness(
        db,
        {r["wo"].work_center_id for r in resolved if r["wo"].work_center_id},
        {m["comp"].item_id for r in resolved for m in r["mats"] if m["is_beam"]},
    )
    pool = await _on_hand_pool(
        db, {str(m["comp"].item_id) for r in resolved for m in r["mats"] if not m["is_beam"]}
    )

    # --- pass 0: staged stock is already physically claimed ----------------
    # It still sits in a StockBalance row (staging is a transfer, not an issue), so
    # leaving it in the pool would let the NEXT order allocate material that is
    # already on someone else's line.
    for r in resolved:
        for m in r["mats"]:
            if m["is_beam"] or m["staged"] <= EPS:
                continue
            key = (str(m["comp"].item_id), m["variant_key"])
            pool[key] = max(0.0, pool.get(key, 0.0) - m["staged"])

    # --- pass 1: allocate in priority order --------------------------------
    resolved.sort(key=lambda r: (
        r["wo"].target_start_date or r["mo"].target_start_date or _FAR_FUTURE,
        int(r["wo"].sequence or 0),
        r["wo"].code or "",
    ))

    # Beam readiness has to be known BEFORE the substrate is picked: a loom fed by
    # two warps (BEAM A + BEAM B) is gated by whichever one is missing, not by
    # whichever one is bigger.
    for r in resolved:
        for m in r["mats"]:
            if m["is_beam"]:
                m["mounted_pcs"] = beam_state.get(
                    (str(r["wo"].work_center_id), str(m["comp"].item_id)), (0, 0.0)
                )[0]

    rows: list[dict] = []
    for r in resolved:
        w, mo, mats = r["wo"], r["mo"], r["mats"]
        substrate = _pick_substrate(mats)
        materials_out = []
        allocated_map: dict[str, float] = {}

        for m in mats:
            c = m["comp"]
            gates = substrate is not None and m is substrate
            if m["is_beam"]:
                pcs, kg = beam_state.get((str(w.work_center_id), str(c.item_id)), (0, 0.0))
                materials_out.append({
                    "item_id": c.item_id,
                    "item_code": c.item.code if c.item else None,
                    "item_name": c.item.name if c.item else None,
                    "required_qty": m["required"], "staged_qty": 0.0,
                    "on_hand_qty": kg, "allocated_qty": kg, "shortfall_qty": 0.0,
                    "is_beam": True, "is_substrate": gates,
                    "mounted_pcs": pcs,
                    "required_pcs": max(1, int((w.work_center.beam_slots if w.work_center else 1) or 1)),
                    "incoming_qty": 0.0, "incoming_mo_code": None, "incoming_eta": None,
                })
                continue

            key = (str(c.item_id), m["variant_key"])
            need = max(0.0, m["required"] - m["staged"])
            available = pool.get(key, 0.0)
            got = min(available, need)
            pool[key] = available - got
            allocated_map[str(c.item_id)] = got
            peg = pegged.get((str(mo.id), str(c.item_id))) or {}
            materials_out.append({
                "item_id": c.item_id,
                "item_code": c.item.code if c.item else None,
                "item_name": c.item.name if c.item else None,
                "required_qty": m["required"],
                "staged_qty": m["staged"],
                # on_hand is what was free when THIS row's turn came, not the raw
                # plant total — that is the whole point of the running ledger.
                "on_hand_qty": available,
                "allocated_qty": got,
                "shortfall_qty": max(0.0, need - got),
                "is_beam": False, "is_substrate": gates,
                "mounted_pcs": 0, "required_pcs": 0,
                "incoming_qty": float(peg.get("qty") or 0),
                "incoming_mo_code": peg.get("mo_code"),
                "incoming_eta": peg.get("eta"),
            })

        verdict, detail = _verdict(w, substrate, materials_out, prior_blockers.get(str(w.id)))
        chem_short = [
            m for m in materials_out
            if not m["is_substrate"] and not m["is_beam"] and m["shortfall_qty"] > EPS
        ]
        rows.append({
            "work_order_id": w.id,
            "work_order_code": w.code,
            "work_order_name": w.name,
            "status": w.status,
            "sequence": w.sequence,
            "staging_status": w.staging_status or "NOT_STAGED",
            "work_center_id": w.work_center_id,
            "work_center_name": w.work_center.name if w.work_center else None,
            "work_center_type": r["wc_type"],
            "mo_id": mo.id,
            "mo_code": mo.code,
            "item_code": mo.item.code if mo.item else None,
            "item_name": mo.item.name if mo.item else None,
            "color_name": mo.color.name if mo.color else None,
            "qty": float(w.qty or mo.qty or 0),
            "target_start_date": w.target_start_date or mo.target_start_date,
            "verdict": verdict,
            "verdict_detail": detail,
            "substrate_item_code": (substrate and substrate["comp"].item and substrate["comp"].item.code) or None,
            # A beam-gated row is measured in PIECES, not kg — a warp is either up or
            # it isn't. Reporting its kg requirement here would render as a permanent
            # shortfall on a fully-warped loom.
            "substrate_is_beam": bool(substrate and substrate["is_beam"]),
            "substrate_required_qty": (
                float(max(1, int((w.work_center.beam_slots if w.work_center else 1) or 1)))
                if substrate and substrate["is_beam"]
                else (substrate["required"] if substrate else 0.0)
            ),
            "substrate_available_qty": (
                float(substrate.get("mounted_pcs", 0)) if substrate and substrate["is_beam"]
                else (allocated_map.get(str(substrate["comp"].item_id), 0.0) + substrate["staged"]
                      if substrate else 0.0)
            ),
            "chemical_shortfall_count": len(chem_short),
            "materials": materials_out,
        })

    if search:
        term = search.strip().lower()
        rows = [
            r for r in rows
            if term in (r["work_order_code"] or "").lower()
            or term in (r["mo_code"] or "").lower()
            or term in (r["item_code"] or "").lower()
            or term in (r["item_name"] or "").lower()
            or term in (r["color_name"] or "").lower()
        ]

    rows.sort(key=lambda r: (
        _VERDICT_WEIGHT.get(r["verdict"], 9),
        r["target_start_date"] or _FAR_FUTURE,
        r["work_order_code"] or "",
    ))
    return rows


def _pick_substrate(mats: list[dict]) -> Optional[dict]:
    """The material that gates the step.

    Beams win outright — a loom without warp cannot run whatever else is staged —
    and among several beams the gate is the LEAST mounted one, not the largest: a
    loom fed by BEAM A and BEAM B is not ready until both warps are up. For
    everything else the gate is the largest requirement, which is the substrate in
    every routing here (dye chemicals are dosed per 100 kg of it and come out an
    order of magnitude smaller)."""
    if not mats:
        return None
    beams = [m for m in mats if m["is_beam"]]
    if beams:
        return min(beams, key=lambda m: (m.get("mounted_pcs", 0), -m["required"]))
    return max(mats, key=lambda m: m["required"])


def _verdict(wo: WorkOrder, substrate: Optional[dict], materials: list[dict],
             prior_blocker: Optional[str]) -> tuple[str, Optional[str]]:
    if wo.status == "IN_PROGRESS":
        return VERDICT_RUNNING, None
    if prior_blocker:
        return VERDICT_WAITING_PRIOR, f"Waiting on {prior_blocker}"
    if not substrate:
        return VERDICT_NO_MATERIALS, "No materials resolved for this step"

    row = next((m for m in materials if m["is_substrate"]), None)
    if row is None:
        return VERDICT_NO_MATERIALS, None

    if row["is_beam"]:
        need_pcs = max(1, int(row["required_pcs"] or 1))
        if row["mounted_pcs"] >= need_pcs:
            return VERDICT_STAGED, f"{row['mounted_pcs']}/{need_pcs} beams mounted"
        if row["mounted_pcs"] > 0:
            return VERDICT_PARTIAL, f"{row['mounted_pcs']}/{need_pcs} beams mounted"
        return VERDICT_SHORT, f"0/{need_pcs} beams mounted"

    need = row["required_qty"] - row["staged_qty"]
    if need <= EPS:
        return VERDICT_STAGED, None
    if row["shortfall_qty"] <= EPS:
        return VERDICT_READY, None
    if row["allocated_qty"] > EPS:
        return VERDICT_PARTIAL, f"{row['allocated_qty']:.1f} of {need:.1f} available"
    if row["incoming_qty"] > EPS:
        eta = row["incoming_eta"]
        when = f" due {eta.strftime('%d %b')}" if eta else ""
        return VERDICT_WAITING_UPSTREAM, f"{row['incoming_mo_code'] or 'upstream order'}{when}"
    return VERDICT_SHORT, f"short {row['shortfall_qty']:.1f}"
