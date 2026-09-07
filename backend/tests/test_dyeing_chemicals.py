"""Chemical actuals are recorded from the work order flow, not by closing the bath.

`POST /dyeing-runs/{id}/complete` used to be the only writer of
`DyeingRunChemical.actual_qty`, so the only way to record what went into the vessel
was to close the run — which made closing a bath the floor's job and left the shade
gate with a production form bolted onto it. `PATCH /chemicals` is the operator's
half; `/complete` is QC's, and it now leaves the recorded doses alone.

Setup comes from `test_dyeing_output_lot` (a started dyeing WO with bath records) —
shared rather than duplicated so the three dyeing test files cannot drift.
"""
import uuid

from tests.test_dyeing_output_lot import _log, _setup_dyeing_wo


def _chemical_item(client, auth_headers):
    tag = str(uuid.uuid4())[:8]
    client.post("/api/uoms", json={"name": "kg"}, headers=auth_headers)
    res = client.post("/api/items", json={
        "code": f"CHEM-{tag}", "name": "Levelling Agent", "uom": "kg",
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    return res.json()["id"]


def _patch(client, auth_headers, run_id, chemicals):
    return client.patch(
        f"/api/dyeing-runs/{run_id}/chemicals",
        json={"chemicals": chemicals},
        headers=auth_headers,
    )


def test_recording_an_actual_does_not_close_the_bath(client, auth_headers, async_db_session):
    """The whole point: the operator writes what went in without ending the run, so
    a shade result stays a separate act by a separate person."""
    _mo_id, _wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    item_id = _chemical_item(client, auth_headers)

    res = _patch(client, auth_headers, run_ids[0], [
        {"item_id": item_id, "actual_qty": 47.5, "planned_qty": 50},
    ])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["completed_at"] is None
    assert body["shade_result"] is None
    row = next(c for c in body["chemicals"] if str(c["item_id"]) == item_id)
    assert float(row["actual_qty"]) == 47.5
    assert float(row["planned_qty"]) == 50


def test_a_second_entry_updates_the_row_and_keeps_the_plan(client, auth_headers, async_db_session):
    """Upsert by item: a chemical topped up mid-cycle must not append a duplicate,
    and recording an actual must never rewrite what the operator was told to weigh."""
    _mo_id, _wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    item_id = _chemical_item(client, auth_headers)

    _patch(client, auth_headers, run_ids[0], [{"item_id": item_id, "actual_qty": 40, "planned_qty": 50}])
    res = _patch(client, auth_headers, run_ids[0], [{"item_id": item_id, "actual_qty": 52}])
    assert res.status_code == 200, res.text
    rows = [c for c in res.json()["chemicals"] if str(c["item_id"]) == item_id]
    assert len(rows) == 1
    assert float(rows[0]["actual_qty"]) == 52
    assert float(rows[0]["planned_qty"]) == 50


def test_an_off_recipe_chemical_is_all_variance(client, auth_headers, async_db_session):
    """Something the recipe never asked for has no plan: 0 planned against a real
    actual is the variance, and is the honest number."""
    _mo_id, _wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    item_id = _chemical_item(client, auth_headers)

    res = _patch(client, auth_headers, run_ids[0], [{"item_id": item_id, "actual_qty": 3}])
    assert res.status_code == 200, res.text
    row = next(c for c in res.json()["chemicals"] if str(c["item_id"]) == item_id)
    assert float(row["planned_qty"]) == 0
    assert float(row["actual_qty"]) == 3


def test_a_closed_bath_takes_no_more_chemicals(client, auth_headers, async_db_session):
    _mo_id, _wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    item_id = _chemical_item(client, auth_headers)

    closed = client.post(f"/api/dyeing-runs/{run_ids[0]}/complete", json={
        "shade_result": "PASS",
    }, headers=auth_headers)
    assert closed.status_code == 200, closed.text

    res = _patch(client, auth_headers, run_ids[0], [{"item_id": item_id, "actual_qty": 1}])
    assert res.status_code == 400, res.text
    assert "history" in res.json()["detail"]


def test_an_empty_body_is_refused(client, auth_headers, async_db_session):
    """A no-op write would audit a change nobody made."""
    _mo_id, _wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    res = _patch(client, auth_headers, run_ids[0], [])
    assert res.status_code == 422, res.text


def test_the_shade_close_leaves_the_recorded_doses_alone(client, auth_headers, async_db_session):
    """The regression this split creates if `chemicals` is not optional: QC saves a
    shade with no chemical rows, and the record of what went into the vessel is gone."""
    mo_id, wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    item_id = _chemical_item(client, auth_headers)
    _patch(client, auth_headers, run_ids[0], [{"item_id": item_id, "actual_qty": 47.5, "planned_qty": 50}])
    _log(client, auth_headers, mo_id, wo_id, 1.0)

    res = client.post(f"/api/dyeing-runs/{run_ids[0]}/complete", json={
        "shade_result": "PASS", "shade_notes": "on standard",
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["shade_result"] == "PASS"
    row = next(c for c in body["chemicals"] if str(c["item_id"]) == item_id)
    assert float(row["actual_qty"]) == 47.5


def test_an_explicit_list_still_replaces_the_sheet(client, auth_headers, async_db_session):
    """The legacy all-in-one close keeps working: a list sent to /complete replaces
    the whole sheet, `[]` included. Only omission means "leave it alone"."""
    _mo_id, _wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    item_id = _chemical_item(client, auth_headers)
    _patch(client, auth_headers, run_ids[0], [{"item_id": item_id, "actual_qty": 47.5, "planned_qty": 50}])

    res = client.post(f"/api/dyeing-runs/{run_ids[0]}/complete", json={
        "shade_result": "FAIL", "chemicals": [],
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["chemicals"] == []
