"""Netting must not hand the same on-hand pile to two sales orders.

Before `stock_reservations`, a root FG requirement covered from stock produced no
MO and therefore left no trace anywhere, so the next order's `Availability` saw
the same physical stock as free and planned short too. These tests pin the four
rules that fix it: reservations reduce net_free, a run never sees its own, a
closed order stops holding, and a drawn-down row only holds the remainder.

Async routes/services open their own real-DB connection and cannot see the
rollback fixture's uncommitted transaction, so rows are committed directly and
torn down in a finally.
"""
import asyncio
import uuid as _uuid

import pytest


def _fresh_ids():
    return _uuid.uuid4(), _uuid.uuid4(), _uuid.uuid4()


def _net_free(item_id, vkey, exclude_pr_id=None):
    """net_free for one (item, variant) through the real Availability ledger.

    Builds a throwaway NullPool engine per call rather than borrowing the app's:
    `asyncio.run` opens a fresh event loop each time, and a pooled asyncpg
    connection created on the app's loop raises "another operation is in
    progress" the moment a second loop touches it.
    """
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
                avail = await Availability.create(db, exclude_pr_id=exclude_pr_id)
                return await avail._net_free(str(item_id), vkey)
        finally:
            await engine.dispose()

    return asyncio.run(run())


@pytest.fixture
def stocked_item():
    """An item with 1000 on hand at a fresh location, committed to the real DB."""
    from app.db.session import SessionLocal
    from app.models.item import Item
    from app.models.location import Location
    from app.models.stock_balance import StockBalance

    item_id, loc_id, _ = _fresh_ids()
    db = SessionLocal()
    try:
        db.add(Location(id=loc_id, code=f"RESV-LOC-{str(loc_id)[:8]}", name="Reservation test loc"))
        db.add(Item(id=item_id, code=f"RESV-ITEM-{str(item_id)[:8]}", name="Reservation test FG", uom="kg"))
        db.flush()
        db.add(StockBalance(item_id=item_id, location_id=loc_id, variant_key="", batch_key="", qty=1000))
        db.commit()
    finally:
        db.close()

    yield item_id, loc_id

    db = SessionLocal()
    try:
        db.query(StockBalance).filter(StockBalance.item_id == item_id).delete()
        db.query(Item).filter(Item.id == item_id).delete()
        db.query(Location).filter(Location.id == loc_id).delete()
        db.commit()
    finally:
        db.close()


def _make_so(db, status="PENDING"):
    from app.models.sales import SalesOrder
    so_id = _uuid.uuid4()
    db.add(SalesOrder(
        id=so_id,
        po_number=f"RESV-SO-{str(so_id)[:8]}",
        customer_name="Reservation test customer",
        status=status,
    ))
    return so_id


def test_reservation_removes_stock_from_the_free_pool(stocked_item):
    """The core rule: a reservation is subtracted from net_free like MO demand.

    Without it the second sales order plans against stock the first already took.
    """
    from app.db.session import SessionLocal
    from app.models.reservation import StockReservation
    from app.models.sales import SalesOrder

    item_id, _ = stocked_item
    before = _net_free(item_id, "")
    assert before == pytest.approx(1000.0), "fixture stock is not visible to netting"

    db = SessionLocal()
    so_id = None
    try:
        so_id = _make_so(db)
        db.flush()
        db.add(StockReservation(sales_order_id=so_id, item_id=item_id, variant_key="", qty=400))
        db.commit()

        after = _net_free(item_id, "")
        assert after == pytest.approx(600.0), (
            f"reservation not netted: {before} -> {after}, expected 600"
        )
    finally:
        db.query(StockReservation).filter(StockReservation.item_id == item_id).delete()
        if so_id:
            db.query(SalesOrder).filter(SalesOrder.id == so_id).delete()
        db.commit()
        db.close()


