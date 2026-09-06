"""Dyeing vessel performance monitoring: rate calc for a batch process.

Deliberately NOT shared with `weaving_service`. A loom runs continuously for days
and is measured in kg against a calendar of working days; a dye batch fits inside
one shift and is measured in yards against the clock. The two formulas look alike
and are not:

    weaving:  kg/day  = 1440 * rate_g_min * lines / 1000, over WORKING DAYS
    dyeing:   yd/min  = rpm * yards_per_rev * lines,      over WALL-CLOCK MINUTES

`yards_per_rev` is machine geometry (how far the rope advances on one revolution
of the reel) and lives on the WorkCenter. `rpm` and `lines` are chosen per load
and live on the DyeingRun. Both halves must be present for an efficiency to mean
anything, so either one missing yields None -- never 0, which would read as a
vessel producing nothing rather than a machine nobody has measured yet.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.manufacturing import MOCompletion
from app.services import packing_service

# A dye batch that is on the machine right now. PENDING has no `started_at`, so it
# has no clock and cannot report a rate -- it still shows on the card, as the load
# the vessel is waiting to run (see derive_machine_status).
ACTIVE_RUN_STATUSES = ("IN_PROGRESS",)

# Work centre types that are dyeing vessels. `CELUP` is the Indonesian name and is
# already treated as a synonym in work_queue_service and api/manufacturing.
DYEING_CENTER_TYPES = ("DYEING", "CELUP")

# -- Vessel state ------------------------------------------------------------
# A dye vessel has no equivalent of the loom's warp prep (STAGED/DRAW_IN/TUNING):
# there is nothing mounted to it that outlives a batch. So all three states are
# DERIVED from the runs alone and nothing is stored on the work center.
MACHINE_STATUS_IDLE = "IDLE"
MACHINE_STATUS_LOADED = "LOADED"
MACHINE_STATUS_RUNNING = "RUNNING"


def derive_machine_status(has_active_run: bool, has_pending_run: bool) -> str:
    """The single definition of what a vessel card shows."""
    if has_active_run:
        return MACHINE_STATUS_RUNNING
    if has_pending_run:
        return MACHINE_STATUS_LOADED
    return MACHINE_STATUS_IDLE


# -- Rate primitives ---------------------------------------------------------

def yards_per_minute(rpm: Optional[float], yards_per_rev: Optional[float],
                     lines: Optional[int]) -> Optional[float]:
    """Theoretical rope speed in yards/min, or None when a factor is unmeasured.

    None rather than 0: a missing machine constant means "nobody has measured this
    vessel", which the card must show as a dash. Returning 0 would make every
    downstream division silently produce a null efficiency for the wrong reason.
    """
    try:
        r = float(rpm or 0)
        ypr = float(yards_per_rev or 0)
        n = int(lines or 0)
    except (TypeError, ValueError):
        return None
    if r <= 0 or ypr <= 0 or n <= 0:
        return None
    return r * ypr * n


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Naive timestamps read back from postgres are UTC; make the arithmetic safe."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Drop the tzinfo, having normalised to UTC, for comparison against a
    TIMESTAMP WITHOUT TIME ZONE column.

    `DyeingRun.started_at` is `DateTime(timezone=True)` while `MOCompletion.created_at`
    is naive — binding an aware bound against the naive column makes asyncpg raise
    "can't subtract offset-naive and offset-aware datetimes" rather than comparing
    wrongly, so this is a hard failure, not a silent one. Both sides are UTC.
    """
    aware = _aware(dt)
    return None if aware is None else aware.astimezone(timezone.utc).replace(tzinfo=None)


def elapsed_minutes(started_at: Optional[datetime], completed_at: Optional[datetime],
                    now: datetime) -> float:
    """Wall-clock minutes the batch has been on the machine.

    A finished run is frozen at its own completion; a live one runs to `now`, so
    the card's efficiency moves every poll. No calendar and no pause intervals:
    a dye batch spans a single shift, so there is no overnight gap to subtract and
    nothing to park while another order is prioritised (the two things
    weaving_service exists to handle).
    """
    start = _aware(started_at)
    if start is None:
        return 0.0
    end = _aware(completed_at) or now
    if end <= start:
        return 0.0
    return (end - start).total_seconds() / 60.0


