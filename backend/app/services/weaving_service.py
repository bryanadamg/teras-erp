"""Work-center performance monitoring: loom-efficiency calc + production calendar.

Faithful to the client's formula:
  target_100_per_day_kg = (24*60 min) * rate_per_line_g_min * lines / 1000
  target_eff_per_day_kg  = target_100_per_day_kg * target_efficiency_pct/100
  theoretical_100_kg     = target_100_per_day_kg * elapsed_working_days
  efficiency_pct         = actual_kg / theoretical_100_kg * 100   (e.g. 50/129.6 = 38.5%)

A "working day" runs 24h (continuous 3-shift weaving). The production calendar
(working_weekdays + holidays, per machine) decides which calendar days count.
"""
from datetime import date, timedelta
from math import ceil
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.manufacturing import MOCompletion

MINUTES_PER_DAY = 24 * 60
_MAX_PROJECT_DAYS = 3650  # 10y guard against runaway walks


# ── Loom prep state machine ──────────────────────────────────────────────────
# What the floor does to a loom between "warp is up" and "start the run":
#   IDLE → STAGED → DRAW_IN → TUNING → RUNNING
# IDLE/STAGED/RUNNING are DERIVED (from mounted beams and the active run) and
# DRAW_IN/TUNING are the two manual button steps stored on WorkCenter.prep_status.
# Deriving the ends is what keeps the card honest: dismount the warp mid-prep and
# the loom drops straight back to IDLE with no stale "Tuning" left over.
LOOM_STATUS_IDLE = "IDLE"
LOOM_STATUS_STAGED = "STAGED"
LOOM_STATUS_DRAW_IN = "DRAW_IN"
LOOM_STATUS_TUNING = "TUNING"
LOOM_STATUS_RUNNING = "RUNNING"

# Manual steps only, in order. The step before DRAW_IN is the derived STAGED.
LOOM_PREP_STEPS = (LOOM_STATUS_DRAW_IN, LOOM_STATUS_TUNING)
# Predecessor each manual step may be advanced from.
_PREP_PREDECESSOR = {
    LOOM_STATUS_DRAW_IN: LOOM_STATUS_STAGED,
    LOOM_STATUS_TUNING: LOOM_STATUS_DRAW_IN,
}


def derive_loom_status(prep_status: Optional[str], mounted_pcs: int, beam_slots: int,
                       has_active_run: bool) -> str:
    """The single definition of what a loom card shows.

    A run beats everything (RUNNING). Otherwise the warp decides whether prep has
    even begun: below the machine's beam_slots target the loom is not staged, so a
    stored DRAW_IN/TUNING is ignored rather than trusted.
    """
    if has_active_run:
        return LOOM_STATUS_RUNNING
    staged = int(mounted_pcs or 0) >= max(1, int(beam_slots or 1))
    if not staged:
        return LOOM_STATUS_IDLE
    if prep_status in LOOM_PREP_STEPS:
        return prep_status
    return LOOM_STATUS_STAGED


def next_loom_step(current: str) -> Optional[str]:
    """Manual step that may be taken from `current`, or None (nothing to click)."""
    for step, predecessor in _PREP_PREDECESSOR.items():
        if predecessor == current:
            return step
    return None


def prep_transition_error(target: Optional[str], current: str) -> Optional[str]:
    """Why `current → target` is not allowed, or None when it is.

    `target=None` is the reset (back to plain STAGED) and is allowed from either
    manual step, so a mis-click never traps a loom.
    """
    if target is None:
        if current in LOOM_PREP_STEPS:
            return None
        return f"Nothing to reset: loom is {current}"
    if target not in LOOM_PREP_STEPS:
        return f"Unknown loom step '{target}'"
    if current == LOOM_STATUS_RUNNING:
        return "Loom is running; stop the run first"
    if current == LOOM_STATUS_IDLE:
        return "No warp staged on this loom yet"
    expected = _PREP_PREDECESSOR[target]
    if current != expected:
        return f"{target} requires the loom to be {expected} (it is {current})"
    return None


# ── Calendar primitives ──────────────────────────────────────────────────────

def _is_working_day(d: date, weekdays: set, holidays: set) -> bool:
    return d.weekday() in weekdays and d not in holidays


def count_working_days(weekdays, holidays, start: date, end: date) -> int:
    """Count working days in [start, end] inclusive per this machine's calendar."""
    if not weekdays or end < start:
        return 0
    wd = set(weekdays)
    hol = set(holidays or [])
    n = 0
    d = start
    # Bound the loop; production runs never span >10y.
    for _ in range(_MAX_PROJECT_DAYS):
        if d > end:
            break
        if _is_working_day(d, wd, hol):
            n += 1
        d += timedelta(days=1)
    return n


