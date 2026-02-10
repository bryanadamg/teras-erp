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
