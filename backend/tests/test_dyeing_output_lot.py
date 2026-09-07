"""One output lot per physical dye batch.

`complete_dyeing_run` used to mint its own `Batch` from a typed
`output_batch_number` while `add_mo_completion` separately minted the `DYE-` lot,
so every dyed batch existed twice as two unlinked rows. Now the WO completion is
the only minter and the run adopts that lot.

Setup notes for this harness:
- The WO is created without a work center and its `work_center_id` is written
  directly afterwards: creating one on a DYEING center hard-gates on a matching
  active DyeRecipe (422), which is a different feature's setup cost.
- Everything else is seeded on `async_db_session` through `client.portal`, because
  the sync and async halves sit on separate non-committing connections (see the
  conftest note) — a location seeded over `POST /api/locations` is invisible to the
  async manufacturing routes.
"""
import uuid

from app.models.dyeing_setting import DyeingRun


def _setup_dyeing_wo(client, auth_headers, session, wo_qty=2.0, runs=2):
    """A started dyeing WO with `runs` bath records and no output lot yet."""
    from app.models.location import Location
    from app.models.routing import WorkCenter
    from app.models.work_order import WorkOrder

    tag = str(uuid.uuid4())[:8]
    client.post("/api/uoms", json={"name": "kg"}, headers=auth_headers)

    loc = Location(code=f"WH-DYE-{tag}", name="Dyehouse Store")
    wc = WorkCenter(code=f"DYE-WC-{tag}", name="Jet 1", center_type="DYEING", node_type="MACHINE")

    async def _seed_loc_wc():
        session.add_all([loc, wc])
        await session.flush()
        return str(loc.id), str(wc.id)

    loc_id, wc_id = client.portal.call(_seed_loc_wc)

    client.post("/api/items", json={"code": f"DY-FG-{tag}", "name": "Dyed Fabric", "uom": "kg"}, headers=auth_headers)
    client.post("/api/items", json={"code": f"DY-RM-{tag}", "name": "Greige", "uom": "kg"}, headers=auth_headers)
    client.post("/api/items/stock", json={
        "item_code": f"DY-RM-{tag}", "location_code": f"WH-DYE-{tag}", "qty": 100, "reference_id": "INIT",
    }, headers=auth_headers)
    client.post("/api/boms", json={
        "code": f"BOM-DY-{tag}", "item_code": f"DY-FG-{tag}", "qty": 1,
        "lines": [{"item_code": f"DY-RM-{tag}", "qty": 1, "percentage": 100.0}],
    }, headers=auth_headers)
    bom = next(
        b for b in client.get("/api/boms", headers=auth_headers).json()
        if b["code"] == f"BOM-DY-{tag}"
    )

    mo = client.post("/api/manufacturing-orders", json={
        "code": f"MO-DY-{tag}",
        "bom_id": bom["id"],
        "location_code": f"WH-DYE-{tag}",
        "source_location_code": f"WH-DYE-{tag}",
        "qty": wo_qty,
    }, headers=auth_headers)
    assert mo.status_code == 200, mo.text
    mo_id = mo.json()["id"]

    wo = client.post("/api/work-orders", json={
        "manufacturing_order_id": mo_id,
        "qty": wo_qty,
        "input_location_id": loc_id,
        "output_location_id": loc_id,
    }, headers=auth_headers)
    assert wo.status_code == 200, wo.text
    wo_id = wo.json()["id"]

    async def _attach():
        wo_row = await session.get(WorkOrder, uuid.UUID(wo_id))
        wo_row.work_center_id = uuid.UUID(wc_id)
        ids = []
        for n in range(1, runs + 1):
            run = DyeingRun(
                work_order_id=uuid.UUID(wo_id),
                run_number=n,
                substrate_qty=1.0,
                status="PENDING",
            )
            session.add(run)
            await session.flush()
            ids.append(str(run.id))
        return ids

    run_ids = client.portal.call(_attach)
    client.put(f"/api/work-orders/{wo_id}/status?status=IN_PROGRESS", headers=auth_headers)
    return mo_id, wo_id, run_ids


def _lot_on_run(client, session, run_id):
    async def _read():
        run = await session.get(DyeingRun, uuid.UUID(run_id))
        await session.refresh(run)
        return None if run.output_batch_id is None else str(run.output_batch_id)

    return client.portal.call(_read)


def _log(client, auth_headers, mo_id, wo_id, qty):
    """Log production on the WO. Returns nothing — read the lots back with
    `_logged_lots`: the route's own MO payload is rebuilt from the identity map and
    does not carry this session's fresh completion rows."""
    res = client.post(f"/api/manufacturing-orders/{mo_id}/completions", json={
        "qty_completed": qty,
        "work_order_id": wo_id,
    }, headers=auth_headers)
    assert res.status_code == 200, res.text


