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
from sqlalchemy.orm import selectinload

from app.models.stock_balance import StockBalance
from app.models.location import Location
from app.models.manufacturing import ManufacturingOrder
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
        self._demand: dict[tuple, float] = defaultdict(float)   # (item, vkey, loc) -> required
        self._supply: dict[tuple, float] = defaultdict(float)   # (item, vkey, loc) -> incoming
        self._leaves: dict[str, list[str]] = {}                 # loc_id -> [leaf loc ids]
        self._remaining: dict[tuple, float] = {}                # running free-stock ledger

    @classmethod
    async def create(cls, db: AsyncSession, exclude_pr_id=None, exclude_mo_ids=None) -> "Availability":
        self = cls(db, exclude_pr_id, exclude_mo_ids)
        await self._load_locations()
        await self._load_open_demand()
        return self

    async def _load_locations(self):
        """Build a location -> leaf-descendants map (stock sits only in leaves)."""
        rows = (await self.db.execute(select(Location.id, Location.parent_id))).all()
        children: dict[str, list[str]] = defaultdict(list)
        all_ids: list[str] = []
        for lid, pid in rows:
            sid = str(lid)
            all_ids.append(sid)
            if pid:
                children[str(pid)].append(sid)

        def leaves(loc: str) -> list[str]:
            kids = children.get(loc)
            if not kids:
                return [loc]               # leaf (or unknown) -> itself
            out: list[str] = []
            for k in kids:
                out.extend(leaves(k))
            return out

        self._leaves = {lid: leaves(lid) for lid in all_ids}

    async def _load_open_demand(self):
        """Aggregate outstanding component demand + own-output supply from every
        open MO, EXCLUDING the unit being planned."""
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
                loc = comp.source_location_id or mo.source_location_id or mo.location_id
                vkey = _generate_variant_key([str(a) for a in (comp.attribute_value_ids or [])])
                self._demand[(str(comp.item_id), vkey, str(loc))] += req

            # Supply: this MO's own outstanding output is a scheduled receipt.
            out_loc = mo.location_id
            out_vkey = _generate_variant_key([str(v.id) for v in mo.attribute_values])
            self._supply[(str(mo.item_id), out_vkey, str(out_loc))] += outstanding

    async def _on_hand(self, item_id: str, vkey: str, loc_id: str) -> float:
        """Physical on-hand of (item, variant), summed across the location's leaf spots."""
        leaf_ids = self._leaves.get(loc_id, [loc_id])
        total = (await self.db.execute(
            select(func.sum(StockBalance.qty)).where(
                StockBalance.item_id == item_id,
                StockBalance.location_id.in_(leaf_ids),
                StockBalance.variant_key == vkey,
            )
        )).scalar()
        return float(total or 0.0)

    async def _net_free(self, item_id: str, vkey: str, loc_id: str) -> float:
        on_hand = await self._on_hand(item_id, vkey, loc_id)
        key = (item_id, vkey, loc_id)
        return on_hand + self._supply.get(key, 0.0) - self._demand.get(key, 0.0)

    async def consume(self, item_id, attribute_value_ids, location_id, gross_req: float) -> float:
        """Net ``gross_req`` against the running free-stock balance for this node.

        Returns the qty to actually MAKE: 0.0 means fully covered by stock (the
        caller should skip the MO and its sub-tree); a smaller-than-gross value
        means resize the MO to the shortfall. Decrements the ledger by whatever
        it covered so later nodes can't reuse the same stock.
        """
        if gross_req <= 0:
            return 0.0
        item_s = str(item_id)
        vkey = _generate_variant_key([str(a) for a in (attribute_value_ids or [])])
        loc_s = str(location_id)
        key = (item_s, vkey, loc_s)
        if key not in self._remaining:
            self._remaining[key] = await self._net_free(item_s, vkey, loc_s)
        free = self._remaining[key]
        if free <= 0:
            return gross_req
        covered = min(free, gross_req)
        self._remaining[key] = free - covered
        return gross_req - covered
