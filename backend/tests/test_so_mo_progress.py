"""The SO table's MO-progress column: work-order steps done per sales-order line.

Covers the reading `so_fulfilment_service.mo_progress_map` builds — step counting,
the "where is it right now?" stage, and the line peg it shares with `qty_made` —
without a database: the query is a thin wrapper, the arithmetic is where a wrong
answer would reach the shop floor.
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


def _mo(work_orders, status="IN_PROGRESS", code="MO-0041"):
    return SimpleNamespace(
        id="mo-1",
        code=code,
        status=status,
        work_orders=work_orders,
    )


# --- one MO's step progress -------------------------------------------------

def test_completed_steps_over_total_with_the_running_step_as_the_stage():
    node = sf._mo_progress_node(_mo([
        _wo(1, "COMPLETED", "WARPING"),
        _wo(2, "COMPLETED", "BEAMING"),
        _wo(3, "IN_PROGRESS", "WEAVING"),
        _wo(4, "PENDING", "INSPECTION"),
    ]))
    assert (node["steps_done"], node["steps_total"], node["pct"]) == (2, 4, 50)
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


def test_cancelled_steps_leave_the_denominator():
    # A scrapped step is not outstanding work, so 1 of 1 real step reads complete.
    node = sf._mo_progress_node(_mo([
        _wo(1, "COMPLETED", "WARPING"),
        _wo(2, "CANCELLED", "BEAMING"),
    ]))
    assert (node["steps_done"], node["steps_total"], node["pct"]) == (1, 1, 100)
    assert node["current_stage"] is None
    assert [s["stage"] for s in node["steps"]] == ["WARPING"]


def test_all_steps_done_reads_one_hundred():
    node = sf._mo_progress_node(_mo([_wo(1, "COMPLETED"), _wo(2, "COMPLETED")]))
    assert node["pct"] == 100


def test_work_orderless_mo_falls_back_to_its_own_status():
    assert sf._mo_progress_node(_mo([], status="PENDING"))["pct"] == 0
    assert sf._mo_progress_node(_mo([], status="IN_PROGRESS"))["pct"] == 0
    assert sf._mo_progress_node(_mo([], status="COMPLETED"))["pct"] == 100
    # DELIVERED = planned qty met, order merely not closed yet.
    assert sf._mo_progress_node(_mo([], status="DELIVERED"))["pct"] == 100


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

def test_two_mos_on_one_line_pool_their_steps():
    a = sf._mo_progress_node(_mo([_wo(1, "COMPLETED"), _wo(2, "PENDING")]))
    b = sf._mo_progress_node(_mo([_wo(1, "COMPLETED"), _wo(2, "COMPLETED")]))
    agg = sf._aggregate_mo_progress([a, b])
    assert (agg["mo_count"], agg["steps_done"], agg["steps_total"], agg["pct"]) == (2, 3, 4, 75)


def test_the_running_mo_leads_the_cell():
    idle = sf._mo_progress_node(_mo([_wo(1, "PENDING", "WARPING")], code="MO-A"))
    running = sf._mo_progress_node(_mo([_wo(1, "IN_PROGRESS", "DYEING")], code="MO-B"))
    agg = sf._aggregate_mo_progress([idle, running])
    assert agg["mo_code"] == "MO-B"
    assert agg["current_stage"] == "DYEING"
    assert agg["current_stage_running"] is True


def test_all_work_orderless_mos_average_their_status_reading():
    done = sf._mo_progress_node(_mo([], status="COMPLETED"))
    todo = sf._mo_progress_node(_mo([], status="PENDING"))
    agg = sf._aggregate_mo_progress([done, todo])
    assert (agg["steps_total"], agg["pct"]) == (0, 50)


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
