"""The SO table's MO-progress column: quantity produced per sales-order line.

Covers the reading `so_fulfilment_service.mo_progress_map` builds — the qty
measure, the "where is it right now?" stage, and the line peg it shares with
`qty_made` — without a database: the query is a thin wrapper, the arithmetic is
where a wrong answer would reach the shop floor.
"""

from types import SimpleNamespace

from app.services import so_fulfilment_service as sf


def _wc(name, center_type):
    return SimpleNamespace(name=name, center_type=center_type)


def _wo(sequence, status, stage="WEAVING", name=None, code=None):
    return SimpleNamespace(
        id=f"wo-{sequence}",
        code=code or f"WO-{sequence}",
        name=name or f"step {sequence}",
        sequence=sequence,
        status=status,
        work_center=_wc(f"Loom {sequence}", stage) if stage else None,
    )


def _mo(work_orders, status="IN_PROGRESS", code="MO-0041", qty=100.0):
    return SimpleNamespace(
        id="mo-1",
        code=code,
        status=status,
        qty=qty,
        work_orders=work_orders,
    )


# --- one MO's quantity progress ---------------------------------------------

def test_pct_is_produced_over_planned():
    node = sf._mo_progress_node(_mo([_wo(1, "IN_PROGRESS")], qty=200), made=50)
    assert (node["made"], node["mo_qty"], node["pct"]) == (50, 200, 25)


def test_over_delivery_caps_the_bar_but_not_the_figures():
    # `mo.qty` is a target, not a ceiling (overdelivery_tolerance_pct), so the
    # real quantity must stay readable beside a full bar.
    node = sf._mo_progress_node(_mo([], qty=100), made=112)
    assert (node["pct"], node["made"]) == (100, 112)


def test_completed_steps_do_not_move_the_bar_on_their_own():
    # The column answers "how much was made", not "how many steps ran". Every
    # step finished with nothing logged is 0%.
    node = sf._mo_progress_node(_mo([_wo(1, "COMPLETED"), _wo(2, "COMPLETED")]), made=0)
    assert node["pct"] == 0
    assert (node["steps_done"], node["steps_total"]) == (2, 2)


def test_a_late_added_step_does_not_run_the_bar_backwards():
    # The bug this measure replaced: WOs are manual floor dispatch decisions, so
    # counting them let the denominator grow after the fact — two-of-two done
    # read 100%, and creating a third step dropped it to 67%.
    two = sf._mo_progress_node(_mo([_wo(1, "COMPLETED"), _wo(2, "COMPLETED")]), made=100)
    three = sf._mo_progress_node(
        _mo([_wo(1, "COMPLETED"), _wo(2, "COMPLETED"), _wo(3, "PENDING")]), made=100
    )
    assert two["pct"] == three["pct"] == 100


def test_qty_less_mo_falls_back_to_its_own_status():
    for missing in (0, None):
        assert sf._mo_progress_node(_mo([], status="PENDING", qty=missing))["pct"] == 0
        assert sf._mo_progress_node(_mo([], status="IN_PROGRESS", qty=missing))["pct"] == 0
        assert sf._mo_progress_node(_mo([], status="COMPLETED", qty=missing))["pct"] == 100
        # DELIVERED = planned qty met, order merely not closed yet.
        assert sf._mo_progress_node(_mo([], status="DELIVERED", qty=missing))["pct"] == 100


# --- the stage, which is what steps are still counted for -------------------

def test_the_running_step_is_the_stage():
    node = sf._mo_progress_node(_mo([
        _wo(1, "COMPLETED", "WARPING"),
        _wo(2, "COMPLETED", "BEAMING"),
        _wo(3, "IN_PROGRESS", "WEAVING"),
        _wo(4, "PENDING", "INSPECTION"),
    ]), made=50)
    assert (node["steps_done"], node["steps_total"]) == (2, 4)
    assert node["current_stage"] == "WEAVING"
    assert node["current_stage_running"] is True


def test_nothing_running_reports_the_next_step_waiting():
    node = sf._mo_progress_node(_mo([
        _wo(1, "COMPLETED", "WARPING"),
        _wo(2, "PENDING", "BEAMING"),
    ]))
    assert node["current_stage"] == "BEAMING"
    assert node["current_stage_running"] is False


def test_out_of_order_rows_are_read_in_sequence_order():
    # The query has no ORDER BY on the WO collection; the stage must still be the
    # earliest outstanding step, not whatever row came back first.
    node = sf._mo_progress_node(_mo([
        _wo(3, "PENDING", "INSPECTION"),
        _wo(1, "COMPLETED", "WARPING"),
        _wo(2, "PENDING", "BEAMING"),
    ]))
    assert node["current_stage"] == "BEAMING"


