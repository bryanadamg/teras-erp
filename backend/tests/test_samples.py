import pytest

def test_sample_request_lifecycle(client, auth_headers):
    # Setup: Create an item to base the sample on
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)
    item = client.post("/api/items", json={
        "code": "BASE-ITEM", "name": "Base Item", "uom": "pcs", "category": "Raw"
    }, headers=auth_headers).json()

    # 1. Create Sample Request
    sample_payload = {
        "base_item_id": item["id"],
        "notes": "Testing recursive sampling",
        "attribute_value_ids": []
    }
    res = client.post("/api/samples", json=sample_payload, headers=auth_headers)
    assert res.status_code == 200
    sample = res.json()
    assert sample["status"] == "DRAFT"
    assert "SMP-" in sample["code"]

    # 2. Update Status
    res_status = client.put(f"/api/samples/{sample['id']}/status?status=IN_PRODUCTION", headers=auth_headers)
    assert res_status.status_code == 200
    
    # 3. Verify in list
    res_list = client.get("/api/samples", headers=auth_headers)
    samples = res_list.json()
    assert any(s["id"] == sample["id"] and s["status"] == "IN_PRODUCTION" for s in samples)

    # 4. Delete
    del_res = client.delete(f"/api/samples/{sample['id']}", headers=auth_headers)
    assert del_res.status_code == 200