def test_a_run_does_not_net_against_its_own_reservation(stocked_item):
    """`exclude_pr_id` must drop the run's own rows.

    Re-previewing or re-netting a PR would otherwise see its own reservation as a
    third party's claim and shrink the free pool on every pass.
    """
    from app.db.session import SessionLocal
    from app.models.production_run import ProductionRun
    from app.models.reservation import StockReservation
    from app.models.sales import SalesOrder

    item_id, _ = stocked_item
    db = SessionLocal()
    so_id = pr_id = None
    try:
        so_id = _make_so(db)
        pr_id = _uuid.uuid4()
        db.add(ProductionRun(id=pr_id, code=f"RESV-PR-{str(pr_id)[:8]}", sales_order_id=so_id))
        db.flush()
        db.add(StockReservation(
            sales_order_id=so_id, production_run_id=pr_id,
            item_id=item_id, variant_key="", qty=400,
        ))
        db.commit()

        assert _net_free(item_id, "") == pytest.approx(600.0)
        assert _net_free(item_id, "", exclude_pr_id=pr_id) == pytest.approx(1000.0), (
            "the run's own reservation was counted against it"
        )
    finally:
        db.query(StockReservation).filter(StockReservation.item_id == item_id).delete()
        if pr_id:
            db.query(ProductionRun).filter(ProductionRun.id == pr_id).delete()
        if so_id:
            db.query(SalesOrder).filter(SalesOrder.id == so_id).delete()
        db.commit()
        db.close()


@pytest.mark.parametrize("so_status", ["SENT", "DELIVERED", "CANCELLED"])
def test_closed_sales_order_releases_its_hold(stocked_item, so_status):
    """A row left ACTIVE on a closed order must never strand stock.

    This is the safety net for the release write never running — the status join
    is what makes a stale reservation harmless rather than permanent.
    """
    from app.db.session import SessionLocal
    from app.models.reservation import StockReservation
    from app.models.sales import SalesOrder

    item_id, _ = stocked_item
    db = SessionLocal()
    so_id = None
    try:
        so_id = _make_so(db, status=so_status)
        db.flush()
        db.add(StockReservation(sales_order_id=so_id, item_id=item_id, variant_key="", qty=400))
        db.commit()

        assert _net_free(item_id, "") == pytest.approx(1000.0), (
            f"a {so_status} order still held its reservation"
        )
    finally:
        db.query(StockReservation).filter(StockReservation.item_id == item_id).delete()
        if so_id:
            db.query(SalesOrder).filter(SalesOrder.id == so_id).delete()
        db.commit()
        db.close()


def test_partially_shipped_reservation_holds_only_the_remainder(stocked_item):
    """`qty_released` is drawn down at goods issue, when the stock physically left.

    Holding the full qty after a partial dispatch would subtract the shipped part
    twice — once as gone-from-on-hand, once as still-reserved.
    """
    from app.db.session import SessionLocal
    from app.models.reservation import StockReservation
    from app.models.sales import SalesOrder

    item_id, _ = stocked_item
    db = SessionLocal()
    so_id = None
    try:
        so_id = _make_so(db)
        db.flush()
        db.add(StockReservation(
            sales_order_id=so_id, item_id=item_id, variant_key="",
            qty=400, qty_released=250,
        ))
        db.commit()

        # 1000 on hand - 150 still held. (The shipped 250 would also be gone from
        # on-hand in a real dispatch; the fixture stock is static on purpose so
        # this asserts the reservation half in isolation.)
        assert _net_free(item_id, "") == pytest.approx(850.0)
    finally:
        db.query(StockReservation).filter(StockReservation.item_id == item_id).delete()
        if so_id:
            db.query(SalesOrder).filter(SalesOrder.id == so_id).delete()
        db.commit()
        db.close()


def test_two_orders_cannot_both_plan_against_one_pile(stocked_item):
    """The regression this table exists for, stated end to end.

    Order A takes 700 of 1000. Order B must see 300 — not 1000.
    """
    from app.db.session import SessionLocal
    from app.models.reservation import StockReservation
    from app.models.sales import SalesOrder

    item_id, _ = stocked_item
    db = SessionLocal()
    so_a = so_b = None
    try:
        so_a, so_b = _make_so(db), _make_so(db)
        db.flush()
        db.add(StockReservation(sales_order_id=so_a, item_id=item_id, variant_key="", qty=700))
        db.commit()

        free_for_b = _net_free(item_id, "")
        assert free_for_b == pytest.approx(300.0), (
            f"order B saw {free_for_b} free; order A already holds 700 of the 1000"
        )
    finally:
        db.query(StockReservation).filter(StockReservation.item_id == item_id).delete()
        for sid in (so_a, so_b):
            if sid:
                db.query(SalesOrder).filter(SalesOrder.id == sid).delete()
        db.commit()
        db.close()
