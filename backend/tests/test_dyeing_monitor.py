"""Dyeing vessel efficiency: the rate chain, and the grid endpoint's shape.

The arithmetic half needs no DB — compute_run_metrics takes its actuals, its
machine constant and its clock from the caller, so the numbers the floor is
judged on can be pinned down directly (same shape as test_weaving.py).
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services import dyeing_monitor_service as svc
from app.services import packing_service


NOW = datetime(2026, 9, 6, 12, 0, tzinfo=timezone.utc)


def _item(uom="kg", weight_per_unit=200.0, weight_unit="g/y"):
    return SimpleNamespace(uom=uom, weight_per_unit=weight_per_unit, weight_unit=weight_unit)


def _run(rpm=120, lines=2, target=50, started_min_ago=60, completed=None, substrate=500):
    return SimpleNamespace(
        rpm=rpm,
        lines=lines,
        target_efficiency_pct=target,
        substrate_qty=substrate,
        started_at=NOW - timedelta(minutes=started_min_ago) if started_min_ago is not None else None,
        completed_at=completed,
    )


# -- yards_per_minute --------------------------------------------------------

def test_rate_is_rpm_times_circumference_times_lines():
    assert svc.yards_per_minute(120, 4.5, 2) == pytest.approx(1080.0)


@pytest.mark.parametrize("rpm, ypr, lines", [
    (None, 4.5, 2),   # nobody entered the reel speed
    (120, None, 2),   # nobody measured the machine
    (120, 4.5, 0),    # no rope count
    (0, 4.5, 2),
])
def test_rate_is_none_when_any_factor_is_unmeasured(rpm, ypr, lines):
    """None, never 0. A 0 would divide into a null efficiency for the wrong reason
    and read as a vessel producing nothing rather than one nobody has measured."""
    assert svc.yards_per_minute(rpm, ypr, lines) is None


# -- elapsed_minutes ---------------------------------------------------------

def test_live_run_elapses_to_now():
    assert svc.elapsed_minutes(NOW - timedelta(minutes=90), None, NOW) == pytest.approx(90.0)


def test_finished_run_is_frozen_at_its_own_completion():
    """A completed batch must not keep accruing elapsed time after it came off."""
    started = NOW - timedelta(hours=5)
    completed = NOW - timedelta(hours=3)
    assert svc.elapsed_minutes(started, completed, NOW) == pytest.approx(120.0)


def test_unstarted_run_has_no_clock():
    assert svc.elapsed_minutes(None, None, NOW) == 0.0


def test_naive_timestamps_are_treated_as_utc():
    """Postgres hands back naive datetimes; subtracting one from an aware `now`
    raises TypeError unless they are reconciled."""
    naive = (NOW - timedelta(minutes=30)).replace(tzinfo=None)
    assert svc.elapsed_minutes(naive, None, NOW) == pytest.approx(30.0)


def test_query_bounds_are_naive_utc():
    """MOCompletion.created_at is TIMESTAMP WITHOUT TIME ZONE while
    DyeingRun.started_at is tz-aware. Binding an aware bound against the naive
    column makes asyncpg raise outright, which is how this was found — the bounds
    must be normalised to UTC and stripped."""
    aware = datetime(2026, 9, 6, 12, 0, tzinfo=timezone.utc)
    assert svc._naive_utc(aware) == datetime(2026, 9, 6, 12, 0)
    assert svc._naive_utc(aware).tzinfo is None


def test_query_bounds_normalise_a_non_utc_offset_before_stripping():
    """Stripping tzinfo without converting first would shift the window by the
    offset and silently pull in the previous batch's completions."""
    jakarta = timezone(timedelta(hours=7))
    assert svc._naive_utc(datetime(2026, 9, 6, 19, 0, tzinfo=jakarta)) == datetime(2026, 9, 6, 12, 0)


# -- to_yards ----------------------------------------------------------------

def test_kg_converts_to_yards_through_the_item_gy_factor():
    # 200 g/y: 100 kg = 100_000 g = 500 yards.
    assert svc.to_yards(100.0, _item()) == pytest.approx(500.0)


