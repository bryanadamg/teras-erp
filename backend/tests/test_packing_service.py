import pytest

from app.services import packing_service
from app.services.packing_service import (
    Carton as C,
    allocate_boxes_to_lots,
    describe_box_breakdown,
    split_qty,
)


def test_split_qty_fixed_box_size_with_remainder():
    # 28kg total at a 5kg box size -> five 5kg boxes plus one 3kg remainder box
    assert split_qty(28, 5) == [5, 5, 5, 5, 5, 3]


def test_split_qty_fixed_box_size_evenly_divisible():
    # 25kg at a 5kg box size divides exactly -> no phantom empty remainder box
    assert split_qty(25, 5) == [5, 5, 5, 5, 5]


def test_split_qty_total_smaller_than_box_size():
    # Less product than one box -> a single box holding all of it
    assert split_qty(3, 5) == [3]


def test_split_qty_no_box_size_falls_back_to_single_box():
    # box_size <= 0 (no pack_size configured) -> everything in one box
    assert split_qty(12.5, 0) == [12.5]


def test_describe_box_breakdown_groups_by_size_largest_first():
    assert describe_box_breakdown([5, 5, 5, 5, 5, 3]) == "5 × 5 + 1 × 3"


def test_describe_box_breakdown_single_group():
    assert describe_box_breakdown([5, 5, 5, 5, 5]) == "5 × 5"


def qtys(allocated):
    """Keep only each carton's base qty."""
    return [[c.qty for c in lot] for lot in allocated]


def test_allocate_boxes_to_lots_fits_within_one_lot():
    # All boxes fit inside the first (only) lot -> no splitting needed
    assert qtys(allocate_boxes_to_lots([28], [5, 5, 5, 5, 5, 3])) == [[5, 5, 5, 5, 5, 3]]


def test_allocate_boxes_to_lots_box_straddles_lot_boundary():
    # Lot 1 has 8kg, lot 2 has 20kg. Boxes are [5,5,5,5,5,3].
    # Lot 1 takes a full 5kg box, then only 3kg of the next 5kg box (2kg carries
    # over into lot 2 as its own carton) -- a box never spans two lots physically.
    assert qtys(allocate_boxes_to_lots([8, 20], [5, 5, 5, 5, 5, 3])) == [
        [5, 3],
        [2, 5, 5, 5, 3],
    ]


def test_allocate_boxes_to_lots_mismatched_total_raises():
    with pytest.raises(ValueError):
        allocate_boxes_to_lots([28], [5, 5, 5])


def test_allocate_boxes_to_lots_no_weights_gives_none():
    assert allocate_boxes_to_lots([10], [5, 5]) == [[C(5, None), C(5, None)]]


def test_allocate_boxes_to_lots_carries_weights_positionally():
    assert allocate_boxes_to_lots([10], [5, 5], weights=[6.19, 6.2]) == [
        [C(5, 6.19), C(5, 6.2)],
    ]


def test_allocate_boxes_to_lots_splits_weight_pro_rata_at_lot_seam():
    # The 5kg box straddles the seam: 3kg stays in lot 1, 2kg carries into lot 2.
    # Its 10kg scale reading is shared 6/4 by qty, because the physical carton
    # became two cartons and neither one weighs the original 10.
    assert allocate_boxes_to_lots([8, 2], [5, 5], weights=[8.0, 10.0]) == [
        [C(5, 8.0), C(3, 6.0)],
        [C(2, 4.0)],
    ]


def test_allocate_boxes_to_lots_partial_weights_leave_others_none():
    assert allocate_boxes_to_lots([10], [5, 5], weights=[6.19, None]) == [
        [C(5, 6.19), C(5, None)],
    ]


# --- assert_all_weighed ------------------------------------------------------
# Packing is logged after the boxes are packed and weighed, so an unweighed
# carton is a missing measurement, not one still to come — and it would print a
# label with a blank N.W. line.

def test_assert_all_weighed_passes_when_every_carton_is_weighed():
    packing_service.assert_all_weighed([C(5.0, 4.8), C(3.0, 2.9)])


def test_assert_all_weighed_rejects_a_missing_weight():
    with pytest.raises(ValueError) as e:
        packing_service.assert_all_weighed([C(5.0, 4.8), C(3.0, None)], "Carton")
    assert "1 of 2 not weighed" in str(e.value)
    assert "carton" in str(e.value)