def _logged_lots(client, session, wo_id):
    """(batch id, lot number) per non-rejected completion on the WO, oldest first."""
    from sqlalchemy import select
    from app.models.batch import Batch
    from app.models.manufacturing import MOCompletion

    async def _read():
        res = await session.execute(
            select(MOCompletion.output_batch_id, Batch.batch_number)
            .outerjoin(Batch, Batch.id == MOCompletion.output_batch_id)
            .filter(
                MOCompletion.work_order_id == uuid.UUID(wo_id),
                MOCompletion.rejected == False,  # noqa: E712
            )
            .order_by(MOCompletion.created_at)
        )
        return [(str(bid) if bid else None, num) for bid, num in res.all()]

    return client.portal.call(_read)


def test_production_log_hands_its_dye_lot_to_the_run(client, auth_headers, async_db_session):
    mo_id, wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=2)

    _log(client, auth_headers, mo_id, wo_id, 1.0)
    lots = _logged_lots(client, async_db_session, wo_id)
    assert len(lots) == 1
    batch_id, lot_no = lots[0]
    assert lot_no and lot_no.startswith("DYE-"), lot_no

    # Run 1 adopts the lot the completion minted — no second Batch row anywhere.
    assert _lot_on_run(client, async_db_session, run_ids[0]) == batch_id
    # Run 2 is a separate bath and stays unclaimed until its own bag is logged.
    assert _lot_on_run(client, async_db_session, run_ids[1]) is None


def test_second_bath_claims_the_second_lot(client, auth_headers, async_db_session):
    mo_id, wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=2)

    _log(client, auth_headers, mo_id, wo_id, 1.0)
    _log(client, auth_headers, mo_id, wo_id, 1.0)
    lots = _logged_lots(client, async_db_session, wo_id)
    assert len(lots) == 2
    first, second = lots[0][0], lots[1][0]
    assert first != second

    assert _lot_on_run(client, async_db_session, run_ids[0]) == first
    assert _lot_on_run(client, async_db_session, run_ids[1]) == second


def test_extra_bags_off_one_bath_do_not_move_the_link(client, auth_headers, async_db_session):
    """Several bags off ONE bath keep the first lot on the run; the rest trace
    through BatchConsumption + Batch.source_wo_id, as weaving's bags already do."""
    mo_id, wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)

    _log(client, auth_headers, mo_id, wo_id, 1.0)
    first = _logged_lots(client, async_db_session, wo_id)[0][0]
    _log(client, auth_headers, mo_id, wo_id, 1.0)

    assert _lot_on_run(client, async_db_session, run_ids[0]) == first


def test_completing_a_run_needs_no_lot_number(client, auth_headers, async_db_session):
    """The old payload required a typed lot and minted a Batch for it. Closing the
    bath now records shade + chemicals only, and picks up the WO's lot."""
    mo_id, wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)
    _log(client, auth_headers, mo_id, wo_id, 1.0)
    batch_id, lot_no = _logged_lots(client, async_db_session, wo_id)[0]

    res = client.post(f"/api/dyeing-runs/{run_ids[0]}/complete", json={
        "shade_result": "PASS", "chemicals": [],
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "COMPLETED"
    assert body["output_batch_id"] == batch_id
    assert body["output_batch_number"] == lot_no


def test_run_completed_before_any_output_log_has_no_lot(client, auth_headers, async_db_session):
    """Nothing has come out of the vessel yet, so there is no lot to name — and the
    run must not invent one. The next production log claims it."""
    mo_id, wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)

    res = client.post(f"/api/dyeing-runs/{run_ids[0]}/complete", json={
        "shade_result": "PASS", "chemicals": [],
    }, headers=auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["output_batch_id"] is None

    _log(client, auth_headers, mo_id, wo_id, 1.0)
    batch_id, _lot_no = _logged_lots(client, async_db_session, wo_id)[0]
    assert _lot_on_run(client, async_db_session, run_ids[0]) == batch_id


def test_naming_a_lot_that_does_not_exist_is_rejected(client, auth_headers, async_db_session):
    """Legacy callers may still send output_batch_number; it may only name an
    existing lot. Minting here is what produced the duplicate rows."""
    _mo_id, _wo_id, run_ids = _setup_dyeing_wo(client, auth_headers, async_db_session, runs=1)

    res = client.post(f"/api/dyeing-runs/{run_ids[0]}/complete", json={
        "shade_result": "PASS", "chemicals": [], "output_batch_number": "DYE-NOPE-0001",
    }, headers=auth_headers)
    assert res.status_code == 400, res.text
    assert "DYE-NOPE-0001" in res.json()["detail"]
