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
