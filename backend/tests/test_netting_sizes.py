"""Netting buckets stock by size — an M roll is not XL inventory.

Sizes are a physical difference (67 cm greige cannot be cut for XL) and the
create path already splits component MOs and stamps lots per size, so the
availability ledger must not pool them back together. Before this, a sized
requirement netted against every size's on-hand and the run was planned short.

The generic "" bucket (unsized BOM, raw material, or a lot minted before sizes
were snapshotted) stays substitutable: a sized demand may still draw it, and a
size-agnostic demand may draw anything.

Async services open their own real-DB connection and cannot see an uncommitted
transaction, so rows are committed directly and torn down in a finally.
"""
import asyncio
import uuid as _uuid

import pytest


def _consume(item_id, gross, size_token=""):
    """Run one node through the real Availability ledger; returns (net, detail)."""
    import os

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.services.netting_service import Availability

    url = os.environ["DATABASE_URL"]
    if "+asyncpg" not in url:
        url = url.replace("postgresql+psycopg2://", "postgresql://")
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    async def run():
        engine = create_async_engine(url, poolclass=NullPool)
        try:
            maker = async_sessionmaker(engine, expire_on_commit=False)
            async with maker() as db:
                avail = await Availability.create(db)
                return await avail.consume_detailed(item_id, [], None, gross, size_token=size_token)
        finally:
            await engine.dispose()

    return asyncio.run(run())


def _snapshot(name):
    return {"size_name": name, "label": None, "target_measurement": 67.0,
            "measurement_min": None, "measurement_max": None}


@pytest.fixture
def sized_lots():
    """One item, three piles: 100 kg size M, 40 kg size XL, 10 kg unsized."""
    from app.db.session import SessionLocal
    from app.models.batch import Batch
    from app.models.item import Item
    from app.models.location import Location
    from app.models.stock_balance import StockBalance

    item_id, loc_id = _uuid.uuid4(), _uuid.uuid4()
    m_id, xl_id = _uuid.uuid4(), _uuid.uuid4()
    db = SessionLocal()
    try:
        db.add(Location(id=loc_id, code=f"SZ-LOC-{str(loc_id)[:8]}", name="Size netting test loc"))
        db.add(Item(id=item_id, code=f"SZ-ITEM-{str(item_id)[:8]}", name="Size netting greige", uom="kg"))
        db.flush()
        db.add(Batch(id=m_id, item_id=item_id, batch_number=f"SZ-M-{str(m_id)[:8]}",
                     bom_size_snapshot=_snapshot("M")))
        db.add(Batch(id=xl_id, item_id=item_id, batch_number=f"SZ-XL-{str(xl_id)[:8]}",
                     bom_size_snapshot=_snapshot("XL")))
        db.flush()
        for batch_key, qty in ((str(m_id), 100), (str(xl_id), 40), ("", 10)):
            db.add(StockBalance(item_id=item_id, location_id=loc_id, variant_key="",
                                batch_key=batch_key, qty=qty))
        db.commit()
    finally:
        db.close()

    yield item_id

    db = SessionLocal()
    try:
        db.query(StockBalance).filter(StockBalance.item_id == item_id).delete()
        db.query(Batch).filter(Batch.item_id == item_id).delete()
        db.query(Item).filter(Item.id == item_id).delete()
        db.query(Location).filter(Location.id == loc_id).delete()
        db.commit()
    finally:
        db.close()


def test_sized_demand_ignores_other_sizes(sized_lots):
    """XL demand sees XL (40) + the unsized pool (10), never the 100 kg of M."""
    net, detail = _consume(sized_lots, 200.0, size_token="xl")
    assert detail["on_hand"] == pytest.approx(50.0), (
        f"XL netting saw {detail['on_hand']} on hand — M stock must not count"
    )
    assert net == pytest.approx(150.0)


def test_size_match_is_case_insensitive(sized_lots):
    """Tokens are case-folded: the BOM says 'XL', a snapshot may say 'xl'."""
    _, detail = _consume(sized_lots, 1.0, size_token="XL")
    assert detail["on_hand"] == pytest.approx(50.0)


def test_unsized_demand_can_still_draw_any_size(sized_lots):
    """A size-agnostic node is not stranded — every pile is fair game."""
    net, detail = _consume(sized_lots, 200.0)
    assert detail["on_hand"] == pytest.approx(150.0)
    assert net == pytest.approx(50.0)


def test_unknown_size_falls_back_to_the_unsized_pool_only(sized_lots):
    """A size nothing is stocked at draws the generic pool, not another size."""
    net, detail = _consume(sized_lots, 30.0, size_token="3xl")
    assert detail["on_hand"] == pytest.approx(10.0)
    assert net == pytest.approx(20.0)


# ── shared-pool allocation (the two report surfaces) ─────────────────────────
# /booking-stock and the PR material requirements have no explosion to ride on,
# so they split a pile across size rows with allocate_onhand instead. It has to
# reach the same answer as the ledger and, above all, never hand the same stock
# to two rows — that is how a page promises material twice.

def _alloc(buckets, rows):
    from app.services.netting_service import allocate_onhand
    return allocate_onhand(buckets, rows)


def test_each_size_row_gets_its_own_bucket():
    assert _alloc({"m": 100, "xl": 40}, [("m", 50), ("xl", 50)]) == [100.0, 40.0]


def test_generic_pool_is_handed_out_once_biggest_need_first():
    """10 unsized kg, two short rows: the bigger shortfall takes it, and the
    total handed out never exceeds the pile."""
    out = _alloc({"": 10}, [("m", 4), ("xl", 30)])
    assert out == [0.0, 10.0]
    assert sum(out) == pytest.approx(10.0)


def test_a_pile_is_never_promised_to_two_rows():
    out = _alloc({"m": 20, "": 5}, [("m", 100), ("xl", 100), ("l", 100)])
    assert sum(out) == pytest.approx(25.0), "allocated more than exists"


def test_unsized_row_mops_up_leftover_sized_stock():
    """A size-agnostic requirement may use any pile — matching the ledger's
    draw order — instead of reading short beside stock it can legally take."""
    assert _alloc({"m": 30}, [("", 12)]) == [12.0]
