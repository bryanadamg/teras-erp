"""Work-center tree walks (TYPE -> GROUP -> MACHINE).

The tree is a self-FK on `work_centers.parent_id` with an explicit `node_type`
discriminator, and the GROUP tier is optional — so nothing may assume a fixed
depth. Every "everything under this node" question goes through the recursive CTE
here instead of a one-hop `parent_id ==` filter, which silently stopped working
the moment a third level existed.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.routing import WorkCenter

NODE_TYPES = ("TYPE", "GROUP", "MACHINE")


def _descendants_cte(root_id):
    """Recursive CTE over every node below root_id (root itself excluded)."""
    wc = WorkCenter.__table__
    cte = (
        select(wc.c.id, wc.c.node_type, wc.c.parent_id)
        .where(wc.c.parent_id == root_id)
        .cte("wc_descendants", recursive=True)
    )
    child = wc.alias("wc_child")
    return cte.union_all(
        select(child.c.id, child.c.node_type, child.c.parent_id)
        .where(child.c.parent_id == cte.c.id)
    )


def _descendants_query(root_id, machines_only: bool):
    cte = _descendants_cte(root_id)
    q = select(cte.c.id)
    if machines_only:
        q = q.where(cte.c.node_type == "MACHINE")
    return q


async def descendant_ids(db: AsyncSession, root_id, machines_only: bool = False) -> list:
    res = await db.execute(_descendants_query(root_id, machines_only))
    return [r[0] for r in res.all()]


def descendant_ids_sync(db: Session, root_id, machines_only: bool = False) -> list:
    return [r[0] for r in db.execute(_descendants_query(root_id, machines_only)).all()]


def subtree_ids_query(root_id, machines_only: bool = False):
    """Scalar subquery of descendant ids — for use inside a larger filter."""
    return _descendants_query(root_id, machines_only).scalar_subquery()


async def ancestors(db: AsyncSession, wc_id) -> list[WorkCenter]:
    """Ancestor chain, nearest parent first, up to the TYPE root."""
    chain: list[WorkCenter] = []
    seen = {str(wc_id)}
    current = (await db.execute(select(WorkCenter).where(WorkCenter.id == wc_id))).scalars().first()
    while current is not None and current.parent_id is not None:
        if str(current.parent_id) in seen:  # cycle guard
            break
        seen.add(str(current.parent_id))
        parent = (await db.execute(select(WorkCenter).where(WorkCenter.id == current.parent_id))).scalars().first()
        if parent is None:
            break
        chain.append(parent)
        current = parent
    return chain


async def group_of(db: AsyncSession, wc: WorkCenter) -> Optional[WorkCenter]:
    """The GROUP a machine belongs to, or None when it hangs straight off a TYPE."""
    for a in await ancestors(db, wc.id):
        if (a.node_type or "").upper() == "GROUP":
            return a
    return None


# --- Input/output location inheritance -------------------------------------
# Staging areas are a property of the *area*, not of each machine: every loom in
# a hall feeds from the same supply bin. So a machine's input/output location is
# its own value when set, otherwise the nearest ancestor's (GROUP, then TYPE).
# Nothing reads WorkCenter.input_location_id/output_location_id raw — the column
# only holds an override, and a blank machine is normal, not misconfigured.

_LOC_COLS = (
    WorkCenter.id,
    WorkCenter.parent_id,
    WorkCenter.input_location_id,
    WorkCenter.output_location_id,
)


def _to_loc_map(rows) -> dict:
    return {str(r[0]): (r[1], r[2], r[3]) for r in rows}


async def location_map(db: AsyncSession) -> dict:
    """One-shot {wc_id: (parent_id, input_id, output_id)} for resolving inherited
    locations without a query per tree level. work_centers is a small master table."""
    res = await db.execute(select(*_LOC_COLS))
    return _to_loc_map(res.all())


def location_map_sync(db: Session) -> dict:
    return _to_loc_map(db.execute(select(*_LOC_COLS)).all())


def resolve_locations_from_map(loc_map: dict, wc_id) -> tuple:
    """(input_location_id, output_location_id) — own value first, then walk up.
    The two fields resolve independently: a machine may override only its output."""
    in_id = out_id = None
    src_in = src_out = None
    seen: set[str] = set()
    cur = wc_id
    while cur is not None and str(cur) not in seen:
        seen.add(str(cur))
        row = loc_map.get(str(cur))
        if row is None:
            break
        parent_id, own_in, own_out = row
        if in_id is None and own_in is not None:
            in_id, src_in = own_in, cur
        if out_id is None and own_out is not None:
            out_id, src_out = own_out, cur
        if in_id is not None and out_id is not None:
            break
        cur = parent_id
    return in_id, out_id, src_in, src_out


async def resolve_locations(db: AsyncSession, wc_id, loc_map: dict | None = None) -> tuple:
    """Effective (input_location_id, output_location_id) for a work center.
    Pass a cached `loc_map` when resolving many centers in one request."""
    lm = loc_map if loc_map is not None else await location_map(db)
    in_id, out_id, _, _ = resolve_locations_from_map(lm, wc_id)
    return in_id, out_id


def resolve_locations_sync(db: Session, wc_id, loc_map: dict | None = None) -> tuple:
    lm = loc_map if loc_map is not None else location_map_sync(db)
    in_id, out_id, _, _ = resolve_locations_from_map(lm, wc_id)
    return in_id, out_id


def decorate_effective_locations(wcs, loc_map: dict) -> None:
    """Stamp effective_* / *_inherited onto WorkCenter instances for the API
    response, so the UI can show a blank machine's inherited area."""
    for wc in wcs:
        in_id, out_id, src_in, src_out = resolve_locations_from_map(loc_map, wc.id)
        wc.effective_input_location_id = in_id
        wc.effective_output_location_id = out_id
        wc.input_location_inherited = in_id is not None and str(src_in) != str(wc.id)
        wc.output_location_inherited = out_id is not None and str(src_out) != str(wc.id)
