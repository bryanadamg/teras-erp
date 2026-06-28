"""Explosion-time MRP netting (Option A).

When a Production Run or a nested MO is created, each sub-assembly's gross
requirement is netted against *net-free* available stock BEFORE its component
MO is created. Fully-covered components are skipped (and their own sub-tree is
NOT exploded); partially-covered components are resized to the shortfall.

    net_free(item, variant, location)
        = on_hand     -- StockBalance, rolled up across the location's leaf spots
        + incoming    -- outstanding output of OTHER open MOs producing the item
        - required    -- outstanding component demand of OTHER open MOs

"OTHER" excludes the unit being planned (the current Production Run, or the
current root MO) so a run never nets against its own freshly-created demand —
that demand IS the gross requirement we are netting.

The availability ledger is MUTABLE: every node that consumes free stock
decrements the running balance, so two sibling demands (or two consolidated
component keys) cannot both claim the same physical stock.

Scope notes (Tier 1):
- Netting applies to components/sub-assemblies only. The root finished good is
  always produced at full qty (make-to-order) — the caller never nets the root.
- Cross-location supply (transfer instead of make) is NOT modelled here; netting
  is scoped to each node's planned source location and its leaf spots.
- Safety stock and BOM tolerance % are ignored (gross = qty x percentage / 100);
  this mirrors the qty an MO is actually sized at.
- net_free is a creation-time snapshot. There is no reservation row written, so
  re-running planning after stock moves requires a re-net (out of scope here).
"""
from __future__ import annotations
from collections import defaultdict
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.stock_balance import StockBalance
from app.models.location import Location
from app.models.manufacturing import ManufacturingOrder
from app.models.bom import BOM
from app.services.stock_service import _generate_variant_key

ONGOING = ("PENDING", "IN_PROGRESS")


class Availability:
    """Mutable net-free ledger consumed during BOM explosion.

    Build with the async factory ``await Availability.create(db, ...)`` BEFORE
    creating the MOs of the unit being planned, so their demand is not scanned.
    Then call ``await avail.consume(item, attrs, loc, gross)`` per component node;
    it returns the qty to actually MAKE (0.0 => fully covered, skip the node).
    """

    def __init__(self, db: AsyncSession, exclude_pr_id=None, exclude_mo_ids=None):
        self.db = db
        self.exclude_pr_id = str(exclude_pr_id) if exclude_pr_id else None
        self.exclude_mo_ids = {str(m) for m in (exclude_mo_ids or [])}
        self._demand: dict[tuple, float] = defaultdict(float)   # (item, vkey) -> required
        self._supply: dict[tuple, float] = defaultdict(float)   # (item, vkey) -> incoming
        self._remaining: dict[tuple, float] = {}                # running free-stock ledger

    @classmethod
    async def create(cls, db: AsyncSession, exclude_pr_id=None, exclude_mo_ids=None) -> "Availability":
        self = cls(db, exclude_pr_id, exclude_mo_ids)
        await self._load_open_demand()
        return self

    async def _load_open_demand(self):
        """Aggregate outstanding component demand + own-output supply from every
        open MO, EXCLUDING the unit being planned.

        Plant-level (location-agnostic) netting: supply and demand are keyed by
        (item, variant) only. Where the stock physically sits is irrelevant to the
        make-vs-stock decision — that is an execution/staging concern."""
        mos = (await self.db.execute(
            select(ManufacturingOrder)
            .where(ManufacturingOrder.status.in_(ONGOING))
            .options(
                selectinload(ManufacturingOrder.planned_components),
                selectinload(ManufacturingOrder.completions),
                selectinload(ManufacturingOrder.attribute_values),
            )
        )).unique().scalars().all()

        for mo in mos:
            if self.exclude_pr_id and str(mo.production_run_id) == self.exclude_pr_id:
                continue
            if str(mo.id) in self.exclude_mo_ids:
                continue
            completed = sum(float(c.qty_completed) for c in mo.completions)
            outstanding = float(mo.qty) - completed
            if outstanding <= 0:
                continue

            # Demand: components this MO will still consume.
            for comp in mo.planned_components:
                if not comp.percentage and not comp.qty:
                    continue
                req = (outstanding * float(comp.percentage)) / 100 if comp.percentage else outstanding * float(comp.qty)
                vkey = _generate_variant_key([str(a) for a in (comp.attribute_value_ids or [])])
                self._demand[(str(comp.item_id), vkey)] += req

            # Supply: this MO's own outstanding output is a scheduled receipt.
            out_vkey = _generate_variant_key([str(v.id) for v in mo.attribute_values])
            self._supply[(str(mo.item_id), out_vkey)] += outstanding

    async def _on_hand(self, item_id: str, vkey: str) -> float:
        """Physical on-hand of (item, variant), summed across ALL stock locations
        (single-plant scope)."""
        total = (await self.db.execute(
            select(func.sum(StockBalance.qty)).where(
                StockBalance.item_id == item_id,
                StockBalance.variant_key == vkey,
            )
        )).scalar()
        return float(total or 0.0)

    async def _net_free(self, item_id: str, vkey: str) -> float:
        on_hand = await self._on_hand(item_id, vkey)
        key = (item_id, vkey)
        return on_hand + self._supply.get(key, 0.0) - self._demand.get(key, 0.0)

    async def consume_detailed(self, item_id, attribute_value_ids, location_id, gross_req: float):
        """Dry-run variant of consume() for the creation preview. ``location_id``
        is accepted for caller compatibility / display only — it is NOT part of the
        netting key (plant-level netting).

        Returns (net_qty, detail). ``detail`` carries the figures the UI shows:
        on_hand, incoming, required_other, net_free (original for the key),
        free_before (running balance before this node), covered. Decrements the
        ledger exactly like consume() so the preview matches what creation does.
        """
        empty = {"on_hand": 0.0, "incoming": 0.0, "required_other": 0.0,
                 "net_free": 0.0, "free_before": 0.0, "covered": 0.0}
        if gross_req <= 0:
            return 0.0, empty
        if item_id is None:
            return gross_req, empty
        item_s = str(item_id)
        vkey = _generate_variant_key([str(a) for a in (attribute_value_ids or [])])
        key = (item_s, vkey)
        on_hand = await self._on_hand(item_s, vkey)
        incoming = self._supply.get(key, 0.0)
        required = self._demand.get(key, 0.0)
        net_free = on_hand + incoming - required
        if key not in self._remaining:
            self._remaining[key] = net_free
        free_before = self._remaining[key]
        covered = min(max(0.0, free_before), gross_req)
        self._remaining[key] = free_before - covered
        return gross_req - covered, {
            "on_hand": on_hand, "incoming": incoming, "required_other": required,
            "net_free": net_free, "free_before": free_before, "covered": covered,
        }

    async def consume(self, item_id, attribute_value_ids, location_id, gross_req: float) -> float:
        """Net ``gross_req`` against the running free-stock balance for this node.
        ``location_id`` is accepted for caller compatibility only — plant-level
        netting ignores it.

        Returns the qty to actually MAKE: 0.0 means fully covered by stock (the
        caller should skip the MO and its sub-tree); a smaller-than-gross value
        means resize the MO to the shortfall. Decrements the ledger by whatever
        it covered so later nodes can't reuse the same stock.
        """
        if gross_req <= 0:
            return 0.0
        if item_id is None:
            return gross_req  # no scoped item -> cannot net, make full
        item_s = str(item_id)
        vkey = _generate_variant_key([str(a) for a in (attribute_value_ids or [])])
        key = (item_s, vkey)
        if key not in self._remaining:
            self._remaining[key] = await self._net_free(item_s, vkey)
        free = self._remaining[key]
        if free <= 0:
            return gross_req
        covered = min(free, gross_req)
        self._remaining[key] = free - covered
        return gross_req - covered


