"""Explosion-time MRP netting (Option A).

When a Production Run or a nested MO is created, each sub-assembly's gross
requirement is netted against *net-free* available stock BEFORE its component
MO is created. Fully-covered components are skipped (and their own sub-tree is
NOT exploded); partially-covered components are resized to the shortfall.

    net_free(item, variant, location)
        = on_hand     -- StockBalance, rolled up across the location's leaf spots
        + incoming    -- outstanding output of OTHER open MOs producing the item,
                         excluding COMMITTED output (see below)
        - required    -- outstanding component demand of OTHER open MOs

Committed-supply rule: a root MO (not a shared component, no parent) that is
linked to a sales order — directly via MO.sales_order_id or through its
Production Run — has its output promised to that order. It is NOT free supply
and never nets away a new, distinct order for the same item. Shared-component
and child MOs stay in supply (their output is balanced by the consuming MOs'
component demand), as do uncommitted root MOs (stock-builds / greige
stockpiling), whose output deliberately covers future demand.

"OTHER" excludes the unit being planned (the current Production Run, or the
current root MO) so a run never nets against its own freshly-created demand —
that demand IS the gross requirement we are netting.

The availability ledger is MUTABLE: every node that consumes free stock
decrements the running balance, so two sibling demands (or two consolidated
component keys) cannot both claim the same physical stock.

Scope notes (Tier 1):
- Production Run root finished goods ARE netted (same SKIP/RESIZE/MAKE rule as
  components), unless the PR's BOM entry sets force_create=True — used to
  deliberately keep producing an item that already carries stock (e.g. greige
  stockpiling). A single ad-hoc MO created via POST /manufacturing-orders is
  make-to-order and its root is still never netted; only its descendants are.
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

from sqlalchemy import select, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.stock_balance import StockBalance
from app.models.location import Location
from app.models.manufacturing import ManufacturingOrder
from app.models.production_run import ProductionRun
from app.models.batch import Batch
from app.models.bom import BOM, BOMLine
from app.models.item import Item
from app.services.stock_service import _generate_variant_key
from app.services.mrp_service import _line_decoupled, _combo_attr_id, _line_combo_value_ids


def rejected_batch_keys():
    """Subquery of batch_keys whose lot is QC-REJECTED or DISPOSED — their stock
    is physically present (rejected) or being written off (disposed) but must
    never count as good/available."""
    return select(cast(Batch.id, String)).where(Batch.quality_status.in_(("REJECTED", "DISPOSED")))

# Orders still open. DELIVERED = planned qty met but not closed; it contributes no
# remaining demand or supply (outstanding <= 0 short-circuits below) but is included
# so an order whose qty is later raised, or whose output is rejected, nets correctly.
ONGOING = ("PENDING", "IN_PROGRESS", "DELIVERED")


async def _sales_order_linked_prs(db: AsyncSession, mos) -> set[str]:
    """IDs (as str) of Production Runs that carry a sales_order_id, among the
    PRs referenced by ``mos``. Used to detect committed output on root MOs that
    only link to their sales order through the PR."""
    pr_ids = {mo.production_run_id for mo in mos if mo.production_run_id and not mo.sales_order_id}
    if not pr_ids:
        return set()
    rows = (await db.execute(
        select(ProductionRun.id).where(
            ProductionRun.id.in_(pr_ids),
            ProductionRun.sales_order_id.is_not(None),
        )
    )).all()
    return {str(i) for (i,) in rows}


def _output_committed(mo, so_linked_prs: set[str]) -> bool:
    """Committed-supply rule: a sales-order-linked root MO's output belongs to
    that order and is not free incoming supply. Shared-component and child MOs
    are never committed (their output is balanced by the consuming MOs'
    component demand); uncommitted roots are stock-builds whose output is
    deliberately free."""
    return (
        not mo.is_shared_component
        and mo.parent_mo_id is None
        and (mo.sales_order_id is not None or str(mo.production_run_id) in so_linked_prs)
    )


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

        so_linked_prs = await _sales_order_linked_prs(self.db, mos)

        for mo in mos:
            if self.exclude_pr_id and str(mo.production_run_id) == self.exclude_pr_id:
                continue
            if str(mo.id) in self.exclude_mo_ids:
                continue
            completed = sum(float(c.qty_completed) for c in mo.completions if not c.rejected)
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

            # Supply: this MO's own outstanding output is a scheduled receipt —
            # unless it is COMMITTED to a sales order (committed-supply rule),
            # in which case it must not cover other, distinct demand.
            if _output_committed(mo, so_linked_prs):
                continue
            out_vkey = _generate_variant_key([str(v.id) for v in mo.attribute_values], getattr(mo, "color_id", None))
            self._supply[(str(mo.item_id), out_vkey)] += outstanding

    async def _on_hand(self, item_id: str, vkey: str) -> float:
        """Physical on-hand of (item, variant), summed across ALL stock locations
        (single-plant scope)."""
        total = (await self.db.execute(
            select(func.sum(StockBalance.qty)).where(
                StockBalance.item_id == item_id,
                StockBalance.variant_key == vkey,
                StockBalance.batch_key.not_in(rejected_batch_keys()),
            )
        )).scalar()
        return float(total or 0.0)

    async def _net_free(self, item_id: str, vkey: str) -> float:
        on_hand = await self._on_hand(item_id, vkey)
        key = (item_id, vkey)
        return on_hand + self._supply.get(key, 0.0) - self._demand.get(key, 0.0)

    async def consume_detailed(self, item_id, attribute_value_ids, location_id, gross_req: float, color_id=None):
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
        vkey = _generate_variant_key([str(a) for a in (attribute_value_ids or [])], color_id)
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

    async def consume(self, item_id, attribute_value_ids, location_id, gross_req: float, color_id=None) -> float:
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
        vkey = _generate_variant_key([str(a) for a in (attribute_value_ids or [])], color_id)
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
        "net_from_location_id": location.id if location else None,
        "net_from_location_name": (loc_names.get(str(location.id), location.code or "") if location else ""),
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


async def _info_detail(avail: "Availability", item_id, attribute_value_ids, color_id=None) -> dict:
    """Read-only stock snapshot for a (item, variant) — used for FORCED root
    nodes, which bypass netting entirely and must not decrement the ledger."""
    vkey = _generate_variant_key([str(a) for a in (attribute_value_ids or [])], color_id)
    item_s = str(item_id)
    on_hand = await avail._on_hand(item_s, vkey)
    key = (item_s, vkey)
    incoming = avail._supply.get(key, 0.0)
    required = avail._demand.get(key, 0.0)
    return {"on_hand": on_hand, "incoming": incoming, "required_other": required,
            "net_free": on_hand + incoming - required}


def _root_netted_node(bom, gross: float, net: float, detail: dict, loc_id, loc_names: dict, forced: bool) -> dict:
    item = bom.item
    if forced:
        decision = "FORCED"
    elif net <= 0:
        decision = "SKIP"
    elif net < gross:
        decision = "RESIZE"
    else:
        decision = "MAKE"
    return {
        "level": 0, "is_root": True,
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


async def preview_production_run(db, bom_entries, location, source_location, exclude_pr_id=None) -> list[dict]:
    """Dry-run of create_production_run: netted roots (unless force_create) +
    consolidated, netted components + deeper netted sub-tree. Returns a flat
    node list."""
    avail = await Availability.create(db, exclude_pr_id=exclude_pr_id)
    loc_names = await _location_name_map(db)
    nodes: list[dict] = []

    # Pass 1: root finished goods — netted against stock same as a component,
    # unless the entry's force_create bypasses it (stockpile override).
    root_loc = source_location.id if source_location else (location.id if location else None)
    bom_ro_pairs = []
    for entry in bom_entries:
        bom = (await db.execute(
            select(BOM).options(joinedload(BOM.item), selectinload(BOM.attribute_values))
            .filter(BOM.id == entry.bom_id)
        )).unique().scalars().first()
        if not bom:
            continue
        gross_qtys = []
        if getattr(entry, "sizes", None):
            gross_qtys = [float(s.qty) for s in entry.sizes if s.qty and s.qty > 0]
        elif entry.total_qty and entry.total_qty > 0:
            gross_qtys = [float(entry.total_qty)]
        if not gross_qtys:
            continue

        force = bool(getattr(entry, "force_create", False))
        entry_attr_ids = getattr(entry, "attribute_value_ids", None)
        entry_color_id = getattr(entry, "color_id", None)
        root_attrs = (
            [str(v) for v in entry_attr_ids] if entry_attr_ids
            else [str(v.id) for v in bom.attribute_values]
        )

        net_qtys = []
        for gross in gross_qtys:
            if force:
                detail = await _info_detail(avail, bom.item_id, root_attrs, entry_color_id)
                net = gross
            else:
                net, detail = await avail.consume_detailed(bom.item_id, root_attrs, root_loc, gross, color_id=entry_color_id)
            nodes.append(_root_netted_node(bom, gross, net, detail, root_loc, loc_names, force))
            if net > 0:
                net_qtys.append(net)

        if net_qtys:
            bom_ro_pairs.append((bom, net_qtys))

    # Pass 2+: consolidate component demand level-by-level (breadth-first),
    # mirroring the multi-level pooling the create path now does — a shared
    # component's total demand across every branch is netted once, at every
    # depth, not just directly below the roots.
    current_gen = [(bom, qty) for bom, root_qtys in bom_ro_pairs for qty in root_qtys]
    combo_attr_id = await _combo_attr_id(db)
    level = 1
    while current_gen:
        demand: dict[tuple, dict] = {}
        for bom, qty in current_gen:
            bom_lines = (await db.execute(
                select(BOM).options(
                    selectinload(BOM.lines).selectinload(BOMLine.attribute_values)
                ).filter(BOM.id == bom.id)
            )).scalars().first()
            if not bom_lines:
                continue
            for line in bom_lines.lines:
                if not line.percentage:
                    continue
                sub_bom = await _active_sub_bom(db, line.item_id)
                if not sub_bom:
                    continue
                item_flag = (await db.execute(
                    select(Item.is_decoupling_point).filter(Item.id == line.item_id)
                )).scalar()
                src = line.source_location_id or (source_location.id if source_location else (location.id if location else None))
                # Combo tagged on the line splits pegging per combo (mirrors size);
                # folded into the netting variant. Plant-level netting otherwise
                # consolidates by (item, sub_bom) — location not part of the key.
                line_combo = _line_combo_value_ids(line, combo_attr_id)
                comp_attrs = sorted(set(
                    [str(v.id) for v in sub_bom.attribute_values] + line_combo
                ))
                key = (str(line.item_id), str(sub_bom.id), tuple(line_combo))
                if key not in demand:
                    demand[key] = {"sub_bom": sub_bom, "src": src, "total": 0.0,
                                   "attrs": comp_attrs,
                                   "decoupled": _line_decoupled(line, item_flag)}
                demand[key]["total"] += (qty * float(line.percentage)) / 100

        next_gen = []
        for data in demand.values():
            total = data["total"]
            if total <= 0:
                continue
            # Decoupling point: mirror the create path — record the demand node for
            # visibility but create no MO and don't explode the sub-tree. Read-only
            # stock snapshot (no ledger decrement) since nothing is made here.
            if data["decoupled"]:
                detail = await _info_detail(avail, data["sub_bom"].item_id, data["attrs"])
                node = _component_node(data["sub_bom"], level, data["src"], total, 0.0, detail, loc_names)
                node["decision"] = "DECOUPLED"
                nodes.append(node)
                continue
            net, detail = await avail.consume_detailed(data["sub_bom"].item_id, data["attrs"], data["src"], total)
            nodes.append(_component_node(data["sub_bom"], level, data["src"], total, net, detail, loc_names))
            if net > 0:
                next_gen.append((data["sub_bom"], net))
        current_gen = next_gen
        level += 1

    return nodes


async def _preview_children(db, avail, bom_id, parent_net, source_location_id, location_id, level, nodes, loc_names):
    """Mirror of create_mo_recursive's child loop (read-only), for a single
    ad-hoc MO's own sub-tree — no cross-branch pooling applies here since
    there is only one branch."""
    bom = (await db.execute(
        select(BOM).options(
            selectinload(BOM.lines).selectinload(BOMLine.attribute_values)
        ).filter(BOM.id == bom_id)
    )).scalars().first()
    if not bom:
        return
    combo_attr_id = await _combo_attr_id(db)
    for line in bom.lines:
        if not line.percentage:
            continue
        sub_bom = await _active_sub_bom(db, line.item_id)
        if not sub_bom:
            continue
        gross = (parent_net * float(line.percentage)) / 100
        sub_loc = source_location_id or location_id
        # Combo on the line folds into the produced variant (mirrors create path).
        line_combo = _line_combo_value_ids(line, combo_attr_id)
        attrs = sorted(set([str(v.id) for v in sub_bom.attribute_values] + line_combo))
        item_flag = (await db.execute(
            select(Item.is_decoupling_point).filter(Item.id == line.item_id)
        )).scalar()
        # Decoupling point: show the demand node, create nothing, don't recurse.
        if _line_decoupled(line, item_flag):
            detail = await _info_detail(avail, sub_bom.item_id, attrs)
            node = _component_node(sub_bom, level, sub_loc, gross, 0.0, detail, loc_names)
            node["decision"] = "DECOUPLED"
            nodes.append(node)
            continue
        net, detail = await avail.consume_detailed(sub_bom.item_id, attrs, sub_loc, gross)
        nodes.append(_component_node(sub_bom, level, sub_loc, gross, net, detail, loc_names))
        if net > 0:
            await _preview_children(db, avail, sub_bom.id, net, source_location_id, location_id, level + 1, nodes, loc_names)


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
        loc_id = location.id if location else None
        src = source_location.id if source_location else loc_id
        await _preview_children(db, avail, bom_id, float(qty), src, loc_id, 1, nodes, loc_names)
    return nodes
