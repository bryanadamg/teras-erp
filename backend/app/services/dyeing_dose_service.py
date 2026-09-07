"""Dye dosing: a recipe rate x this batch's bath volume / substrate weight.

The bath volume is the operator's input — `DyeingRun.volume_air_liters`, where
"air" is Indonesian for water, so the column is the *water* volume of the bath and
not an airflow figure. It is what turns a recipe rate into a weighable dose.

Two bases coexist and are NOT interchangeable:

  PER_LITER   `qty_per_liter` (g/L)  ->  dose_g = g/L * bath_volume_liters
              Bath concentration. Salt, soda ash, alkali, leveling agent: what
              matters is how concentrated the water is, so the same shade in a
              bigger bath needs proportionally more.
  PER_100KG   `qty_per_100kg`        ->  dose = rate * substrate_qty / 100
              Weight-on-fabric (owf). Dyestuff: shade depth follows the weight of
              the cloth, not the water, so the dose must NOT move with volume.

A line declares its basis by which column it fills, and filling both is rejected at
recipe save (`assert_single_basis`). The client-side calc this replaces silently
preferred g/L and dropped the owf figure, so a recipe that looked fully entered
dosed its dye off the wrong number.

`liquor_ratio` and `volume_air_liters` are the same fact twice (ratio = L of water
per kg of substrate), so `solve_bath` derives whichever the operator left blank
rather than letting two typed copies disagree.

Lives in a service because several surfaces need the identical number: the run
create form's preview, the Complete Run dose sheet, and later the recipe print view
and chemical MRP. Same rule as netting_service — never re-derive it at a call site.
"""

BASIS_PER_LITER = "PER_LITER"
BASIS_PER_100KG = "PER_100KG"

# g/L * L = grams. The recipe form labels the per-litre column "g/L", so grams is
# the unit of a PER_LITER dose and the only one we can name with certainty.
PER_LITER_DOSE_UNIT = "g"


def _f(v) -> float | None:
    """Numeric column -> float. Decimal(0) is a real rate, so only None is absent."""
    return None if v is None else float(v)


def line_basis(line) -> str | None:
    """Which rate column this recipe line is dosed from, or None if neither is set."""
    if _f(getattr(line, "qty_per_liter", None)) is not None:
        return BASIS_PER_LITER
    if _f(getattr(line, "qty_per_100kg", None)) is not None:
        return BASIS_PER_100KG
    return None


def assert_single_basis(lines) -> int | None:
    """1-based index of the first line that fills BOTH rate columns, else None.

    Callers turn this into a 422: a line dosed two ways has no defined dose, and
    picking one silently is how the owf figure used to get dropped.
    """
    for idx, ln in enumerate(lines or [], start=1):
        per_l = _f(getattr(ln, "qty_per_liter", None))
        per_kg = _f(getattr(ln, "qty_per_100kg", None))
        if per_l is not None and per_kg is not None:
            return idx
    return None


def solve_bath(substrate_qty, bath_volume_liters, liquor_ratio) -> tuple[float | None, float | None]:
    """(bath_volume_liters, liquor_ratio) with the missing one derived.

    ratio = litres of water per kg of substrate, so volume = substrate * ratio.
    An explicitly entered volume always wins: it is a measurement off the machine,
    while the ratio is a target. When both are given the ratio is recomputed from
    the volume so the stored pair can never contradict itself.
    """
    sub = _f(substrate_qty)
    vol = _f(bath_volume_liters)
    ratio = _f(liquor_ratio)

    if vol is not None and vol > 0:
        return vol, (round(vol / sub, 2) if sub else ratio)
    if ratio is not None and ratio > 0 and sub:
        return round(sub * ratio, 2), ratio
    return vol, ratio


def effective_bath(run) -> float | None:
    """The bath a run's doses are weighed against.

    The actual volume wins the moment the floor records one; before that the
    planner's `planned_volume_air_liters` stands in, which is the whole point of
    planning it — a Kartu Kerja printed at dispatch has to carry grams, not a note
    saying the bath is unset. Never merge the two columns: only the actual one means
    "this vessel is running" (see services/dyeing_run_service).
    """
    actual = _f(getattr(run, "volume_air_liters", None))
    if actual is not None and actual > 0:
        return actual
    planned = _f(getattr(run, "planned_volume_air_liters", None))
    return planned if (planned is not None and planned > 0) else None


def compute_line_dose(line, substrate_qty, bath_volume_liters) -> float | None:
    """Dose for one recipe line, in the unit implied by its basis. None = not dosable
    (no rate on the line, or the input its basis needs was not supplied)."""
    basis = line_basis(line)
    if basis == BASIS_PER_LITER:
        vol = _f(bath_volume_liters)
        if vol is None:
            return None
        return _f(line.qty_per_liter) * vol
    if basis == BASIS_PER_100KG:
        sub = _f(substrate_qty)
        if sub is None:
            return None
        return _f(line.qty_per_100kg) * sub / 100
    return None


def compute_doses(recipe, substrate_qty, bath_volume_liters) -> list[dict]:
    """Dose rows for every line of `recipe`, in the recipe's own sort order.

    `recipe.lines` must be eager-loaded with `item` and `uom` (async sessions cannot
    lazy-load). Rows are returned even when the dose is None, so the UI can show the
    operator *which* line is still waiting on a bath volume instead of hiding it.
    """
    rows: list[dict] = []
    for ln in sorted(recipe.lines or [], key=lambda l: (l.sort_order or 0)):
        basis = line_basis(ln)
        dose = compute_line_dose(ln, substrate_qty, bath_volume_liters)
        uom_name = ln.uom.name if getattr(ln, "uom", None) else None
        rows.append({
            "line_id": ln.id,
            "item_id": ln.item_id,
            "item_code": ln.item.code if getattr(ln, "item", None) else None,
            "item_name": ln.item.name if getattr(ln, "item", None) else None,
            "chemical_type": ln.chemical_type,
            "sort_order": ln.sort_order or 0,
            "basis": basis,
            "qty_per_liter": _f(ln.qty_per_liter),
            "qty_per_100kg": _f(ln.qty_per_100kg),
            "dose": dose,
            # PER_LITER is g/L * L, so grams. PER_100KG carries the line's own UOM,
            # which is frequently unset — blank is honest, a guessed "kg" is not.
            "dose_unit": PER_LITER_DOSE_UNIT if basis == BASIS_PER_LITER else (uom_name or None),
            # Convenience for the floor: baths are dispensed in kg on most scales.
            "dose_kg": (dose / 1000) if (dose is not None and basis == BASIS_PER_LITER) else None,
            "uom_id": ln.uom_id,
            "uom_name": uom_name,
        })
    return rows