# ─────────────────────────────────────────────────────────────────────────────
# Dry-run creation preview
#
# These walkers MIRROR the create path (production_runs Pass 1/Pass 2 +
# manufacturing.create_mo_recursive) but only READ — they create no MOs. They
# reuse the same Availability ledger and the same gross/location resolution so
# the preview reflects exactly what creation will do (including the deep-level
# inherited-source behaviour and net-free). Keep them in sync with the create
# path if its netting/location logic changes.
# ─────────────────────────────────────────────────────────────────────────────

async def _location_name_map(db: AsyncSession) -> dict:
    rows = (await db.execute(select(Location.id, Location.name, Location.code))).all()
    return {str(i): (n or c or "") for i, n, c in rows}


def _root_node(bom, qty: float, location, loc_names: dict) -> dict:
    item = bom.item
    return {
        "level": 0, "is_root": True,
        "item_id": item.id, "item_code": item.code, "item_name": item.name, "uom": item.uom or "",
        "net_from_location_id": location.id,
        "net_from_location_name": loc_names.get(str(location.id), location.code or ""),
        "gross_required": qty, "on_hand": 0.0, "incoming": 0.0, "required_other": 0.0,
        "net_free": 0.0, "net_qty": qty, "decision": "MAKE_ROOT",
    }


def _component_node(sub_bom, level: int, loc_id, gross: float, net: float, detail: dict, loc_names: dict) -> dict:
    item = sub_bom.item
    if net <= 0:
        decision = "SKIP"
    elif net < gross:
        decision = "RESIZE"
    else:
        decision = "MAKE"
    return {
        "level": level, "is_root": False,
        "item_id": item.id, "item_code": item.code, "item_name": item.name, "uom": item.uom or "",
        "net_from_location_id": loc_id,
        "net_from_location_name": loc_names.get(str(loc_id), ""),
        "gross_required": gross,
        "on_hand": detail["on_hand"], "incoming": detail["incoming"],
        "required_other": detail["required_other"], "net_free": detail["net_free"],
        "net_qty": net, "decision": decision,
    }


