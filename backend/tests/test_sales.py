import pytest

def test_sales_order_crud(client, auth_headers):
    # Setup: Create an item
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)
    item = client.post("/api/items", json={
        "code": "SO-ITEM", "name": "SO Item", "uom": "pcs", "category": "Product"
    }, headers=auth_headers).json()

    # 1. Create Sales Order (Customer PO)
    so_payload = {
        "po_number": "PO-12345",
        "customer_name": "Acme Corp",
        "order_date": "2026-02-04T00:00:00",
        "lines": [
            {
                "item_id": item["id"],
                "qty": 50.0,
                "due_date": "2026-03-01T00:00:00",
                "attribute_value_ids": []
            }
        ]
    }
    res = client.post("/api/sales-orders", json=so_payload, headers=auth_headers)
    assert res.status_code == 200
    so = res.json()
    assert so["po_number"] == "PO-12345"
    assert len(so["lines"]) == 1

    # 2. Get List
    res_list = client.get("/api/sales-orders", headers=auth_headers)
    orders = res_list.json()
    assert any(o["id"] == so["id"] for o in orders)

    # 3. Delete
    del_res = client.delete(f"/api/sales-orders/{so['id']}", headers=auth_headers)
    assert del_res.status_code == 200
