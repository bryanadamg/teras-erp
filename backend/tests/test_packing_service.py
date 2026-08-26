import pytest

from app.services import packing_service
from app.services.packing_service import split_qty, describe_box_breakdown, allocate_boxes_to_lots


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
    """Drop the weight half of each (qty, weight) pair."""
    return [[q for q, _w in lot] for lot in allocated]


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
    assert allocate_boxes_to_lots([10], [5, 5]) == [[(5, None), (5, None)]]


def test_allocate_boxes_to_lots_carries_weights_positionally():
    assert allocate_boxes_to_lots([10], [5, 5], weights=[6.19, 6.2]) == [
        [(5, 6.19), (5, 6.2)],
    ]


def test_allocate_boxes_to_lots_splits_weight_pro_rata_at_lot_seam():
    # The 5kg box straddles the seam: 3kg stays in lot 1, 2kg carries into lot 2.
    # Its 10kg scale reading is shared 6/4 by qty, because the physical carton
    # became two cartons and neither one weighs the original 10.
    assert allocate_boxes_to_lots([8, 2], [5, 5], weights=[8.0, 10.0]) == [
        [(5, 8.0), (3, 6.0)],
        [(2, 4.0)],
    ]


def test_allocate_boxes_to_lots_partial_weights_leave_others_none():
    assert allocate_boxes_to_lots([10], [5, 5], weights=[6.19, None]) == [
        [(5, 6.19), (5, None)],
    ]


# --- assert_all_weighed ------------------------------------------------------
# Packing is logged after the boxes are packed and weighed, so an unweighed
# carton is a missing measurement, not one still to come — and it would print a
# label with a blank N.W. line.

def test_assert_all_weighed_passes_when_every_carton_is_weighed():
    packing_service.assert_all_weighed([(5.0, 4.8), (3.0, 2.9)])


def test_assert_all_weighed_rejects_a_missing_weight():
    with pytest.raises(ValueError) as e:
        packing_service.assert_all_weighed([(5.0, 4.8), (3.0, None)], "Carton")
    assert "1 of 2 not weighed" in str(e.value)
    assert "carton" in str(e.value)


def test_assert_all_weighed_rejects_a_zero_weight():
    # A zero on the scale is a skipped weighing, not a weightless box.
    with pytest.raises(ValueError):
        packing_service.assert_all_weighed([(5.0, 0)])


def test_assert_all_weighed_counts_every_missing_carton():
    with pytest.raises(ValueError) as e:
        packing_service.assert_all_weighed([(1.0, None), (1.0, None), (1.0, 0.9)])
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
    assert packing_service.derive_weights_from_qty([(5.0, None), (3.0, None)], "kg") == [
        (5.0, 5.0), (3.0, 3.0),
    ]


def test_derive_weights_from_qty_overrides_a_contradicting_weight():
    # Same carton cannot weigh two things — the qty is the measurement.
    assert packing_service.derive_weights_from_qty([(5.0, 4.2)], "kg") == [(5.0, 5.0)]


def test_derive_weights_from_qty_leaves_a_counted_uom_alone():
    rows = [(12.0, 6.19), (4.0, None)]
    assert packing_service.derive_weights_from_qty(rows, "pcs") == rows


def test_derived_kg_weights_satisfy_the_weight_gate():
    packing_service.assert_all_weighed(
        packing_service.derive_weights_from_qty([(5.0, None)], "kg")
    )
