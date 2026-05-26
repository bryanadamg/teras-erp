def test_create_uom(client, auth_headers):
    res = client.post("/api/uoms", json={"name": "TestUnit"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["name"] == "TestUnit"

def test_create_category(client, auth_headers):
    res = client.post("/api/categories", json={"name": "TestCat"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["name"] == "TestCat"

def test_create_item(client, auth_headers):
    # Prereq
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)
    client.post("/api/categories", json={"name": "Raw"}, headers=auth_headers)

    payload = {
        "code": "ITM-TEST-001",
        "name": "Test Item",
        "uom": "pcs",
        "category": "Raw",
        "attribute_ids": []
    }
    res = client.post("/api/items", json=payload, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["code"] == "ITM-TEST-001"
    assert data["id"] is not None

def test_duplicate_item_code(client, auth_headers):
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)
    payload = {
        "code": "ITM-DUP",
        "name": "Original",
        "uom": "pcs",
        "category": "Raw"
    }
    client.post("/api/items", json=payload, headers=auth_headers)

    # Try again
    res = client.post("/api/items", json=payload, headers=auth_headers)
    assert res.status_code == 400


def test_create_item_with_packaging_factors(client, auth_headers):
    uom_res = client.post("/api/uoms", json={"name": "kg-pkg-test"}, headers=auth_headers)
    assert uom_res.status_code == 200
    uom_id = uom_res.json()["id"]
    factor_res = client.post(f"/api/uoms/{uom_id}/factors", json={"value": 5.0, "label": "box"}, headers=auth_headers)
    assert factor_res.status_code == 200
    factor_id = factor_res.json()["id"]
    res = client.post("/api/items", json={
        "code": "PKG-TEST-001", "name": "Packaging Test Item",
        "uom": "kg-pkg-test", "attribute_ids": [],
        "packaging_factor_ids": [factor_id],
    }, headers=auth_headers)
    assert res.status_code == 200
    assert factor_id in [str(fid) for fid in res.json()["packaging_factor_ids"]]


def test_update_item_packaging_factors(client, auth_headers):
    uom_res = client.post("/api/uoms", json={"name": "kg-upd-test"}, headers=auth_headers)
    uom_id = uom_res.json()["id"]
    f1 = client.post(f"/api/uoms/{uom_id}/factors", json={"value": 5.0, "label": "box"}, headers=auth_headers).json()["id"]
    f2 = client.post(f"/api/uoms/{uom_id}/factors", json={"value": 1.25, "label": "cone"}, headers=auth_headers).json()["id"]
    item_res = client.post("/api/items", json={
        "code": "PKG-UPD-001", "name": "Update Test Item",
        "uom": "kg-upd-test", "attribute_ids": [],
        "packaging_factor_ids": [f1],
    }, headers=auth_headers)
    item_id = item_res.json()["id"]
    upd_res = client.put(f"/api/items/{item_id}", json={"packaging_factor_ids": [f2]}, headers=auth_headers)
    assert upd_res.status_code == 200
    ids = [str(x) for x in upd_res.json()["packaging_factor_ids"]]
    assert f2 in ids and f1 not in ids


def test_item_no_packaging_factors_by_default(client, auth_headers):
    client.post("/api/uoms", json={"name": "pcs-nopack"}, headers=auth_headers)
    res = client.post("/api/items", json={
        "code": "PKG-NONE-001", "name": "No Packaging Item",
        "uom": "pcs-nopack", "attribute_ids": [],
    }, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["packaging_factor_ids"] == []