def to_yards(qty: Optional[float], item) -> Optional[float]:
    """A logged production qty, in the item's stock UOM, restated in yards.

    Delegates to packing_service so the g/y rule has exactly one home -- including
    its refusal to convert `gsm`, which needs the fabric width.
    """
    if qty is None or item is None:
        return None
    return packing_service.to_yards(
        qty,
        getattr(item, "uom", None),
        getattr(item, "weight_per_unit", None),
        getattr(item, "weight_unit", None),
    )


# -- Actual output -----------------------------------------------------------

async def sum_actual_qty(db: AsyncSession, work_center_id, mo_id,
                         started_at: Optional[datetime],
                         completed_at: Optional[datetime],
                         now: datetime) -> float:
    """Logged production on this vessel, for this MO, inside the batch's own window.

    A DATETIME window, unlike the weaving monitor's date window: several batches
    run on one vessel in a single day, so bucketing by date would pool this run's
    output with the one before it.

    `work_center_id` is safe to filter on because `add_mo_completion` defaults it to
    the WO's machine (Alembic a4c6e8b0d2f5) -- the operator picker is an override,
    the WO is the dispatch record.
    """
    start = _naive_utc(started_at)
    if start is None:
        return 0.0
    end = _naive_utc(completed_at) or _naive_utc(now)
    q = (
        select(func.coalesce(func.sum(MOCompletion.qty_completed), 0))
        .where(MOCompletion.work_center_id == work_center_id)
        .where(MOCompletion.mo_id == mo_id)
        .where(MOCompletion.rejected == False)  # noqa: E712
        .where(MOCompletion.created_at >= start)
        .where(MOCompletion.created_at <= end)
    )
    return float((await db.execute(q)).scalar() or 0)


# -- Run metrics -------------------------------------------------------------

def _missing_inputs(rpm, yards_per_rev, lines) -> list:
    missing = []
    if not rpm:
        missing.append("rpm")
    if not yards_per_rev:
        missing.append("yards_per_rev")
    if not lines:
        missing.append("lines")
    return missing


def compute_run_metrics(run, yards_per_rev: Optional[float], actual_qty: float,
                        item, now: datetime) -> dict:
    """Every displayed number for one dye batch. Pure -- caller supplies the actuals.

    `actual_yards` is None (not 0) when the item carries no g/y factor: the cloth
    was dyed, we simply cannot say how many yards it was. Efficiency follows it to
    None so the card shows a dash rather than accusing the vessel of producing
    nothing.
    """
    lines = int(run.lines or 0)
    rpm = float(run.rpm) if run.rpm is not None else None
    eff_target = float(run.target_efficiency_pct or 0)

    yd_min = yards_per_minute(rpm, yards_per_rev, lines)
    elapsed = elapsed_minutes(run.started_at, run.completed_at, now)

    theoretical = (yd_min * elapsed) if yd_min is not None else None
    actual_yards = to_yards(actual_qty, item)
    planned_yards = to_yards(float(run.substrate_qty or 0), item)

    efficiency = None
    if theoretical is not None and theoretical > 0 and actual_yards is not None:
        efficiency = actual_yards / theoretical * 100.0
    actual_rate = (actual_yards / elapsed) if (actual_yards is not None and elapsed > 0) else None

    return {
        "lines": lines,
        "rpm": rpm,
        "yards_per_rev": float(yards_per_rev) if yards_per_rev is not None else None,
        "target_efficiency_pct": eff_target,
        "target_yd_per_min": round(yd_min, 3) if yd_min is not None else None,
        "target_eff_yd_per_min": round(yd_min * eff_target / 100.0, 3) if yd_min is not None else None,
        "elapsed_minutes": round(elapsed, 1),
        "theoretical_yards": round(theoretical, 1) if theoretical is not None else None,
        "actual_qty": round(float(actual_qty or 0), 3),
        "actual_yards": round(actual_yards, 1) if actual_yards is not None else None,
        "planned_yards": round(planned_yards, 1) if planned_yards is not None else None,
        "actual_rate_yd_min": round(actual_rate, 2) if actual_rate is not None else None,
        "efficiency_pct": round(efficiency, 1) if efficiency is not None else None,
        "on_target": (efficiency >= eff_target) if efficiency is not None else None,
        # Why there is no number, so the card can say which input is missing rather
        # than showing an unexplained dash.
        "missing_rate_inputs": _missing_inputs(rpm, yards_per_rev, lines),
        "missing_gy_factor": actual_yards is None,
    }