def test_yard_stocked_item_needs_no_conversion():
    assert svc.to_yards(500.0, _item(uom="yard", weight_per_unit=None, weight_unit=None)) == pytest.approx(500.0)


def test_metre_stocked_item_converts_to_yards():
    assert svc.to_yards(100.0, _item(uom="m", weight_per_unit=None, weight_unit=None)) == pytest.approx(109.361, rel=1e-4)


def test_gsm_item_yields_no_yards():
    """gsm needs the fabric width. Same refusal packing_service.base_per_alt makes —
    a figure wrong by the width is worse than no figure."""
    assert svc.to_yards(100.0, _item(weight_unit="gsm")) is None


def test_to_yards_is_the_inverse_of_base_per_alt():
    """The two conversions must agree, or a packing order and a dye card would
    describe the same cloth as two different lengths."""
    kg_per_yard = packing_service.base_per_alt(1, "yard", "kg", weight_per_unit=200.0, weight_unit="g/y")
    assert packing_service.to_yards(kg_per_yard * 500, "kg", 200.0, "g/y") == pytest.approx(500.0)


# -- compute_run_metrics -----------------------------------------------------

def test_efficiency_is_actual_yards_over_the_theoretical_walk():
    """60 min at 1080 yd/min = 64 800 theoretical yards. 200 g/y means the 6480 kg
    logged is 32 400 yards — exactly half, so 50%."""
    m = svc.compute_run_metrics(_run(), yards_per_rev=4.5, actual_qty=6480.0, item=_item(), now=NOW)
    assert m["target_yd_per_min"] == pytest.approx(1080.0)
    assert m["theoretical_yards"] == pytest.approx(64800.0)
    assert m["actual_yards"] == pytest.approx(32400.0)
    assert m["efficiency_pct"] == pytest.approx(50.0)


def test_on_target_is_true_at_exactly_the_target():
    m = svc.compute_run_metrics(_run(target=50), 4.5, 6480.0, _item(), NOW)
    assert m["on_target"] is True


def test_below_target_reports_false_not_none():
    m = svc.compute_run_metrics(_run(target=80), 4.5, 6480.0, _item(), NOW)
    assert m["efficiency_pct"] == pytest.approx(50.0)
    assert m["on_target"] is False


def test_unmeasured_machine_reports_no_efficiency_and_says_why():
    """A vessel with no yards_per_rev must show a dash, not a zero, and the card
    has to be able to name the missing input."""
    m = svc.compute_run_metrics(_run(), yards_per_rev=None, actual_qty=6480.0, item=_item(), now=NOW)
    assert m["efficiency_pct"] is None
    assert m["on_target"] is None
    assert m["theoretical_yards"] is None
    assert "yards_per_rev" in m["missing_rate_inputs"]


def test_missing_gy_factor_reports_no_efficiency_and_says_why():
    m = svc.compute_run_metrics(_run(), 4.5, 6480.0, _item(weight_unit="gsm"), NOW)
    assert m["actual_yards"] is None
    assert m["efficiency_pct"] is None
    assert m["missing_gy_factor"] is True


def test_unstarted_run_has_no_efficiency_rather_than_zero():
    """A PENDING batch has no clock. Dividing by a 0 denominator must not surface
    as 0% — the vessel has not been given a chance to produce anything yet."""
    m = svc.compute_run_metrics(_run(started_min_ago=None), 4.5, 0.0, _item(), NOW)
    assert m["elapsed_minutes"] == 0.0
    assert m["theoretical_yards"] == 0.0
    assert m["efficiency_pct"] is None


def test_zero_output_on_a_running_vessel_is_zero_percent_not_none():
    """The opposite case, and the distinction the whole None-vs-0 rule exists for:
    a measured machine that has been running an hour and logged nothing IS at 0%."""
    m = svc.compute_run_metrics(_run(), 4.5, 0.0, _item(), NOW)
    assert m["efficiency_pct"] == pytest.approx(0.0)
    assert m["on_target"] is False


# -- derive_machine_status ---------------------------------------------------

