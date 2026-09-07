"""A dyeing WO is cut with its bath already planned.

The Kartu Kerja is printed off the work order, before anyone stands at the vessel.
Until the bath volume existed the card could only print the recipe's g/L *rates* —
`dyeingPrintData.ts` fell back to a "bath not set" note — so the number the operator
actually weighs was computed after the fact. WO creation now plans the bath (the
planner's litres, else `DyeRecipe.liquor_ratio` x the load) and freezes the dose sheet
against it.

Two invariants this file exists to hold:

- a PLANNED bath must not read as a running vessel. `dyeing_run_service.derive_status`
  treats `volume_air_liters` as "this machine is going", so the plan lives in its own
  column and the run stays PENDING until the floor fills it.
- the frozen sheet is not a ceiling: the real bath re-prices every row nobody has
  weighed against yet, and none of the rows they have.
"""
import uuid


def _setup(client, auth_headers, session, *, liquor_ratio, wo_qty=100.0, bath=None):
    """A DYEING work order created through the real recipe gate. Returns (wo_id, run)."""
    from app.models.location import Location
    from app.models.routing import WorkCenter

    tag = str(uuid.uuid4())[:8]
    client.post("/api/uoms", json={"name": "kg"}, headers=auth_headers)

    loc = Location(code=f"WH-BP-{tag}", name="Dyehouse Store")
    wc = WorkCenter(code=f"DYE-BP-{tag}", name="Jet BP", center_type="DYEING", node_type="MACHINE")

    async def _seed():
        session.add_all([loc, wc])
        await session.flush()
        return str(loc.id), str(wc.id)

    loc_id, wc_id = client.portal.call(_seed)

    # A Color Library shade is the modern match path: recipe.color_id == mo.color_id.
    color = client.post("/api/colors", json={"code": f"CLR-{tag}", "name": "Navy BP"}, headers=auth_headers)
    assert color.status_code == 200, color.text
    color_id = color.json()["id"]

    # One g/L line (dose follows the bath) and one owf line (dose follows the load),
    # so the test can tell which basis moved when the bath changes.
    chem = client.post("/api/items", json={"code": f"CHEM-GL-{tag}", "name": "Levelling Agent", "uom": "kg"}, headers=auth_headers)
    owf = client.post("/api/items", json={"code": f"CHEM-OWF-{tag}", "name": "Navy Dyestuff", "uom": "kg"}, headers=auth_headers)
    recipe = client.post("/api/dye-recipes", json={
        "code": f"DR-{tag}", "name": "Navy BP", "color_id": color_id,
        "liquor_ratio": liquor_ratio,
        "lines": [
            {"item_id": chem.json()["id"], "qty_per_liter": 2.0, "qty_per_100kg": None, "sort_order": 1},
            {"item_id": owf.json()["id"], "qty_per_100kg": 3.0, "qty_per_liter": None, "sort_order": 2},
        ],
    }, headers=auth_headers)
    assert recipe.status_code == 200, recipe.text

    client.post("/api/items", json={"code": f"BP-FG-{tag}", "name": "Dyed Fabric", "uom": "kg"}, headers=auth_headers)
    client.post("/api/items", json={"code": f"BP-RM-{tag}", "name": "Greige", "uom": "kg"}, headers=auth_headers)
    client.post("/api/boms", json={
        "code": f"BOM-BP-{tag}", "item_code": f"BP-FG-{tag}", "qty": 1,
        "lines": [{"item_code": f"BP-RM-{tag}", "qty": 1, "percentage": 100.0}],
    }, headers=auth_headers)
    bom = next(b for b in client.get("/api/boms", headers=auth_headers).json() if b["code"] == f"BOM-BP-{tag}")

    mo = client.post("/api/manufacturing-orders", json={
        "code": f"MO-BP-{tag}", "bom_id": bom["id"], "qty": wo_qty,
        "location_code": f"WH-BP-{tag}", "source_location_code": f"WH-BP-{tag}",
    }, headers=auth_headers)
    assert mo.status_code == 200, mo.text
    mo_id = mo.json()["id"]
    res = client.patch(f"/api/manufacturing-orders/{mo_id}/color", json={"color_id": color_id}, headers=auth_headers)
    assert res.status_code == 200, res.text

    body = {
        "manufacturing_order_id": mo_id, "qty": wo_qty, "work_center_id": wc_id,
        "input_location_id": loc_id, "output_location_id": loc_id,
    }
    if bath is not None:
        body["bath_volume_liters"] = bath
    wo = client.post("/api/work-orders", json=body, headers=auth_headers)
    assert wo.status_code == 200, wo.text
    wo_id = wo.json()["id"]

    runs = client.get(f"/api/dyeing-runs?work_order_id={wo_id}", headers=auth_headers)
    assert runs.status_code == 200, runs.text
    rows = runs.json()
    assert len(rows) == 1
    return wo_id, rows[0]


