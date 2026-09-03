"""An alt-unit packing order is fulfilled when its PIECES are boxed, not its kilos.

`uom2_factor` is a planning estimate off the item's g/y. Elastic cloth does not
weigh what that predicted, and the packer reweighs every box, so `qty_packed` is a
sum of scale readings that drifts with the fabric. Judged in kg, a run that boxed
every ordered piece off lighter-than-estimated cloth never reached DELIVERED.

These cover `packing_service.is_target_met` / `order_alt_target` / `open_qty` — the
one definition the DELIVERED gate, the reopen-on-reject test and quarantine's
open-quantity claim all share — plus the `qty_packed_alt` model property they read.

Fixture-free: none of these touch the database.
"""
from types import SimpleNamespace

from app.models.batch import Batch
from app.models.packing import PackingCompletion, PackingOrder
from app.services import packing_service as ps


def _kg_item(weight=180.0, unit="g/y"):
    """A kg-stocked cloth: 180 g per yard, so 1 Pcs of 5 yard = 0.9 kg."""
    return SimpleNamespace(uom="kg", weight_per_unit=weight, weight_unit=unit)


def _order(**kw) -> PackingOrder:
    """An alt-unit order: 2880 Pcs of 5 yard, 2592 kg by the g/y estimate."""
    defaults = dict(
        code="PCK-TEST", qty_target=2592, qty2=2880, uom2="Pcs",
        uom2_factor=5, uom2_length_uom="yard",
    )
    defaults.update(kw)
    po = PackingOrder(**defaults)
    po.completions = []
    po.cartons = []
    return po


def _carton(alt_qty, quality_status=None) -> Batch:
    return Batch(batch_number="PU-TEST", alt_qty=alt_qty, quality_status=quality_status)


def _packed(po, qty):
    """Set `qty_packed` (a roll-up property) by giving the order one completion.

    A real `PackingCompletion`, not a stand-in: `completions` carries a backref, so
    appending anything without SQLAlchemy instance state raises inside the event.
    """
    po.completions = [PackingCompletion(qty=qty, rejected=False, qty_rejected=0,
                                        package_count=0, package_count_rejected=0)]


# --- counting the pieces ----------------------------------------------------

def test_packed_pieces_are_summed_from_the_cartons():
    po = _order()
    po.cartons = [_carton(12) for _ in range(10)]
    assert po.qty_packed_alt == 120.0


def test_rejected_cartons_do_not_count_as_packed():
    po = _order()
    po.cartons = [_carton(12), _carton(12, "REJECTED"), _carton(12, "REJECT_USABLE")]
    assert po.qty_packed_alt == 12.0


def test_an_order_with_no_alt_unit_has_no_piece_count():
    po = _order(uom2=None, qty2=None, uom2_factor=None)
    assert po.qty_packed_alt is None


# --- the gate ---------------------------------------------------------------

def test_every_piece_boxed_is_fulfilled_even_when_the_kilos_fall_short():
    # THE case this exists for: 240 boxes x 12 Pcs = 2880 pieces, but the cloth ran
    # 3% light so the scales only ever saw 2514 kg against a 2592 kg target.
    po = _order()
    po.cartons = [_carton(12) for _ in range(240)]
    _packed(po, 2514.0)
    assert po.qty_packed_alt == 2880.0
    assert ps.is_target_met(po) is True


def test_short_of_the_ordered_pieces_is_not_fulfilled_even_when_the_kilos_are_there():
    # The mirror: heavy cloth reaches the kg target with pieces still to box. The
    # customer ordered pieces, so the order still owes them.
    po = _order()
    po.cartons = [_carton(12) for _ in range(200)]  # 2400 of 2880
    _packed(po, 2600.0)
    assert ps.is_target_met(po) is False


def test_an_order_with_no_alt_unit_still_falls_back_to_the_kilos():
    po = _order(uom2=None, qty2=None, uom2_factor=None)
    _packed(po, 2592.0)
    assert ps.is_target_met(po) is True
    _packed(po, 2591.0)
    assert ps.is_target_met(po) is False


def test_a_zero_target_is_never_met():
    po = _order(uom2=None, qty2=None, uom2_factor=None, qty_target=0)
    _packed(po, 0.0)
    assert ps.is_target_met(po) is False


# --- what the order is measured against -------------------------------------

def test_the_stated_count_is_what_the_order_is_for():
    assert ps.order_alt_target(_order()) == 2880.0


def test_without_a_stated_count_the_base_target_is_converted():
    # A hand-entered order has only the base target to go on.
    po = _order(qty2=None)
    assert ps.order_alt_target(po, _kg_item()) == 2880.0


def test_no_alt_unit_means_no_alt_target():
    assert ps.order_alt_target(_order(uom2=None)) is None


# --- quarantine's claim on hold stock ---------------------------------------

def test_a_fulfilled_order_stops_claiming_hold_stock():
    # Claimed in kg however the order is counted, but a fulfilled order claims
    # nothing — otherwise the light-cloth order above would hold the bin forever.
    po = _order()
    po.cartons = [_carton(12) for _ in range(240)]
    _packed(po, 2514.0)
    assert ps.open_qty(po) == 0.0


def test_an_unfulfilled_order_claims_what_it_still_owes_in_kg():
    po = _order()
    po.cartons = [_carton(12) for _ in range(100)]
    _packed(po, 1080.0)
    assert ps.open_qty(po) == 2592 - 1080
