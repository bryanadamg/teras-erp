"""Production output reports (per machine / per work-center group).

Answers "what did each machine produce between these two dates?" from the work
order completion log. Two invariants drive the shape of this module:

* The machine a completion belongs to is read through its **work order**
  (`COALESCE(work_orders.work_center_id, mo_completions.work_center_id)`) — the
  operator-supplied `MOCompletion.work_center_id` is an optional form field and
  is only the fallback for MO-level logs with no WO attached.
* "Everything under this node" is resolved through the recursive CTE in
  `work_center_service`, never a one-hop `parent_id ==` filter: the GROUP tier is
  optional, so machines may hang one *or* two levels below a TYPE.
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_db
from app.models.auth import User
from app.models.item import Item
from app.models.manufacturing import ManufacturingOrder, MOCompletion
from app.models.routing import WorkCenter
from app.models.work_order import WorkOrder
from app.api.auth import require_permission
from app.services import work_center_service

router = APIRouter()


def _node_type(wc) -> str:
    """MACHINE/GROUP/TYPE. Pre-group rows have no node_type — for them the old
    two-level rule (has a parent => machine) is still the right answer."""
    return str(getattr(wc, "node_type", None) or ("MACHINE" if wc.parent_id else "TYPE")).upper()


def _f(v) -> float:
    return float(v or 0)


def _yield_pct(good: float, rejected: float) -> Optional[float]:
    total = good + rejected
    return round(good / total * 100, 2) if total > 0 else None


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


class _WCIndex:
    """work_centers is a small master table — load it once and walk it in memory
    instead of a query per tree level."""

    def __init__(self, rows: list[WorkCenter]):
        self.by_id = {str(r.id): r for r in rows}
        self.rows = rows

    def ancestors(self, wc_id: str) -> list[WorkCenter]:
        chain: list[WorkCenter] = []
        seen = {str(wc_id)}
        cur = self.by_id.get(str(wc_id))
        while cur is not None and cur.parent_id is not None and str(cur.parent_id) not in seen:
            seen.add(str(cur.parent_id))
            parent = self.by_id.get(str(cur.parent_id))
            if parent is None:
                break
            chain.append(parent)
            cur = parent
        return chain

    def group_of(self, wc_id: str) -> Optional[WorkCenter]:
        for a in self.ancestors(wc_id):
            if _node_type(a) == "GROUP":
                return a
        return None

    def type_of(self, wc_id: str) -> Optional[WorkCenter]:
        node = self.by_id.get(str(wc_id))
        if node is not None and _node_type(node) == "TYPE":
            return node
        for a in self.ancestors(wc_id):
            if _node_type(a) == "TYPE":
                return a
        return None

    def center_type(self, wc_id: str) -> str:
        """A machine may leave center_type blank and inherit it from the GROUP/TYPE."""
        node = self.by_id.get(str(wc_id))
        for n in ([node] if node else []) + self.ancestors(wc_id):
            t = str(getattr(n, "center_type", "") or "").upper()
            if t:
                return t
        return ""

    def machines_under(self, root_id: str) -> list[WorkCenter]:
        out: list[WorkCenter] = []
        seen: set[str] = set()

        def walk(pid: str):
            if pid in seen:
                return
            seen.add(pid)
            for wc in self.rows:
                if str(wc.parent_id or "") != pid:
                    continue
                if _node_type(wc) == "MACHINE":
                    out.append(wc)
                else:
                    walk(str(wc.id))

        root = self.by_id.get(str(root_id))
        if root is not None and _node_type(root) == "MACHINE":
            return [root]
        walk(str(root_id))
        return out


@router.get("/reports/machine-output")
async def machine_output_report(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    work_center_id: Optional[str] = Query(None, description="Exactly one machine"),
    group_id: Optional[str] = Query(None, description="Any container node — its whole subtree"),
    group_by: str = Query("machine", description="'machine' (one row per machine) or 'group'"),
    include_idle: bool = Query(True, description="Keep in-scope machines that logged nothing"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission("reports.view")),
):
    """Per-machine (or per-group) production output logged against work orders."""
    by_group = str(group_by or "machine").lower() == "group"

    # ── Scope ────────────────────────────────────────────────────────────────
    wc_rows = (await db.execute(select(WorkCenter))).scalars().all()
    idx = _WCIndex(list(wc_rows))

    # Bind as real UUIDs: the scoped column is a COALESCE of two UUID columns, so a
    # bare string would land as text and Postgres won't compare uuid = text.
    scope_ids: Optional[list[uuid.UUID]] = None
    if work_center_id:
        scope_ids = [uuid.UUID(str(work_center_id))]
    elif group_id:
        # Recursive CTE — the node's machines may sit behind an optional GROUP.
        sub = await work_center_service.descendant_ids(db, group_id)
        scope_ids = [uuid.UUID(str(group_id))] + [uuid.UUID(str(x)) for x in sub]

    # ── Completion aggregates, pegged through the WO ─────────────────────────
    eff_wc = func.coalesce(WorkOrder.work_center_id, MOCompletion.work_center_id)
    # Rejected logs don't count as output; scrap is summed over every log because a
    # partial reject stays active with the scrapped qty moved onto qty_rejected.
    qty_good = func.sum(case((MOCompletion.rejected == False, MOCompletion.qty_completed), else_=0))  # noqa: E712
    qty_rej = func.sum(func.coalesce(MOCompletion.qty_rejected, 0))

    conditions = [eff_wc.is_not(None)]
    if start_date:
        conditions.append(MOCompletion.created_at >= start_date)
    if end_date:
        conditions.append(MOCompletion.created_at <= end_date)
    if scope_ids is not None:
        conditions.append(eff_wc.in_(scope_ids))

    def _base(stmt):
        return (
            stmt.join(ManufacturingOrder, MOCompletion.mo_id == ManufacturingOrder.id)
            .outerjoin(WorkOrder, MOCompletion.work_order_id == WorkOrder.id)
            .where(and_(*conditions))
        )

    item_rows = (await db.execute(_base(
        select(
            eff_wc.label("wc_id"),
            ManufacturingOrder.item_id.label("item_id"),
            qty_good.label("qty_good"),
            qty_rej.label("qty_rejected"),
            func.count(MOCompletion.id).label("logs"),
        )
    ).group_by(eff_wc, ManufacturingOrder.item_id))).all()

    wo_rows = (await db.execute(_base(
        select(
            eff_wc.label("wc_id"),
            WorkOrder.id.label("wo_id"),
            WorkOrder.code.label("wo_code"),
            WorkOrder.name.label("wo_name"),
            WorkOrder.status.label("wo_status"),
            WorkOrder.qty.label("wo_qty"),
            ManufacturingOrder.code.label("mo_code"),
            ManufacturingOrder.item_id.label("item_id"),
            qty_good.label("qty_good"),
            qty_rej.label("qty_rejected"),
            func.count(MOCompletion.id).label("logs"),
            func.min(MOCompletion.created_at).label("first_log"),
            func.max(MOCompletion.created_at).label("last_log"),
        )
    ).group_by(
        eff_wc, WorkOrder.id, WorkOrder.code, WorkOrder.name, WorkOrder.status,
        WorkOrder.qty, ManufacturingOrder.code, ManufacturingOrder.item_id,
    ))).all()

    # ── Item names ───────────────────────────────────────────────────────────
    item_ids = {str(r.item_id) for r in item_rows if r.item_id}
    items: dict[str, Item] = {}
    if item_ids:
        res = await db.execute(select(Item).where(Item.id.in_(list(item_ids))))
        items = {str(i.id): i for i in res.scalars().all()}

    def _item_meta(item_id) -> dict:
        it = items.get(str(item_id)) if item_id else None
        return {
            "item_id": str(item_id) if item_id else None,
            "item_code": it.code if it else None,
            "item_name": it.name if it else None,
            "uom": it.uom if it else None,
        }

    # ── Per-machine assembly ─────────────────────────────────────────────────
    machines: dict[str, dict] = {}

    def _machine_bucket(wc_id: str) -> dict:
        key = str(wc_id)
        if key in machines:
            return machines[key]
        wc = idx.by_id.get(key)
        grp = idx.group_of(key)
        typ = idx.type_of(key)
        machines[key] = {
            "work_center_id": key,
            "work_center_code": wc.code if wc else None,
            "work_center_name": wc.name if wc else "(deleted work center)",
            "node_type": _node_type(wc) if wc else "MACHINE",
            "center_type": idx.center_type(key),
            "group_id": str(grp.id) if grp else None,
            "group_name": grp.name if grp else None,
            "type_id": str(typ.id) if typ else None,
            "type_name": typ.name if typ else None,
            "qty_good": 0.0,
            "qty_rejected": 0.0,
            "logs": 0,
            "wo_count": 0,
            "first_log": None,
            "last_log": None,
            "items": [],
            "work_orders": [],
        }
        return machines[key]

    if include_idle:
        in_scope = (
            idx.machines_under(scope_ids[0]) if scope_ids is not None
            else [wc for wc in idx.rows if _node_type(wc) == "MACHINE"]
        )
        for wc in in_scope:
            _machine_bucket(str(wc.id))

    for r in item_rows:
        m = _machine_bucket(str(r.wc_id))
        good, rej = _f(r.qty_good), _f(r.qty_rejected)
        m["qty_good"] += good
        m["qty_rejected"] += rej
        m["logs"] += int(r.logs or 0)
        m["items"].append({
            **_item_meta(r.item_id),
            "qty_good": good,
            "qty_rejected": rej,
            "logs": int(r.logs or 0),
        })

    for r in wo_rows:
        m = _machine_bucket(str(r.wc_id))
        m["wo_count"] += 1
        if r.first_log and (m["first_log"] is None or r.first_log < m["first_log"]):
            m["first_log"] = r.first_log
        if r.last_log and (m["last_log"] is None or r.last_log > m["last_log"]):
            m["last_log"] = r.last_log
        m["work_orders"].append({
            "work_order_id": str(r.wo_id) if r.wo_id else None,
            "wo_code": r.wo_code,
            "wo_name": r.wo_name,
            "wo_status": r.wo_status,
            "wo_qty": _f(r.wo_qty) if r.wo_qty is not None else None,
            "mo_code": r.mo_code,
            **_item_meta(r.item_id),
            "qty_good": _f(r.qty_good),
            "qty_rejected": _f(r.qty_rejected),
            "logs": int(r.logs or 0),
            "first_log": _iso(r.first_log),
            "last_log": _iso(r.last_log),
        })

    for m in machines.values():
        m["items"].sort(key=lambda x: -x["qty_good"])
        m["work_orders"].sort(key=lambda x: (x["last_log"] or ""), reverse=True)
        m["yield_pct"] = _yield_pct(m["qty_good"], m["qty_rejected"])
        m["first_log"] = _iso(m["first_log"])
        m["last_log"] = _iso(m["last_log"])

    machine_rows = sorted(machines.values(), key=lambda m: (-m["qty_good"], m["work_center_name"] or ""))

    # ── Optional roll-up into GROUP (falls back to the TYPE root) ────────────
    if by_group:
        groups: dict[str, dict] = {}
        for m in machine_rows:
            gid = m["group_id"] or m["type_id"] or m["work_center_id"]
            gname = m["group_name"] or m["type_name"] or m["work_center_name"]
            g = groups.get(gid)
            if g is None:
                g = groups[gid] = {
                    "work_center_id": gid,
                    "work_center_code": None,
                    "work_center_name": gname,
                    "node_type": "GROUP" if m["group_id"] else "TYPE",
                    "center_type": m["center_type"],
                    "group_id": None,
                    "group_name": None,
                    "type_id": m["type_id"],
                    "type_name": m["type_name"],
                    "qty_good": 0.0, "qty_rejected": 0.0, "logs": 0, "wo_count": 0,
                    "first_log": None, "last_log": None,
                    "machine_count": 0, "active_machine_count": 0,
                    "items": [], "work_orders": [], "machines": [],
                }
                node = idx.by_id.get(gid)
                g["work_center_code"] = node.code if node else None
            g["qty_good"] += m["qty_good"]
            g["qty_rejected"] += m["qty_rejected"]
            g["logs"] += m["logs"]
            g["wo_count"] += m["wo_count"]
            g["machine_count"] += 1
            if m["logs"]:
                g["active_machine_count"] += 1
            for key in ("first_log", "last_log"):
                pick = min if key == "first_log" else max
                vals = [v for v in (g[key], m[key]) if v]
                g[key] = pick(vals) if vals else None
            g["work_orders"].extend(m["work_orders"])
            g["machines"].append({
                "work_center_id": m["work_center_id"],
                "work_center_code": m["work_center_code"],
                "work_center_name": m["work_center_name"],
                "qty_good": m["qty_good"],
                "qty_rejected": m["qty_rejected"],
                "logs": m["logs"],
                "wo_count": m["wo_count"],
                "yield_pct": m["yield_pct"],
            })
            # Merge the per-item breakdown across the group's machines.
            for it in m["items"]:
                hit = next((x for x in g["items"] if x["item_id"] == it["item_id"]), None)
                if hit is None:
                    g["items"].append(dict(it))
                else:
                    hit["qty_good"] += it["qty_good"]
                    hit["qty_rejected"] += it["qty_rejected"]
                    hit["logs"] += it["logs"]

        for g in groups.values():
            g["items"].sort(key=lambda x: -x["qty_good"])
            g["work_orders"].sort(key=lambda x: (x["last_log"] or ""), reverse=True)
            g["machines"].sort(key=lambda x: -x["qty_good"])
            g["yield_pct"] = _yield_pct(g["qty_good"], g["qty_rejected"])
        rows = sorted(groups.values(), key=lambda g: (-g["qty_good"], g["work_center_name"] or ""))
    else:
        rows = machine_rows

    totals = {
        "qty_good": sum(m["qty_good"] for m in machine_rows),
        "qty_rejected": sum(m["qty_rejected"] for m in machine_rows),
        "logs": sum(m["logs"] for m in machine_rows),
        "wo_count": sum(m["wo_count"] for m in machine_rows),
        "machine_count": len(machine_rows),
        "active_machine_count": sum(1 for m in machine_rows if m["logs"]),
    }
    totals["yield_pct"] = _yield_pct(totals["qty_good"], totals["qty_rejected"])

    return {
        "group_by": "group" if by_group else "machine",
        "start_date": _iso(start_date),
        "end_date": _iso(end_date),
        "work_center_id": str(work_center_id) if work_center_id else None,
        "group_id": str(group_id) if group_id else None,
        "rows": rows,
        "totals": totals,
    }
