"""Packing orders count in the sales order's alt selling unit.

The customer orders in Pic (a roll) or Pcs (a cut piece) while the item is
stocked in kg or yard, so a packing order carries the alt unit alongside a
`qty_target` that stays in the item's own UOM. These cover the create-path
derivation in `api/packing._apply_alt_unit`; the conversion itself is covered in
test_packing_service.py.

Deliberately fixture-free: `_apply_alt_unit` only touches the database to resolve
the factor's unit off the UOM master, so stating `uom2_length_uom` makes the whole
path pure. The `client` fixture boots the app once per test, and none of that is
needed to check arithmetic.
"""
import asyncio
from types import SimpleNamespace

import pytest

from app.api import packing as papi
from app.models.packing import PackingOrder
from app.schemas import PackingOrderCreate

ITEM_ID = "00000000-0000-0000-0000-000000000001"


def _kg_item(weight=180.0, unit="g/y"):
    """A kg-stocked cloth: 180 g per yard."""
    return SimpleNamespace(uom="kg", weight_per_unit=weight, weight_unit=unit)


def _yard_item():
    return SimpleNamespace(uom="yard", weight_per_unit=None, weight_unit=None)


def _apply(payload, item, po=None):
    po = po or PackingOrder(code="PCK-TEST", qty_target=payload.qty_target or 0)
    asyncio.run(papi._apply_alt_unit(None, po, payload, item=item))
    return po


def _payload(**kw):
    kw.setdefault("item_id", ITEM_ID)
    kw.setdefault("qty_target", 0)
    return PackingOrderCreate(**kw)


# --- deriving the base target ----------------------------------------------

def test_alt_count_derives_the_base_target_for_a_kg_item():
    # 2880 Pcs x 5 yard x 180 g/y = 2592 kg of bulk to pack.
    po = _apply(
        _payload(qty2=2880, uom2="Pcs", uom2_factor=5, uom2_length_uom="yard"),
        _kg_item(),
    )
    assert float(po.qty_target) == 2592.0
    assert po.uom2 == "Pcs"
    assert float(po.uom2_factor) == 5
    assert po.uom2_length_uom == "yard"


def test_alt_count_derives_the_base_target_for_a_length_item():
    po = _apply(
        _payload(qty2=100, uom2="Roll", uom2_factor=144, uom2_length_uom="yard"),
        _yard_item(),
    )
    assert float(po.qty_target) == 14400.0


def test_a_factor_already_in_the_stock_unit_is_taken_as_it_stands():
    # The seeded UOM master carries `1 Box = 10 kg` next to `1 Pic = 50 m`, and a
    # weight factor must not be read as a length.
    po = _apply(
        _payload(qty2=20, uom2="Box", uom2_factor=10, uom2_length_uom="kg"),
        _kg_item(),
    )
    assert float(po.qty_target) == 200.0


def test_the_alt_count_wins_over_a_stated_base_target():
    # The count is what the order is FOR; the base figure is only its weight
    # estimate, so a stated one is restated rather than kept. 2600 kg beside
    # 2880 Pcs is a planner's rounding at best and the piece count typed into
    # the wrong field at worst — either way the pieces decide.
    po = _apply(
        _payload(qty_target=2600, qty2=2880, uom2="Pcs", uom2_factor=5, uom2_length_uom="yard"),
        _kg_item(),
    )
    assert float(po.qty_target) == 2592.0
    assert float(po.qty2) == 2880


def test_editing_only_the_alt_count_moves_the_target():
    # The update path: restating the count alone means the target follows it.
    po = PackingOrder(code="PCK-TEST", qty_target=2592, qty2=2880, uom2="Pcs",
                      uom2_factor=5, uom2_length_uom="yard")
    _apply(
        _payload(qty2=1440, uom2="Pcs", uom2_factor=5, uom2_length_uom="yard"),
        _kg_item(), po=po,
    )
    assert float(po.qty_target) == 1296.0


def test_an_unconvertible_unit_is_refused_rather_than_guessed():
    # gsm needs the fabric width, so there is no honest kg figure to derive — a
    # 400 beats a silently wrong target.
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        _apply(
            _payload(qty2=2880, uom2="Pcs", uom2_factor=5, uom2_length_uom="yard"),
            _kg_item(weight=180.0, unit="gsm"),
        )
    assert e.value.status_code == 400
    assert "Pcs" in e.value.detail


# --- inheriting from the sales order line -----------------------------------

