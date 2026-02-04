def test_audit_logging(client, auth_headers):
    # Perform an action
    client.post("/api/uoms", json={"name": "AuditUnit"}, headers=auth_headers)
    
    # Check Logs
    res = client.get("/api/audit-logs", headers=auth_headers)
    assert res.status_code == 200
    logs = res.json()
    assert len(logs) > 0
    
    # Verify latest log
    latest = logs[0]
    assert latest["action"] == "CREATE"
    assert "AuditUnit" in str(latest["changes"]) or "AuditUnit" in latest["details"]