def test_assert_all_weighed_rejects_a_zero_weight():
    # A zero on the scale is a skipped weighing, not a weightless box.
    with pytest.raises(ValueError):
        packing_service.assert_all_weighed([C(5.0, 0)])


def test_assert_all_weighed_counts_every_missing_carton():
    with pytest.raises(ValueError) as e:
        packing_service.assert_all_weighed([C(1.0, None), C(1.0, None), C(1.0, 0.9)])
    assert "2 of 3 not weighed" in str(e.value)


# --- derive_weights_from_qty -------------------------------------------------
# A kg item's carton qty IS its net weight: one measurement, so the pack screens
# show one input and CONTENT / N.W. on the label can never contradict.

def test_uom_is_kg_matches_the_seeded_spellings():
    assert packing_service.uom_is_kg("kg")
    assert packing_service.uom_is_kg(" KG ")
    assert packing_service.uom_is_kg("Kilograms")
    assert not packing_service.uom_is_kg("pcs")
    assert not packing_service.uom_is_kg("yard")
    assert not packing_service.uom_is_kg(None)


def test_derive_weights_from_qty_fills_kg_cartons():
    assert packing_service.derive_weights_from_qty([C(5.0, None), C(3.0, None)], "kg") == [
        C(5.0, 5.0), C(3.0, 3.0),
    ]


def test_derive_weights_from_qty_overrides_a_contradicting_weight():
    # Same carton cannot weigh two things — the qty is the measurement.
    assert packing_service.derive_weights_from_qty([C(5.0, 4.2)], "kg") == [C(5.0, 5.0)]


def test_derive_weights_from_qty_leaves_a_counted_uom_alone():
    rows = [C(12.0, 6.19), C(4.0, None)]
    assert packing_service.derive_weights_from_qty(rows, "pcs") == rows


def test_derived_kg_weights_satisfy_the_weight_gate():
    packing_service.assert_all_weighed(
        packing_service.derive_weights_from_qty([C(5.0, None)], "kg")
    )


# --- alt (selling) unit conversion ------------------------------------------
# The customer counts in Pic (a roll) or Pcs (a cut piece); the item may be
# stocked in kg. That is two hops — alt -> length -> stock UOM — and it lives in
# one place so a pack screen, a label and the API can't each derive it their own
# way. `uom2_factor` means length per one alt unit, exactly as on the SO line.

def test_base_per_alt_length_item_is_the_factor_itself():
    # Item stocked in yard, 1 Pcs = 5 yard -> 5 yard per Pcs, no weight needed.
    assert packing_service.base_per_alt(5, "Yard", "Yard") == 5


def test_base_per_alt_converts_between_yard_and_meter():
    # Factor stated in metres, item stocked in yard.
    assert packing_service.base_per_alt(5, "m", "Yard") == pytest.approx(5.468066, abs=1e-5)
    assert packing_service.base_per_alt(5, "Yard", "m") == pytest.approx(4.572, abs=1e-5)


def test_base_per_alt_kg_item_goes_through_the_item_weight():
    # 1 Pcs = 5 yard at 180 g/y -> 0.9 kg per Pcs.
    assert packing_service.base_per_alt(5, "Yard", "kg", 180, "g/y") == 0.9


def test_base_per_alt_kg_item_converts_the_length_to_the_weight_basis():
    # Factor in yard but the weight is per metre — convert the length first.
    assert packing_service.base_per_alt(5, "Yard", "kg", 180, "g/m") == pytest.approx(0.822960, abs=1e-6)


def test_base_per_alt_refuses_gsm_which_needs_a_width():
    # g/m² can't turn a length into a weight without the fabric width, so it
    # returns None rather than a figure wrong by the width — same refusal the
    # sales order form's own kg auto-calc makes.
    assert packing_service.base_per_alt(5, "Yard", "kg", 180, "gsm") is None
    assert packing_service.base_per_alt(5, "Yard", "kg", 180, "g/m²") is None


def test_base_per_alt_needs_a_weight_for_a_kg_item():
    assert packing_service.base_per_alt(5, "Yard", "kg", None, "g/y") is None
    assert packing_service.base_per_alt(5, "Yard", "kg", 0, "g/y") is None


def test_base_per_alt_returns_none_for_a_counted_base_uom():
    # Nothing here can establish that one Pic equals one 'pcs' of stock.
    assert packing_service.base_per_alt(5, "Yard", "pcs") is None


