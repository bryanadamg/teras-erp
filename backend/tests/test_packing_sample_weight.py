"""Re-sampling a packing order restates its estimates, not its packed output.

The create-path arithmetic is covered fixture-free in test_packing_alt_unit.py.
This is the edit path, which only exists on the endpoint: `PUT /packing/{id}`
with a new sampled weight has to re-derive the kg target and the box-size
estimate off the counts the order already carries.
"""
import uuid

import pytest


def _seed_locations(*codes):
    """Locations go in through the sync session — /api/locations is a sync router
    while packing is async, same pattern as test_packing_reject.py."""
    from app.db.session import engine as _engine
    from sqlalchemy.orm import Session as _SASession
    from app.models.location import Location as _Location
    conn = _engine.connect()
    sess = _SASession(conn)
    try:
        for code in codes:
            if not sess.query(_Location).filter_by(code=code).first():
                sess.add(_Location(code=code, name=code.replace("-", " ").title()))
        sess.commit()
    finally:
        sess.close()
        conn.close()


@pytest.fixture
def sampled_order(client, auth_headers):
    """A kg cloth the item master says is 180 g/y, packed 2880 Pcs of 5 yard."""
    suffix = uuid.uuid4().hex[:6].upper()
    _seed_locations("SW-SRC", "SW-OUT")
    locs = {l["code"]: l["id"] for l in client.get("/api/locations", headers=auth_headers).json()}

    client.post("/api/uoms", json={"name": "kg"}, headers=auth_headers)
    item = client.post("/api/items", json={
        "code": f"SW-FG-{suffix}", "name": "Sampled cloth", "uom": "kg",
        "weight_per_unit": 180, "weight_unit": "g/y",
    }, headers=auth_headers).json()

    res = client.post("/api/packing", json={
        "item_id": item["id"],
        "qty2": 2880, "uom2": "Pcs", "uom2_factor": 5, "uom2_length_uom": "yard",
        "pack_size_alt": 12,
        "source_location_id": locs["SW-SRC"],
        "output_location_id": locs["SW-OUT"],
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    return res.json()


def test_an_order_created_without_a_sample_converts_through_the_item(sampled_order):
    # 2880 Pcs x 5 yard x 180 g/y, and a 12-piece carton at 10.8 kg.
    assert float(sampled_order["qty_target"]) == 2592.0
    assert float(sampled_order["pack_size"]) == 10.8
    assert sampled_order["sample_weight_per_unit"] is None


def test_re_sampling_restates_the_target_and_the_box_size(client, auth_headers, sampled_order):
    res = client.put(f"/api/packing/{sampled_order['id']}", json={
        "sample_weight_per_unit": 200, "sample_weight_unit": "g/y",
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    fresh = res.json()

    # The order is still FOR 2880 pieces — that count is what the customer
    # ordered and what the packer boxes. Only its weight estimate moves.
    assert float(fresh["qty2"]) == 2880.0
    assert float(fresh["qty_target"]) == 2880.0
    assert float(fresh["pack_size"]) == 12.0
    assert float(fresh["sample_weight_per_unit"]) == 200.0
    assert fresh["sample_weight_unit"] == "g/y"
    # Served to every screen off one server-side conversion.
    assert float(fresh["uom2_base_factor"]) == 1.0
    # Nothing was packed, and re-sampling packs nothing.
    assert float(fresh["qty_packed"]) == 0.0
    assert fresh["status"] == "PENDING"


def test_clearing_the_sample_returns_to_the_items_estimate(client, auth_headers, sampled_order):
    client.put(f"/api/packing/{sampled_order['id']}", json={
        "sample_weight_per_unit": 200, "sample_weight_unit": "g/y",
    }, headers=auth_headers)

    res = client.put(f"/api/packing/{sampled_order['id']}", json={
        "sample_weight_per_unit": 0, "sample_weight_unit": "",
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    fresh = res.json()

    assert fresh["sample_weight_per_unit"] is None
    assert fresh["sample_weight_unit"] is None
    assert float(fresh["qty_target"]) == 2592.0
    assert float(fresh["pack_size"]) == 10.8


def test_a_weight_unit_that_needs_the_fabric_width_is_refused(client, auth_headers, sampled_order):
    res = client.put(f"/api/packing/{sampled_order['id']}", json={
        "sample_weight_per_unit": 200, "sample_weight_unit": "gsm",
    }, headers=auth_headers)
    assert res.status_code == 400
    assert "g/y" in res.json()["detail"]