def test_the_recipe_ratio_plans_the_bath_and_leaves_the_vessel_idle(client, auth_headers, async_db_session):
    """1:8 on a 100 kg load is an 800 L plan — and a plan is not a running machine."""
    _wo_id, run = _setup(client, auth_headers, async_db_session, liquor_ratio=8)

    assert float(run["planned_volume_air_liters"]) == 800.0
    assert float(run["effective_bath_liters"]) == 800.0
    # The two invariants that keep a plan from lying about the floor.
    assert run["volume_air_liters"] is None
    assert run["started_at"] is None
    assert run["status"] == "PENDING"


def test_the_frozen_sheet_carries_grams_for_both_bases(client, auth_headers, async_db_session):
    """The card's whole purpose: weighable numbers, per basis, before the vessel."""
    _wo_id, run = _setup(client, auth_headers, async_db_session, liquor_ratio=8)

    doses = {c["item_name"]: float(c["planned_qty"]) for c in run["chemicals"]}
    assert doses["Levelling Agent"] == 1600.0   # 2 g/L x 800 L
    assert doses["Navy Dyestuff"] == 3.0        # 3 per 100 kg x 100 kg
    assert all(float(c["actual_qty"]) == 0 for c in run["chemicals"])


def test_a_typed_volume_beats_the_recipe_ratio(client, auth_headers, async_db_session):
    """This batch runs short-liquor: the planner's figure is the bath, not the standard."""
    _wo_id, run = _setup(client, auth_headers, async_db_session, liquor_ratio=8, bath=500)

    assert float(run["planned_volume_air_liters"]) == 500.0
    doses = {c["item_name"]: float(c["planned_qty"]) for c in run["chemicals"]}
    assert doses["Levelling Agent"] == 1000.0   # 2 g/L x 500 L
    assert doses["Navy Dyestuff"] == 3.0        # owf is untouched by the bath


def test_no_ratio_and_no_typed_volume_plans_nothing(client, auth_headers, async_db_session):
    """A recipe with no standard ratio cannot be planned for — and must not invent one.
    The run is cut bare, exactly as before this feature."""
    _wo_id, run = _setup(client, auth_headers, async_db_session, liquor_ratio=None)

    assert run["planned_volume_air_liters"] is None
    assert run["effective_bath_liters"] is None
    assert run["chemicals"] == []
    assert run["status"] == "PENDING"


def test_the_real_bath_reprices_the_planned_sheet(client, auth_headers, async_db_session):
    """The floor filled 900 L against an 800 L plan. Every g/L row follows the water,
    the owf row does not, and only now is the vessel running."""
    _wo_id, run = _setup(client, auth_headers, async_db_session, liquor_ratio=8)

    res = client.post(f"/api/dyeing-runs/{run['id']}/start", json={"volume_air_liters": 900}, headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()

    assert float(body["volume_air_liters"]) == 900.0
    assert float(body["planned_volume_air_liters"]) == 800.0   # the plan is history, not overwritten
    assert float(body["effective_bath_liters"]) == 900.0
    assert body["status"] == "IN_PROGRESS"
    doses = {c["item_name"]: float(c["planned_qty"]) for c in body["chemicals"]}
    assert doses["Levelling Agent"] == 1800.0   # 2 g/L x 900 L
    assert doses["Navy Dyestuff"] == 3.0


def test_a_recorded_dose_is_never_repriced(client, auth_headers, async_db_session):
    """Once a chemical is in the vessel, rewriting its plan would erase the variance."""
    _wo_id, run = _setup(client, auth_headers, async_db_session, liquor_ratio=8)
    gl_row = next(c for c in run["chemicals"] if c["item_name"] == "Levelling Agent")

    res = client.patch(f"/api/dyeing-runs/{run['id']}/chemicals", json={
        "chemicals": [{"item_id": gl_row["item_id"], "actual_qty": 1550}],
    }, headers=auth_headers)
    assert res.status_code == 200, res.text

    res = client.post(f"/api/dyeing-runs/{run['id']}/start", json={"volume_air_liters": 900}, headers=auth_headers)
    assert res.status_code == 200, res.text
    row = next(c for c in res.json()["chemicals"] if c["item_name"] == "Levelling Agent")
    assert float(row["actual_qty"]) == 1550.0
    assert float(row["planned_qty"]) == 1600.0   # still the 800 L plan it was weighed against
