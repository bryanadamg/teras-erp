"""SO fulfilment must compare like with like: `SalesOrderLine.qty` is authored in
yards, every fulfilment number is in the item's stock UoM.

Regression for the reported bug: an 11 kg dispatch against a line ordered as
10 000 yd of a kg-stocked item rendered as "11 / 10000" (0.1%) and the order
could never leave PENDING, when 10 000 yd of that cloth *is* 10 kg — i.e. the
line was over-shipped.
"""

from types import SimpleNamespace

from app.services import so_fulfilment_service as sf


def _line(line_id, qty):
    return SimpleNamespace(id=line_id, qty=qty)


def _stat(ordered_base, **kw):
    row = dict(sf._ZERO)
    row["ordered_base"] = ordered_base
    row.update(kw)
    return row


# --- the pure resolver ------------------------------------------------------

def test_weight_stocked_line_uses_the_operator_blessed_kg():
    # 10 000 yd of 1 g/y cloth, weighed by the SO form as 10 kg.
    assert sf.ordered_qty_in_stock_uom(10000, "kg", qty_kg=10) == 10.0


def test_weight_stocked_line_falls_back_to_item_weight_per_yard():
    # No qty_kg on the row (legacy import): derive it the way the form would.
    got = sf.ordered_qty_in_stock_uom(
        10080, "kg", qty_kg=None, weight_per_unit=20.66, weight_unit="g/y"
    )
    assert round(got, 3) == 208.253


def test_gram_per_meter_items_convert_through_yards_to_meters():
    got = sf.ordered_qty_in_stock_uom(
        1000, "kg", qty_kg=None, weight_per_unit=100, weight_unit="g/m"
    )
    assert round(got, 4) == 91.44


def test_unknowable_weight_is_none_not_zero_and_not_the_raw_yards():
    # Item stocked in kg but carrying no weight-per-yard: there is no honest
    # denominator. Returning the raw yards would resurrect the bug; 0 would
    # divide by zero and read as instantly complete.
    assert sf.ordered_qty_in_stock_uom(10000, "kg") is None


def test_length_and_piece_stocked_lines_pass_the_qty_through():
    assert sf.ordered_qty_in_stock_uom(500, "yard", qty_kg=12) == 500.0
    assert sf.ordered_qty_in_stock_uom(500, "pcs") == 500.0
    assert sf.ordered_qty_in_stock_uom(500, "Pcs") == 500.0  # casing is free-text


def test_meter_stocked_lines_convert_from_yards():
    assert round(sf.ordered_qty_in_stock_uom(1000, "m"), 4) == 914.4


def test_zero_qty_line_stays_trivially_satisfied():
    # A degenerate 0-qty line must not become an unsatisfiable None and pin the
    # whole order out of SENT.
    assert sf.ordered_qty_in_stock_uom(0, "kg") == 0.0


# --- status derivation ------------------------------------------------------

def test_over_dispatched_kg_line_reads_sent_not_pending():
    """The reported case: 11 kg shipped against 10 000 yd (= 10 kg) ordered."""
    lines = [_line("l1", 10000)]
    fulfilment = {"l1": _stat(10.0, made=10.0, packed=11.0, packed_available=0.0, dispatched=11.0)}
    assert sf.derive_status(lines, fulfilment) == "SENT"


def test_partially_dispatched_kg_line_reads_partial():
    lines = [_line("l1", 10000)]
    fulfilment = {"l1": _stat(10.0, made=10.0, packed=4.0, packed_available=0.0, dispatched=4.0)}
    assert sf.derive_status(lines, fulfilment) == "PARTIAL"


def test_fully_packed_kg_line_reads_ready():
    lines = [_line("l1", 10000)]
    fulfilment = {"l1": _stat(10.0, made=10.0, packed=10.0, packed_available=10.0)}
    assert sf.derive_status(lines, fulfilment) == "READY"


def test_yard_stocked_line_still_measured_against_its_yards():
    lines = [_line("l1", 500)]
    fulfilment = {"l1": _stat(500.0, made=500.0, packed=500.0, packed_available=500.0)}
    assert sf.derive_status(lines, fulfilment) == "READY"
    short = {"l1": _stat(500.0, made=500.0, packed=10.0, packed_available=10.0)}
    assert sf.derive_status(lines, short) == "PENDING"


def test_line_with_no_derivable_target_never_claims_completion():
    lines = [_line("l1", 10000)]
    fulfilment = {"l1": _stat(None, made=10.0, packed=10.0, packed_available=10.0)}
    assert sf.derive_status(lines, fulfilment) == "PENDING"


def test_multi_line_order_needs_every_line_dispatched():
    lines = [_line("l1", 10000), _line("l2", 10000)]
    fulfilment = {
        "l1": _stat(10.0, dispatched=10.0),
        "l2": _stat(10.0, dispatched=3.0),
    }
    assert sf.derive_status(lines, fulfilment) == "PARTIAL"