@pytest.mark.parametrize("active, pending, expected", [
    (True, True, "RUNNING"),    # a run beats a queued load
    (True, False, "RUNNING"),
    (False, True, "LOADED"),
    (False, False, "IDLE"),
])
def test_machine_status_is_derived_from_the_runs_alone(active, pending, expected):
    assert svc.derive_machine_status(active, pending) == expected


# -- endpoint ----------------------------------------------------------------

def test_monitor_returns_an_envelope_even_with_no_dyeing_machines(client, auth_headers):
    res = client.get("/api/dyeing/monitor", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    for key in ("machines", "total", "running", "groups", "avg_efficiency_pct",
                "active_runs", "below_target", "needs_setup"):
        assert key in body, f"{key} missing from the monitor envelope"


def _seed_vessels(client, async_db_session):
    """Put a TYPE root and two vessels under it on the ASYNC connection.

    `POST /work-centers` is a sync route and `GET /dyeing/monitor` is async; the two
    sit on separate non-committing connections in this harness, so anything seeded
    over the sync HTTP call is invisible to the async route (see the conftest note
    on `async_db_session`). Cross-domain setup has to land here instead.
    """
    from app.models.routing import WorkCenter

    root = WorkCenter(code="T-CELUP", name="Celup Continuous", center_type="DYEING",
                      node_type="TYPE")
    measured = WorkCenter(code="T-CC01", name="Celup Continuous 01", center_type="DYEING",
                          node_type="MACHINE", yards_per_rev=4.5)
    unmeasured = WorkCenter(code="T-CC02", name="Celup Continuous 02", center_type="DYEING",
                            node_type="MACHINE")

    async def _seed():
        async_db_session.add(root)
        await async_db_session.flush()
        measured.parent_id = root.id
        unmeasured.parent_id = root.id
        async_db_session.add_all([measured, unmeasured])
        await async_db_session.flush()

    client.portal.call(_seed)


def test_monitor_lists_dyeing_machines_under_their_type_root(client, auth_headers, async_db_session):
    """Vessels hang straight off their TYPE root, so the grid must fall back to the
    TYPE for grouping — a GROUP-only walk tips every vessel into one Ungrouped pile."""
    _seed_vessels(client, async_db_session)

    body = client.get("/api/dyeing/monitor", headers=auth_headers).json()
    row = next(m for m in body["machines"] if m["code"] == "T-CC01")
    assert row["yards_per_rev"] == pytest.approx(4.5)
    assert row["needs_setup"] is False
    assert row["loom_status"] == "IDLE"
    assert row["group_code"] == "T-CELUP"
    # TYPE rows are containers, never cards.
    assert all(m["code"] != "T-CELUP" for m in body["machines"])
    assert {"id", "code", "name"} <= set(body["groups"][0])


def test_machine_without_a_measured_reel_is_flagged_for_setup(client, auth_headers, async_db_session):
    _seed_vessels(client, async_db_session)

    body = client.get("/api/dyeing/monitor", headers=auth_headers).json()
    row = next(m for m in body["machines"] if m["code"] == "T-CC02")
    assert row["yards_per_rev"] is None
    assert row["needs_setup"] is True
    assert body["needs_setup"] >= 1


def test_work_center_endpoint_round_trips_yards_per_rev(client, auth_headers):
    res = client.post("/api/work-centers", headers=auth_headers, json={
        "code": "T-CC03", "name": "Celup Continuous 03", "center_type": "DYEING",
        "node_type": "MACHINE", "yards_per_rev": 4.5,
    })
    assert res.status_code == 200, res.text
    assert res.json()["yards_per_rev"] == pytest.approx(4.5)


def test_zero_yards_per_rev_is_stored_as_unmeasured(client, auth_headers):
    """0 is not a measurement. Storing it would divide into a false 'no efficiency'
    that the setup flag could not distinguish from a real one."""
    res = client.post("/api/work-centers", headers=auth_headers, json={
        "code": "T-CC04", "name": "Celup Continuous 04", "center_type": "DYEING",
        "node_type": "MACHINE", "yards_per_rev": 0,
    })
    assert res.status_code == 200, res.text
    assert res.json()["yards_per_rev"] is None