def add_working_days(weekdays, holidays, start: date, n: int) -> Optional[date]:
    """Return the date of the n-th working day counting from `start` (inclusive).

    n<=0 returns `start`. Returns None if the calendar has no working weekdays.
    """
    wd = set(weekdays)
    if not wd:
        return None
    if n <= 0:
        return start
    hol = set(holidays or [])
    count = 0
    d = start
    for _ in range(_MAX_PROJECT_DAYS):
        if _is_working_day(d, wd, hol):
            count += 1
            if count >= n:
                return d
        d += timedelta(days=1)
    return None


def walk_to_target(machines: list, target: float, start_date: date, initial: float = 0.0) -> Optional[date]:
    """Walk the calendar day-by-day until cumulative output reaches `target`.

    `machines`: list of dicts {weekdays:set, holidays:set, daily_kg:float}.
    Each machine adds daily_kg on days its own calendar marks as working — so
    machines with different weekdays/holidays combine correctly (2-machine MO).
    Returns the calendar date the target is met, or None if no machine produces.
    """
    if target <= 0:
        return start_date
    cum = float(initial)
    if cum >= target:
        return start_date
    active = [m for m in machines if m.get("daily_kg", 0) > 0 and m.get("weekdays")]
    if not active:
        return None
    d = start_date
    for _ in range(_MAX_PROJECT_DAYS):
        day_out = sum(
            m["daily_kg"] for m in active
            if _is_working_day(d, set(m["weekdays"]), set(m.get("holidays") or []))
        )
        if day_out > 0:
            cum += day_out
            if cum >= target:
                return d
        d += timedelta(days=1)
    return None


# ── Actual output ────────────────────────────────────────────────────────────

async def sum_actual_kg(db: AsyncSession, work_center_id, mo_id, start_date: date, end_date: Optional[date]) -> float:
    """Sum logged MOCompletion qty on this machine, for this MO, within the run window."""
    q = (
        select(func.coalesce(func.sum(MOCompletion.qty_completed), 0))
        .where(MOCompletion.work_center_id == work_center_id)
        .where(MOCompletion.mo_id == mo_id)
        .where(MOCompletion.rejected == False)  # noqa: E712
        .where(MOCompletion.created_at >= start_date)
    )
    if end_date:
        q = q.where(MOCompletion.created_at < end_date + timedelta(days=1))
    result = await db.execute(q)
    return float(result.scalar() or 0)


# ── Run metrics ──────────────────────────────────────────────────────────────

def target_100_per_day_kg(rate_per_line_g_min: float, lines: int) -> float:
    return MINUTES_PER_DAY * float(rate_per_line_g_min) * int(lines) / 1000.0


def compute_run_metrics(run, actual_kg: float, weekdays, holidays, today: date) -> dict:
    """All displayed numbers for one run. Pure — caller supplies actual_kg + calendar."""
    lines = int(run.lines or 0)
    rate = float(run.rate_per_line_g_min or 0)
    eff_target = float(run.target_efficiency_pct or 0)

    t100_day = target_100_per_day_kg(rate, lines)
    t_eff_day = t100_day * eff_target / 100.0

    window_end = run.end_date if run.end_date else today
    if window_end > today:
        window_end = today
    elapsed = count_working_days(weekdays, holidays, run.start_date, window_end)

    theoretical_100 = t100_day * elapsed
    efficiency_pct = (actual_kg / theoretical_100 * 100.0) if theoretical_100 > 0 else None
    actual_daily_rate = (actual_kg / elapsed) if elapsed > 0 else None

    return {
        "lines": lines,
        "rate_per_line_g_min": rate,
        "target_efficiency_pct": eff_target,
        "target_100_per_day_kg": round(t100_day, 3),
        "target_eff_per_day_kg": round(t_eff_day, 3),
        "elapsed_working_days": elapsed,
        "theoretical_100_kg": round(theoretical_100, 3),
        "actual_kg": round(actual_kg, 3),
        "efficiency_pct": round(efficiency_pct, 1) if efficiency_pct is not None else None,
        "actual_daily_rate_kg": round(actual_daily_rate, 3) if actual_daily_rate is not None else None,
        "on_target": (efficiency_pct >= eff_target) if efficiency_pct is not None else None,
    }
