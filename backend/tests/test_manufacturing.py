def test_work_order_lifecycle(client, auth_headers):
    # Setup Data
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)
    client.post("/api/locations", json={"code": "WH-MAIN", "name": "Main Warehouse"}, headers=auth_headers)
    
    fg = client.post("/api/items", json={"code": "WO-FG", "name": "WO Product", "uom": "pcs"}, headers=auth_headers).json()
    rm = client.post("/api/items", json={"code": "WO-RM", "name": "WO Material", "uom": "pcs"}, headers=auth_headers).json()
    
    # Stock RM
    client.post("/api/items/stock", json={
        "item_code": "WO-RM", "location_code": "WH-MAIN", "qty": 100, "reference_id": "INIT"
    }, headers=auth_headers)

    # BOM
    client.post("/api/boms", json={
        "code": "BOM-WO", "item_code": "WO-FG", "qty": 1,
        "lines": [{"item_code": "WO-RM", "qty": 10}]
    }, headers=auth_headers)
    
    bom = client.get("/api/boms", headers=auth_headers).json()[0]

    # Create WO
    wo_payload = {
        "code": "WO-001",
        "bom_id": bom["id"],
        "location_code": "WH-MAIN",
        "source_location_code": "WH-MAIN",
        "qty": 2.0,
        "due_date": "2026-12-31"
    }
    wo_res = client.post("/api/work-orders", json=wo_payload, headers=auth_headers)
    assert wo_res.status_code == 200
    wo_id = wo_res.json()["id"]

    # Start
    client.put(f"/api/work-orders/{wo_id}/status?status=IN_PROGRESS", headers=auth_headers)
    
    # Complete (Should deduct stock)
    client.put(f"/api/work-orders/{wo_id}/status?status=COMPLETED", headers=auth_headers)
    
    # Verify Stock Deduction
    # 2 WO * 10 RM = 20 RM consumed. 100 - 20 = 80 remaining.
    balance = client.get("/api/stock/balance", headers=auth_headers).json()
    rm_stock = next(b for b in balance if b["item_id"] == rm["id"])
    assert float(rm_stock["qty"]) == 80.0

    # Delete Completed WO (Allowed now)
    del_res = client.delete(f"/api/work-orders/{wo_id}", headers=auth_headers)
    assert del_res.status_code == 200
