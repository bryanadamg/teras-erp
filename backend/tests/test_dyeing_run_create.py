"""Cutting an extra bath by hand: what the run carries, and what it no longer does.

Eight columns came off `dyeing_runs` (migration a7c9e1b3d5f8) — customer/artikel/PO/
order-qty restated the SO → MO → WO chain, colour restated the MO's attributes, the
lot predated `output_batch_id`, and the machine is the WO's work center. All were
null in every one of 12 real runs.

`substrate_qty` stayed, because a multi-bath WO splits its load across runs — but it
now defaults from the WO instead of being a hand-typed copy of a number the WO
already holds.

Setup comes from `test_dyeing_output_lot` so the dyeing test files share one fixture
shape.
"""
from tests.test_dyeing_output_lot import _setup_dyeing_wo

# The columns this migration dropped. Named here so re-adding one to the response
# fails a test rather than quietly reappearing in the API.
DROPPED_FIELDS = (
    "machine_name", "customer_name", "artikel", "po_number",
    "qty_order_kg", "color_name", "color_matching_ref", "lot_number",
)


def test_substrate_defaults_from_the_work_order(client, auth_headers, async_db_session):
    _mo_id, wo_id, _run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, wo_qty=7.0)

    res = client.post("/api/dyeing-runs", json={"work_order_id": wo_id}, headers=auth_headers)
    assert res.status_code == 200, res.text
    assert float(res.json()["substrate_qty"]) == 7.0


def test_an_explicit_substrate_wins(client, auth_headers, async_db_session):
    """A multi-bath WO splits its load, so the per-run number has to be settable —
    that is the whole reason the column survived."""
    _mo_id, wo_id, _run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, wo_qty=7.0)

    res = client.post(
        "/api/dyeing-runs",
        json={"work_order_id": wo_id, "substrate_qty": 2.5},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    assert float(res.json()["substrate_qty"]) == 2.5


def test_the_dropped_columns_are_gone_from_the_api(client, auth_headers, async_db_session):
    """Sending them is harmless (Pydantic ignores unknown keys) — but nothing may
    come back, or the columns are on their way to being re-added."""
    _mo_id, wo_id, _run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, wo_qty=7.0)

    res = client.post(
        "/api/dyeing-runs",
        json={
            "work_order_id": wo_id,
            "machine_name": "JET-01",
            "customer_name": "Acme",
            "artikel": "ART-1",
            "po_number": "PO-1",
            "qty_order_kg": 65,
            "color_name": "Navy",
            "color_matching_ref": "CM-1",
            "lot_number": "LOT-1",
        },
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    for field in DROPPED_FIELDS:
        assert field not in body, f"{field} is back on DyeingRunResponse"


def test_the_run_list_carries_none_of_them_either(client, auth_headers, async_db_session):
    _mo_id, wo_id, _run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)

    res = client.get(f"/api/dyeing-runs?work_order_id={wo_id}", headers=auth_headers)
    assert res.status_code == 200, res.text
    rows = res.json()
    assert rows, "the WO's auto-created run should be listed"
    for field in DROPPED_FIELDS:
        assert field not in rows[0], f"{field} is back on the run list"
