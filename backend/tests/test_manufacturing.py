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


def test_nested_wo_serialization(client, auth_headers):
    """Regression test for the MissingGreenlet bug.

    Without the sa_attributes.set_committed_value fix, GET /api/work-orders
    would 500 because unloaded child_wos on L2 WOs triggered async lazy-load.
    """
    import uuid
    wo_code = f"NEST-WO-L0-{str(uuid.uuid4())[:8]}"

    # Step 1: Create UOM via sync route (rollback-managed, used by other sync setup)
    client.post("/api/uoms", json={"name": "pcs"}, headers=auth_headers)

    # Steps 1-2: Create location + 3 items directly in real DB so async routes can find them
    # POST /api/items has a pre-existing MissingGreenlet response bug (audit commit expires
    # the item before serialization). Similarly, POST /api/locations is sync (rollback session)
    # but WO creation uses get_async_db and needs the location in the real DB.
    from app.db.session import engine as _engine
    from sqlalchemy.orm import Session as _SASession
    from app.models.item import Item as _Item
    from app.models.location import Location as _Location
    _real_conn = _engine.connect()
    _real_sess = _SASession(_real_conn)
    try:
        if not _real_sess.query(_Location).filter_by(code="NEST-WH").first():
            _real_sess.add(_Location(code="NEST-WH", name="Nest Warehouse"))
        for code, name in [("NEST-RAW", "Nest Raw Material"), ("NEST-SUB", "Nest Sub-Assembly"), ("NEST-FIN", "Nest Finished Good")]:
            if not _real_sess.query(_Item).filter_by(code=code).first():
                _real_sess.add(_Item(code=code, name=name, uom="pcs"))
        _real_sess.commit()
    finally:
        _real_sess.close()
        _real_conn.close()

    # Step 3: Create 2 BOMs
    client.post("/api/boms", json={
        "code": "BOM-NEST-SUB", "item_code": "NEST-SUB", "qty": 1,
        "lines": [{"item_code": "NEST-RAW", "qty": 2}]
    }, headers=auth_headers)
    client.post("/api/boms", json={
        "code": "BOM-NEST-FIN", "item_code": "NEST-FIN", "qty": 1,
        "lines": [{"item_code": "NEST-SUB", "qty": 1}]
    }, headers=auth_headers)

    # Step 4: Stock NEST-RAW at NEST-WH
    client.post("/api/items/stock", json={
        "item_code": "NEST-RAW", "location_code": "NEST-WH", "qty": 100, "reference_id": "NEST-INIT"
    }, headers=auth_headers)

    # Step 5: Find BOM-NEST-FIN's id
    boms = client.get("/api/boms", headers=auth_headers).json()
    bom_nest_fin = next((b for b in boms if b["code"] == "BOM-NEST-FIN"), None)
    assert bom_nest_fin is not None, "BOM-NEST-FIN not found"
    bom_nest_fin_id = bom_nest_fin["id"]

    # Step 6: Create top-level WO with create_nested=true
    wo_res = client.post("/api/work-orders", json={
        "code": wo_code,
        "bom_id": bom_nest_fin_id,
        "location_code": "NEST-WH",
        "source_location_code": "NEST-WH",
        "qty": 1.0,
        "due_date": "2026-12-31",
        "create_nested": True
    }, headers=auth_headers)
    assert wo_res.status_code == 200

    nest_wo = None
    try:
        # Step 7: Critical assertion — GET /api/work-orders must not 500
        list_res = client.get("/api/work-orders", headers=auth_headers)
        assert list_res.status_code == 200, (
            f"GET /api/work-orders returned {list_res.status_code}: {list_res.text}"
        )

        # Step 8: Find the top-level WO and verify child_wos structure
        all_wos = list_res.json().get("items", [])
        nest_wo = next((w for w in all_wos if w.get("code") == wo_code), None)
        assert nest_wo is not None, f"{wo_code} not found in work order list"
        assert "child_wos" in nest_wo, f"{wo_code} is missing child_wos key"
        assert isinstance(nest_wo["child_wos"], list), "child_wos should be a list"
        assert len(nest_wo["child_wos"]) >= 1, "Nested WO creation should produce at least one child"
        for child in nest_wo["child_wos"]:
            assert "child_wos" in child, f"Child WO {child.get('code')} is missing child_wos key"
            assert isinstance(child["child_wos"], list), f"child_wos on child WO {child.get('code')} should be a list"

    finally:
        # Step 9: Cleanup — async routes write to real DB, must clean up explicitly
        try:
            all_wos_for_cleanup = client.get("/api/work-orders", headers=auth_headers).json().get("items", [])
            for wo in all_wos_for_cleanup:
                if isinstance(wo.get("code"), str) and wo["code"].startswith("NEST-WO"):
                    client.delete(f"/api/work-orders/{wo['id']}", headers=auth_headers)
        except Exception:
            pass

        # Also delete child WOs by ID (their codes don't start with NEST-WO)
        try:
            for child in nest_wo.get("child_wos", []) if nest_wo else []:
                client.delete(f"/api/work-orders/{child['id']}", headers=auth_headers)
                for grandchild in child.get("child_wos", []):
                    client.delete(f"/api/work-orders/{grandchild['id']}", headers=auth_headers)
        except Exception:
            pass

        try:
            from app.db.session import engine as _eng2
            from sqlalchemy.orm import Session as _S2
            from app.models.item import Item as _I2
            from app.models.location import Location as _L2
            _c2 = _eng2.connect()
            _s2 = _S2(_c2)
            try:
                _s2.query(_I2).filter(_I2.code.in_(["NEST-FIN", "NEST-SUB", "NEST-RAW"])).delete(synchronize_session=False)
                _s2.query(_L2).filter(_L2.code == "NEST-WH").delete(synchronize_session=False)
                _s2.commit()
            finally:
                _s2.close()
                _c2.close()
        except Exception:
            pass

        try:
            all_boms = client.get("/api/boms", headers=auth_headers).json()
            if isinstance(all_boms, list):
                for bom in all_boms:
                    if bom.get("code") in ("BOM-NEST-SUB", "BOM-NEST-FIN"):
                        client.delete(f"/api/boms/{bom['id']}", headers=auth_headers)
        except Exception:
            pass
