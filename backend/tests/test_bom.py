def test_create_bom_and_integrity(client, auth_headers):
    # 1. Create Items
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)
    
    # Finished Good
    fg = client.post("/api/items", json={
        "code": "FG-001", "name": "Finished Good", "uom": "pcs", "category": "Product"
    }, headers=auth_headers).json()
    
    # Component
    comp = client.post("/api/items", json={
        "code": "RM-001", "name": "Raw Material", "uom": "pcs", "category": "Material"
    }, headers=auth_headers).json()

    # 2. Create BOM
    bom_payload = {
        "code": "BOM-FG-001",
        "description": "Test Recipe",
        "item_code": "FG-001",
        "qty": 1.0,
        "lines": [
            {
                "item_code": "RM-001",
                "qty": 2.0,
                "attribute_value_ids": []
            }
        ]
    }
    bom_res = client.post("/api/boms", json=bom_payload, headers=auth_headers)
    assert bom_res.status_code == 200
    bom_id = bom_res.json()["id"]

    # 3. Try to Delete Component (Should Fail)
    del_res = client.delete(f"/api/items/{comp['id']}", headers=auth_headers)
    assert del_res.status_code == 400
    assert "still being used" in del_res.json()["detail"]

    # 4. Delete BOM
    del_bom_res = client.delete(f"/api/boms/{bom_id}", headers=auth_headers)
    assert del_bom_res.status_code == 200

    # 5. Now Component can be deleted
    del_res_2 = client.delete(f"/api/items/{comp['id']}", headers=auth_headers)
    assert del_res_2.status_code == 200

def test_nested_bom_structure(client, auth_headers):
    # Setup: Level 1 (Raw) -> Level 2 (Sub) -> Level 3 (Final)
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)
    
    # 1. Create items
    raw = client.post("/api/items", json={"code": "RAW", "name": "Raw", "uom": "pcs"}, headers=auth_headers).json()
    sub = client.post("/api/items", json={"code": "SUB", "name": "Sub", "uom": "pcs"}, headers=auth_headers).json()
    fin = client.post("/api/items", json={"code": "FIN", "name": "Final", "uom": "pcs"}, headers=auth_headers).json()

    # 2. Create sub-BOM (SUB is made of RAW)
    client.post("/api/boms", json={
        "code": "BOM-SUB", "item_code": "SUB", "qty": 1,
        "lines": [{"item_code": "RAW", "qty": 5}]
    }, headers=auth_headers)

    # 3. Create final-BOM (FIN is made of SUB)
    client.post("/api/boms", json={
        "code": "BOM-FIN", "item_code": "FIN", "qty": 1,
        "lines": [{"item_code": "SUB", "qty": 2}]
    }, headers=auth_headers)

    # 4. Verify Tree in List
    res = client.get("/api/boms", headers=auth_headers)
    boms = res.json()
    fin_bom = next(b for b in boms if b["code"] == "BOM-FIN")
    assert fin_bom["lines"][0]["item_id"] == sub["id"]

