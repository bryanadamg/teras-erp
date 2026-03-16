import pytest


def test_stock_location_crud(client, auth_headers):
    """Location routes use get_db (sync) — rollback fixture handles cleanup."""

    # 1. Create location
    resp = client.post(
        "/api/locations",
        json={"code": "LOC-TEST-001", "name": "Test Location"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    location = resp.json()
    assert "id" in location
    assert location["code"] == "LOC-TEST-001"
    location_id = location["id"]

    # 2. List locations — our location should appear
    resp = client.get("/api/locations", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    locations = resp.json()
    codes = [loc["code"] for loc in locations]
    assert "LOC-TEST-001" in codes

    # 3. Delete location
    resp = client.delete(f"/api/locations/{location_id}", headers=auth_headers)
    assert resp.status_code == 200, resp.text

    # 4. List again — location should be gone
    resp = client.get("/api/locations", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    remaining_codes = [loc["code"] for loc in resp.json()]
    assert "LOC-TEST-001" not in remaining_codes


def test_stock_movement(client, auth_headers):
    """
    POST /api/items/stock uses get_async_db — it opens a separate real-DB connection
    and cannot see data that only exists inside the rollback fixture's uncommitted
    transaction.  Therefore we insert the Item and Location directly into the real DB
    (outside the rollback session) so the async route can find them, then clean up
    those rows at the end.
    """
    import uuid as _uuid
    from app.db.session import engine
    from sqlalchemy.orm import Session as SASession
    from app.models.item import Item
    from app.models.location import Location
    from app.models.stock_ledger import StockLedger
    from app.models.stock_balance import StockBalance

    suffix = str(_uuid.uuid4())[:8]
    item_code = f"STKMV-ITEM-{suffix}"
    location_code = f"STKMV-WH-{suffix}"
    reference_id = f"STKMV-INIT-{suffix}"

    real_conn = engine.connect()
    real_session = SASession(real_conn)
    item_id = None

    try:
        # Insert Item and Location directly into the real DB so the async route
        # (which uses its own connection) can see the committed rows.
        location = Location(code=location_code, name=f"Stock Test WH {suffix}")
        real_session.add(location)
        item = Item(code=item_code, name=f"Stock Movement Test Item {suffix}", uom="pcs")
        real_session.add(item)
        real_session.commit()
        real_session.refresh(item)
        real_session.refresh(location)
        item_id = str(item.id)

        # 1. POST stock entry — async route, now able to find the committed item/location
        resp = client.post(
            "/api/items/stock",
            json={
                "item_code": item_code,
                "location_code": location_code,
                "qty": 50.0,
                "reference_id": reference_id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text

        # 2. GET /api/stock/balance — find our item's balance entry
        resp = client.get("/api/stock/balance", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        balances = resp.json()
        item_balances = [b for b in balances if b["item_id"] == item_id]
        assert len(item_balances) >= 1, (
            f"No balance entry found for item_id={item_id}. Balances: {balances}"
        )
        total_qty = sum(float(b["qty"]) for b in item_balances)
        assert total_qty >= 50.0, f"Expected qty >= 50, got {total_qty}"

        # 3. GET /api/stock — paginated ledger; verify structure and find our entry by item_id
        resp = client.get("/api/stock", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        ledger = resp.json()
        assert "items" in ledger
        assert "total" in ledger
        assert "page" in ledger
        assert "size" in ledger

        # The API stores reference_id as "manual_entry" regardless of payload;
        # search by item_id instead which is reliable.
        matching = [
            entry for entry in ledger["items"]
            if entry.get("item_id") == item_id
        ]
        assert len(matching) >= 1, (
            f"No ledger entry found for item_id={item_id}"
        )
        assert float(matching[0]["qty_change"]) > 0, (
            f"Expected positive qty_change, got {matching[0]['qty_change']}"
        )

    finally:
        # Delete stock entries created by the async route, then delete item and location.
        try:
            real_session.query(StockLedger).filter(
                StockLedger.item_id == item.id
            ).delete(synchronize_session=False)
            real_session.query(StockBalance).filter(
                StockBalance.item_id == item.id
            ).delete(synchronize_session=False)
            real_session.query(Item).filter(Item.id == item.id).delete(
                synchronize_session=False
            )
            real_session.query(Location).filter(
                Location.code == location_code
            ).delete(synchronize_session=False)
            real_session.commit()
        except Exception:
            real_session.rollback()
        finally:
            real_session.close()
            real_conn.close()
