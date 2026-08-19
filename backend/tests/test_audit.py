def test_audit_logging(client, auth_headers):
    # Perform an action
    client.post("/api/uoms", json={"name": "AuditUnit"}, headers=auth_headers)
    
    # Check Logs
    res = client.get("/api/audit-logs", headers=auth_headers)
    assert res.status_code == 200
    # Paginated envelope, not a bare list — `logs[0]` on the response dict raised
    # KeyError (and `len(dict) > 0` passed vacuously by counting its keys).
    body = res.json()
    logs = body["items"]
    assert body["total"] > 0
    assert len(logs) > 0

    # Verify latest log
    latest = logs[0]
    assert latest["action"] == "CREATE"
    assert "AuditUnit" in str(latest["changes"]) or "AuditUnit" in latest["details"]
