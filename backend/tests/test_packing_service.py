from app.services.packing_service import split_qty, describe_box_breakdown


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