def test_base_per_alt_defaults_a_missing_length_unit_to_yard():
    # Legacy SO factors were all entered against yard, which is also the SO
    # view's own fallback — so an unresolved unit must not become a None factor.
    assert packing_service.base_per_alt(5, None, "Yard") == 5


def test_base_per_alt_rejects_a_zero_or_missing_factor():
    assert packing_service.base_per_alt(0, "Yard", "Yard") is None
    assert packing_service.base_per_alt(None, "Yard", "Yard") is None


def test_alt_to_base_scales_the_target():
    # 2880 Pcs at 0.9 kg per Pcs -> 2592 kg of bulk to pack.
    assert packing_service.alt_to_base(2880, 0.9) == 2592
    assert packing_service.alt_to_base(2880, None) is None


def test_base_to_alt_snaps_a_scale_reading_to_a_whole_count():
    # A box holding 12 Pcs weighs 10.62kg against a theoretical 10.80 -> 11.8
    # pieces. A label must not print 11.8 of a discrete thing.
    assert packing_service.base_to_alt(10.62, 0.9) == 12


def test_base_to_alt_keeps_a_genuinely_fractional_count():
    # 5.76 / 0.9 = 6.4 — too far off a whole count to be rounding noise, so the
    # real figure survives instead of being flattened to 6.
    assert packing_service.base_to_alt(5.76, 0.9) == 6.4


def test_base_to_alt_can_be_asked_not_to_snap():
    assert packing_service.base_to_alt(10.62, 0.9, snap=False) == 11.8


# --- alt counts through the carton split ------------------------------------

def test_allocate_carries_alt_counts_positionally():
    assert allocate_boxes_to_lots([10], [5, 5], weights=[5, 5], alt_qtys=[12, 12]) == [
        [C(5, 5, 12), C(5, 5, 12)],
    ]


def test_allocate_splits_an_alt_count_without_losing_a_piece():
    # The second box straddles the lot seam: 3 of its 5kg stays in lot 1. Its 10
    # pieces split 6/4 by qty, and the parts still sum to 10 — a discrete count
    # must not gain or lose a piece to rounding.
    out = allocate_boxes_to_lots([8, 2], [5, 5], weights=[8.0, 10.0], alt_qtys=[10, 10])
    assert out == [[C(5, 8.0, 10), C(3, 6.0, 6.0)], [C(2, 4.0, 4.0)]]
    assert sum(c.alt_qty for lot in out for c in lot) == 20


def test_allocate_without_alt_counts_leaves_them_none():
    assert allocate_boxes_to_lots([10], [5, 5], weights=[5, 5]) == [
        [C(5, 5, None), C(5, 5, None)],
    ]


def test_fill_alt_qtys_derives_only_the_missing_ones():
    # A count the packer stated always wins over a computed one.
    rows = [C(10.62, 10.62), C(9.0, 9.0, 10)]
    assert packing_service.fill_alt_qtys(rows, 0.9) == [
        C(10.62, 10.62, 12), C(9.0, 9.0, 10),
    ]


def test_fill_alt_qtys_is_a_noop_without_a_factor():
    rows = [C(10.62, 10.62)]
    assert packing_service.fill_alt_qtys(rows, None) == rows


# --- factors quoted in the stock unit ---------------------------------------
# The seeded UOM master mixes both shapes: `1 Pic = 50 m` is a length, but
# `1 Box = 10 kg` and `1 Cone = 2 kg` are already weights. A weight factor must
# not be routed through the length code, which would read that 10 as yards.

def test_base_per_alt_takes_a_kg_factor_as_it_stands():
    # 1 Box = 10 kg on a kg-stocked item: the factor IS the answer, and no item
    # weight is needed to get there.
    assert packing_service.base_per_alt(10, "kg", "kg") == 10
    assert packing_service.base_per_alt(10, "kg", "kg", 180, "g/y") == 10


def test_base_per_alt_takes_a_matching_length_factor_as_it_stands():
    assert packing_service.base_per_alt(50, "yard", "yard") == 50


def test_base_per_alt_matches_the_stock_unit_case_insensitively():
    # Item UOMs in use include both 'pcs' and 'Pcs'.
    assert packing_service.base_per_alt(4, "Pcs", "pcs") == 4


def test_base_per_alt_refuses_a_factor_into_an_unrelated_unit():
    # 1 Box = 10 cones tells us nothing about kilos, so it is refused rather than
    # silently treated as 10 yards.
    assert packing_service.base_per_alt(10, "cone", "kg", 180, "g/y") is None