def test_cancelled_steps_leave_the_step_count():
    # A scrapped step is not outstanding work, so it is neither a stage nor a row.
    node = sf._mo_progress_node(_mo([
        _wo(1, "COMPLETED", "WARPING"),
        _wo(2, "CANCELLED", "BEAMING"),
    ]))
    assert (node["steps_done"], node["steps_total"]) == (1, 1)
    assert node["current_stage"] is None
    assert [s["stage"] for s in node["steps"]] == ["WARPING"]


# --- the stage label --------------------------------------------------------

def test_stage_prefers_the_work_center_type():
    assert sf._stage_label(_wo(1, "PENDING", "DYEING")) == "DYEING"


def test_general_center_type_falls_through_to_the_machine_name():
    # GENERAL is the model default and says nothing about the step.
    assert sf._stage_label(_wo(7, "PENDING", "GENERAL")) == "Loom 7"


def test_no_work_center_falls_back_to_the_work_order_name():
    assert sf._stage_label(_wo(1, "PENDING", stage=None, name="Rewinding")) == "Rewinding"


def test_no_step_has_no_stage():
    assert sf._stage_label(None) is None


# --- several MOs on one line ------------------------------------------------

def test_two_mos_on_one_line_pool_their_quantities():
    # Several root MOs for one line are batches of the same demand.
    a = sf._mo_progress_node(_mo([], qty=100), made=40)
    b = sf._mo_progress_node(_mo([], qty=50), made=50)
    agg = sf._aggregate_mo_progress([a, b])
    assert (agg["mo_count"], agg["made"], agg["mo_qty"], agg["pct"]) == (2, 90, 150, 60)


def test_pooled_over_delivery_caps_at_one_hundred():
    a = sf._mo_progress_node(_mo([], qty=100), made=120)
    agg = sf._aggregate_mo_progress([a, sf._mo_progress_node(_mo([], qty=100), made=100)])
    assert (agg["made"], agg["pct"]) == (220, 100)


def test_step_counts_still_pool_for_the_tooltip():
    a = sf._mo_progress_node(_mo([_wo(1, "COMPLETED"), _wo(2, "PENDING")]))
    b = sf._mo_progress_node(_mo([_wo(1, "COMPLETED"), _wo(2, "COMPLETED")]))
    agg = sf._aggregate_mo_progress([a, b])
    assert (agg["steps_done"], agg["steps_total"]) == (3, 4)


def test_the_running_mo_leads_the_cell():
    idle = sf._mo_progress_node(_mo([_wo(1, "PENDING", "WARPING")], code="MO-A"))
    running = sf._mo_progress_node(_mo([_wo(1, "IN_PROGRESS", "DYEING")], code="MO-B"))
    agg = sf._aggregate_mo_progress([idle, running])
    assert agg["mo_code"] == "MO-B"
    assert agg["current_stage"] == "DYEING"
    assert agg["current_stage_running"] is True


def test_all_qty_less_mos_average_their_status_reading():
    done = sf._mo_progress_node(_mo([], status="COMPLETED", qty=0))
    todo = sf._mo_progress_node(_mo([], status="PENDING", qty=0))
    agg = sf._aggregate_mo_progress([done, todo])
    assert (agg["mo_qty"], agg["pct"]) == (0, 50)




# --- pegged components folded into the headline percentage ------------------
#
# `edges` mirrors mo_dependencies: {dependent_mo_id: [(required_mo_id, qty)]}.
# The root needs 14.875 kg of a greige MO planned for 148.75 (so it occupies a
# tenth of it), and that greige needs 100 kg of a beam MO planned for 269.7.

_EDGES = {"root": [("greige", 14.875)], "greige": [("beam", 100.0)]}
_INFO = {
    "greige": {"code": "MO-GREIGE-023", "status": "PENDING", "qty": 148.75},
    "beam": {"code": "MO-BEAM-NTW0053", "status": "IN_PROGRESS", "qty": 269.7111},
}


def test_component_need_scales_down_the_peg_chain():
    comps = sf._component_coverage("root", _EDGES, _INFO, {"greige": 0.0, "beam": 0.0})
    by_code = {c["mo_code"]: c for c in comps}
    assert by_code["MO-GREIGE-023"]["need"] == 14.875
    # A tenth of the greige plan is this order's, so a tenth of its beam demand is.
    assert by_code["MO-BEAM-NTW0053"]["need"] == 10.0
    assert [c["level"] for c in comps] == [1, 2]