async def _active_sub_bom(db: AsyncSession, item_id):
    return (await db.execute(
        select(BOM).options(joinedload(BOM.item), selectinload(BOM.attribute_values))
        .filter(BOM.item_id == item_id, BOM.active == True).limit(1)  # noqa: E712
    )).unique().scalars().first()


async def _preview_children(db, avail, bom_id, parent_net, source_location_id, location_id, level, nodes, loc_names):
    """Mirror of create_mo_recursive's child loop (read-only)."""
    bom = (await db.execute(
        select(BOM).options(selectinload(BOM.lines)).filter(BOM.id == bom_id)
    )).scalars().first()
    if not bom:
        return
    for line in bom.lines:
        if not line.percentage:
            continue
        sub_bom = await _active_sub_bom(db, line.item_id)
        if not sub_bom:
            continue
        gross = (parent_net * float(line.percentage)) / 100
        sub_loc = source_location_id or location_id
        attrs = [str(v.id) for v in sub_bom.attribute_values]
        net, detail = await avail.consume_detailed(sub_bom.item_id, attrs, sub_loc, gross)
        nodes.append(_component_node(sub_bom, level, sub_loc, gross, net, detail, loc_names))
        if net > 0:
            await _preview_children(db, avail, sub_bom.id, net, source_location_id, location_id, level + 1, nodes, loc_names)


async def preview_production_run(db, bom_entries, location, source_location, exclude_pr_id=None) -> list[dict]:
    """Dry-run of create_production_run: roots (always made) + consolidated,
    netted components + deeper netted sub-tree. Returns a flat node list."""
    avail = await Availability.create(db, exclude_pr_id=exclude_pr_id)
    loc_names = await _location_name_map(db)
    nodes: list[dict] = []

    # Pass 1: root finished goods — never netted.
    bom_ro_pairs = []
    for entry in bom_entries:
        bom = (await db.execute(
            select(BOM).options(joinedload(BOM.item)).filter(BOM.id == entry.bom_id)
        )).unique().scalars().first()
        if not bom:
            continue
        root_qtys = []
        if getattr(entry, "sizes", None):
            root_qtys = [float(s.qty) for s in entry.sizes if s.qty and s.qty > 0]
        elif entry.total_qty and entry.total_qty > 0:
            root_qtys = [float(entry.total_qty)]
        for q in root_qtys:
            nodes.append(_root_node(bom, q, location, loc_names))
        if root_qtys:
            bom_ro_pairs.append((bom, root_qtys))

    # Pass 2: consolidate direct-component demand across all roots, then net.
    demand: dict[tuple, dict] = {}
    for bom, root_qtys in bom_ro_pairs:
        bom_lines = (await db.execute(
            select(BOM).options(selectinload(BOM.lines)).filter(BOM.id == bom.id)
        )).scalars().first()
        if not bom_lines:
            continue
        for line in bom_lines.lines:
            if not line.percentage:
                continue
            sub_bom = await _active_sub_bom(db, line.item_id)
            if not sub_bom:
                continue
            src = line.source_location_id or (source_location.id if source_location else (location.id if location else None))
            # Plant-level netting: consolidate by (item, sub_bom) only — location is
            # not part of the key. src is kept just for the display label.
            key = (str(line.item_id), str(sub_bom.id))
            if key not in demand:
                demand[key] = {"sub_bom": sub_bom, "src": src, "total": 0.0,
                               "attrs": [str(v.id) for v in sub_bom.attribute_values]}
            for q in root_qtys:
                demand[key]["total"] += (q * float(line.percentage)) / 100

    for data in demand.values():
        total = data["total"]
        if total <= 0:
            continue
        net, detail = await avail.consume_detailed(data["sub_bom"].item_id, data["attrs"], data["src"], total)
        nodes.append(_component_node(data["sub_bom"], 1, data["src"], total, net, detail, loc_names))
        if net > 0:
            await _preview_children(db, avail, data["sub_bom"].id, net, data["src"], location.id, 2, nodes, loc_names)

    return nodes


async def preview_mo(db, bom_id, qty, location, source_location, create_nested=True, exclude_mo_ids=None) -> list[dict]:
    """Dry-run of a nested MO creation: root (always made) + netted sub-tree."""
    avail = await Availability.create(db, exclude_mo_ids=exclude_mo_ids)
    loc_names = await _location_name_map(db)
    bom = (await db.execute(
        select(BOM).options(joinedload(BOM.item)).filter(BOM.id == bom_id)
    )).unique().scalars().first()
    if not bom:
        return []
    nodes = [_root_node(bom, float(qty), location, loc_names)]
    if create_nested:
        src = source_location.id if source_location else location.id
        await _preview_children(db, avail, bom_id, float(qty), src, location.id, 1, nodes, loc_names)
    return nodes
