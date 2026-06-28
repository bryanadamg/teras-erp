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