def test_a_shared_component_reads_complete_once_this_order_s_share_exists():
    # 32 kg made on a beam MO planned for 269 kg is 12% of the beam order but all
    # of the 10 kg this line needs. Readiness, not allocation — documented on
    # `_fold_components`.
    comps = sf._component_coverage("root", _EDGES, _INFO, {"greige": 0.0, "beam": 32.0})
    assert {c["mo_code"]: c["pct"] for c in comps} == {
        "MO-GREIGE-023": 0,
        "MO-BEAM-NTW0053": 100,
    }


def test_a_cycle_in_the_peg_graph_terminates():
    edges = {"root": [("a", 10.0)], "a": [("b", 10.0)], "b": [("a", 10.0)]}
    info = {
        "a": {"code": "MO-A", "status": "PENDING", "qty": 10.0},
        "b": {"code": "MO-B", "status": "PENDING", "qty": 10.0},
    }
    assert [c["mo_code"] for c in sf._component_coverage("root", edges, info, {})] == [
        "MO-A",
        "MO-B",
    ]


def _comp(pct, level, code="MO-X"):
    return {"mo_id": "x", "mo_code": code, "mo_status": "PENDING", "level": level,
            "need": 1.0, "made": pct / 100, "pct": pct}


def test_each_bom_level_carries_an_equal_share():
    # Finished goods 0%, greige 0%, all four beams done. Beams are one level, so
    # they take a third of the bar between them — not four sixths for being four.
    node = sf._fold_components(
        sf._mo_progress_node(_mo([], qty=14.875), made=0),
        [_comp(0, 1, "MO-GREIGE")] + [_comp(100, 2, f"MO-BEAM-{i}") for i in range(4)],
    )
    assert node["pct"] == 33
    assert node["output_pct"] == 0
    assert (node["components_done"], node["components_total"]) == (4, 5)


def test_half_a_level_is_half_that_level_s_share():
    node = sf._fold_components(
        sf._mo_progress_node(_mo([], qty=100), made=0),
        [_comp(100, 1, "MO-A"), _comp(0, 1, "MO-B")],
    )
    # Level 0 (finished goods) 0%, level 1 averages to 50% -> 25% overall.
    assert node["pct"] == 25


def test_finished_output_still_counts_for_its_own_level():
    node = sf._fold_components(
        sf._mo_progress_node(_mo([], qty=100), made=100),
        [_comp(100, 1, "MO-A")],
    )
    assert (node["output_pct"], node["pct"]) == (100, 100)


def test_no_components_leaves_the_output_reading_untouched():
    node = sf._fold_components(sf._mo_progress_node(_mo([], qty=100), made=25), [])
    assert (node["pct"], node["output_pct"]) == (25, 25)
    assert (node["components_done"], node["components_total"]) == (0, 0)


def test_component_progress_pools_across_the_mos_on_one_line():
    a = sf._fold_components(sf._mo_progress_node(_mo([], qty=100), made=0), [_comp(100, 1)])
    b = sf._fold_components(sf._mo_progress_node(_mo([], qty=100), made=0), [_comp(0, 1)])
    agg = sf._aggregate_mo_progress([a, b])
    assert (agg["components_done"], agg["components_total"]) == (1, 2)
    # 50% and 0% over equal plans.
    assert (agg["pct"], agg["output_pct"]) == (25, 0)


# --- the line peg, shared with `made` --------------------------------------
#
# _line_rows columns: (id, so_id, item_id, bom_id, bom_size_id, color_id, qty, …)

def _line_row(line_id, so="so1", item="i1", bom="b1", size="s1", color="c1"):
    return (line_id, so, item, bom, size, color, 100, None, "kg", 1, "g/y")


def test_mo_pegs_to_the_line_matching_item_bom_size_and_shade():
    rows = [
        _line_row("l1", color="red"),
        _line_row("l2", color="blue"),
    ]
    got = sf._mo_claimants(rows, "so1", "i1", "b1", "s1", "blue")
    assert [r[0] for r in got] == ["l2"]


def test_nulls_on_the_line_are_wildcards():
    # Legacy rows predate bom_id/bom_size_id/color_id on the SO line.
    rows = [_line_row("l1", bom=None, size=None, color=None)]
    assert [r[0] for r in sf._mo_claimants(rows, "so1", "i1", "b9", "s9", "c9")] == ["l1"]


def test_an_mo_for_another_order_or_item_pegs_to_nothing():
    rows = [_line_row("l1")]
    assert sf._mo_claimants(rows, "so2", "i1", "b1", "s1", "c1") == []
    assert sf._mo_claimants(rows, "so1", "i2", "b1", "s1", "c1") == []