def test_the_alt_unit_is_snapshotted_from_the_ordered_line():
    # Packing follows the sales order: state nothing and the line's own unit is
    # copied, so the packer counts in whatever the customer ordered in.
    line = SimpleNamespace(uom2="Pic", uom2_factor=50, qty2=None)
    po = PackingOrder(code="PCK-TEST", qty_target=1000)
    asyncio.run(papi._apply_alt_unit(
        None, po, _payload(qty_target=1000, uom2_length_uom="m"),
        so_line=line, item=_kg_item(),
    ))
    assert po.uom2 == "Pic"
    assert float(po.uom2_factor) == 50


# --- a base target beside a count is only its estimate ----------------------
#
# `qty_target` and `qty2` are the same quantity in two units, and the COUNT is the
# authoritative one: the customer ordered pieces, the packer boxes pieces, and the
# kilos are read off the scale at each pack event. So a base target stated beside a
# count is silently restated from it rather than trusted. That also disposes of the
# unit mix-ups this used to refuse — the pack form prefilling the target from
# `SalesOrderLine.qty` (authored in YARDS), or a planner typing the piece count
# into the kg field, both of which used to reach the DB as an order 5x its size.

def test_a_target_holding_the_yard_total_is_restated_from_the_count():
    po = _apply(
        # 14400 is the YARD total (2880 x 5), handed over as if it were kg.
        _payload(qty_target=14400, qty2=2880, uom2="Pcs", uom2_factor=5,
                 uom2_length_uom="yard"),
        _kg_item(),
    )
    assert float(po.qty_target) == 2592.0


def test_a_metre_total_read_as_yards_is_restated_from_the_count():
    # The narrowest of these mismatches: 9.4%, well inside the range that reads
    # as a plausible figure.
    po = _apply(
        _payload(qty_target=15748, qty2=100, uom2="Roll", uom2_factor=144,
                 uom2_length_uom="yard"),
        _yard_item(),
    )
    assert float(po.qty_target) == 14400.0


def test_the_piece_count_typed_into_the_base_field_is_corrected():
    # The reported case: 50 Pcs of a cloth at 5 yard x 180 g/y is 45 kg, and both
    # fields read 50 because the planner typed the count twice.
    po = _apply(
        _payload(qty_target=50, qty2=50, uom2="Pcs", uom2_factor=5, uom2_length_uom="yard"),
        _kg_item(),
    )
    assert float(po.qty_target) == 45.0


def test_a_target_with_no_alt_count_is_left_alone():
    po = _apply(_payload(qty_target=14400, uom2="Pcs", uom2_factor=5,
                         uom2_length_uom="yard"), _kg_item())
    assert float(po.qty_target) == 14400.0


def test_an_unresolvable_conversion_leaves_a_stated_target_alone():
    # gsm needs the fabric width, so there is no honest figure to restate the
    # target as — the planner's own is kept rather than refused on a guess.
    po = _apply(
        _payload(qty_target=14400, qty2=2880, uom2="Pcs", uom2_factor=5,
                 uom2_length_uom="yard"),
        _kg_item(unit="gsm"),
    )
    assert float(po.qty_target) == 14400.0


def test_the_ordered_qty_a_packing_order_falls_back_to_is_in_the_stock_uom():
    # What the create path uses when the caller states no quantity at all. The
    # line's own qty_kg wins over re-deriving from the yards.
    from app.services import so_fulfilment_service as sofs

    assert sofs.ordered_qty_in_stock_uom(
        14400, "kg", qty_kg=2592, weight_per_unit=180, weight_unit="g/y",
    ) == 2592.0
    # No qty_kg on the row: re-derived through the item's g/y, never left as yards.
    assert sofs.ordered_qty_in_stock_uom(
        14400, "kg", qty_kg=None, weight_per_unit=180, weight_unit="g/y",
    ) == 2592.0


def test_a_stated_alt_unit_beats_the_line_it_packs():
    # An explicit pick is the planner's decision and must not be overwritten by
    # the line — this is also what keeps an SO edited mid-run from re-scaling an
    # order already being packed.
    line = SimpleNamespace(uom2="Pic", uom2_factor=50, qty2=None)
    po = PackingOrder(code="PCK-TEST", qty_target=1000)
    asyncio.run(papi._apply_alt_unit(
        None, po, _payload(qty_target=1000, uom2="Roll", uom2_factor=144,
                           uom2_length_uom="yard"),
        so_line=line, item=_yard_item(),
    ))
    assert po.uom2 == "Roll"
    assert float(po.uom2_factor) == 144
