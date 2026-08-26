def test_create_uom(client, auth_headers):
    res = client.post("/api/uoms", json={"name": "TestUnit"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["name"] == "TestUnit"

def test_create_category(client, auth_headers):
    res = client.post("/api/categories", json={"name": "TestCat"}, headers=auth_headers)
    assert res.status_code == 201
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


def test_create_item_with_packaging_factors(client, auth_headers, async_db_session, _app_client):
    # UOMs go through the sync router, items through the async one — two
    # separate non-committing connections in tests, so a factor referencing
    # UOMs created via the HTTP endpoint would be invisible (and its FK
    # unsatisfiable) from the item-creation call. Build the whole chain
    # directly on the async session the item read will actually use.
    from app.models.uom import UOM, UOMFactor

    async def _seed():
        base_uom = UOM(name="kg-pkg-test")
        box_uom = UOM(name="box-pkg-test")
        async_db_session.add_all([base_uom, box_uom])
        await async_db_session.flush()
        factor = UOMFactor(from_uom_id=base_uom.id, to_uom_id=box_uom.id, value=5.0)
        async_db_session.add(factor)
        await async_db_session.flush()
        return str(factor.id)

    factor_id = _app_client.portal.call(_seed)
    res = client.post("/api/items", json={
        "code": "PKG-TEST-001", "name": "Packaging Test Item",
        "uom": "kg-pkg-test", "attribute_ids": [],
        "packaging_factor_ids": [factor_id],
    }, headers=auth_headers)
    assert res.status_code == 200
    assert factor_id in [str(fid) for fid in res.json()["packaging_factor_ids"]]


def test_update_item_packaging_factors(client, auth_headers, async_db_session, _app_client):
    # Same cross-domain visibility constraint as test_create_item_with_packaging_factors.
    from app.models.uom import UOM, UOMFactor

    async def _seed():
        base_uom = UOM(name="kg-upd-test")
        box_uom = UOM(name="box-upd-test")
        cone_uom = UOM(name="cone-upd-test")
        async_db_session.add_all([base_uom, box_uom, cone_uom])
        await async_db_session.flush()
        f1 = UOMFactor(from_uom_id=base_uom.id, to_uom_id=box_uom.id, value=5.0)
        f2 = UOMFactor(from_uom_id=base_uom.id, to_uom_id=cone_uom.id, value=1.25)
        async_db_session.add_all([f1, f2])
        await async_db_session.flush()
        return str(f1.id), str(f2.id)

    f1, f2 = _app_client.portal.call(_seed)
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
