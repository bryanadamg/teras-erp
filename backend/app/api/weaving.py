from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, cast, String
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import date
from math import ceil
import uuid

from app.db.session import get_async_db
from app.models.weaving import WeavingRun, WorkCenterHoliday
from app.models.routing import WorkCenter
from app.models.manufacturing import ManufacturingOrder
from app.models.batch import Batch, BeamMount
from app.models.stock_balance import StockBalance
from app.models.auth import User
from app.api.auth import get_current_user, require_permission
from app.schemas import (
    WeavingRunCreate, WeavingRunUpdate, WeavingRunResponse,
    WorkCenterHolidayCreate, WorkCenterHolidayResponse, WorkCenterCalendarUpdate,
)
from app.services import audit_service, weaving_service, id_holidays
from app.core.ws_manager import manager

router = APIRouter()

DEFAULT_WEEKDAYS = [0, 1, 2, 3, 4]


async def _load_calendar(db: AsyncSession, wc: WorkCenter):
    """Return (weekdays:list[int], holidays:list[date]) for a work center."""
    weekdays = wc.working_weekdays if wc.working_weekdays else DEFAULT_WEEKDAYS
    res = await db.execute(
        select(WorkCenterHoliday.holiday_date).where(WorkCenterHoliday.work_center_id == wc.id)
    )
    holidays = [r[0] for r in res.all()]
    return weekdays, holidays


async def _get_wc(db: AsyncSession, wc_id: str) -> WorkCenter:
    res = await db.execute(select(WorkCenter).where(WorkCenter.id == wc_id))
    wc = res.scalars().first()
    if not wc:
        raise HTTPException(status_code=404, detail="Work center not found")
    return wc


async def _run_actual_kg(db: AsyncSession, run: WeavingRun) -> float:
    if run.actual_qty_override is not None:
        return float(run.actual_qty_override)
    return await weaving_service.sum_actual_kg(
        db, run.work_center_id, run.mo_id, run.start_date, run.end_date
    )


# ── Weaving runs ─────────────────────────────────────────────────────────────

@router.post("/weaving-runs", response_model=WeavingRunResponse)
async def create_weaving_run(
    payload: WeavingRunCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    wc = await _get_wc(db, str(payload.work_center_id))
    mo_res = await db.execute(select(ManufacturingOrder).where(ManufacturingOrder.id == payload.mo_id))
    mo = mo_res.scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    run = WeavingRun(
        work_center_id=payload.work_center_id,
        mo_id=payload.mo_id,
        lines=payload.lines,
        rate_per_line_g_min=payload.rate_per_line_g_min,
        target_efficiency_pct=payload.target_efficiency_pct,
        start_date=payload.start_date,
        notes=payload.notes,
        status="RUNNING",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    await audit_service.log_activity(
        db, current_user.id, "CREATE", "weaving_run", str(run.id),
        details=f"Start run {mo.code} on {wc.code} ({payload.lines} lines)",
    )
    await manager.broadcast({"type": "weaving_run", "action": "start", "work_center_id": str(wc.id)})
    return run


@router.patch("/weaving-runs/{run_id}", response_model=WeavingRunResponse)
async def update_weaving_run(
    run_id: str,
    payload: WeavingRunUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    res = await db.execute(select(WeavingRun).where(WeavingRun.id == run_id))
    run = res.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Weaving run not found")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(run, field, value)
    await db.commit()
    await db.refresh(run)

    await audit_service.log_activity(
        db, current_user.id, "UPDATE", "weaving_run", str(run.id),
        details="Updated weaving run", changes=data,
    )
    await manager.broadcast({"type": "weaving_run", "action": "update", "work_center_id": str(run.work_center_id)})
    return run


@router.post("/weaving-runs/{run_id}/stop", response_model=WeavingRunResponse)
async def stop_weaving_run(
    run_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    res = await db.execute(select(WeavingRun).where(WeavingRun.id == run_id))
    run = res.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Weaving run not found")
    run.status = "DONE"
    if not run.end_date:
        run.end_date = date.today()
    await db.commit()
    await db.refresh(run)

    await audit_service.log_activity(
        db, current_user.id, "UPDATE", "weaving_run", str(run.id), details="Stopped weaving run",
    )
    await manager.broadcast({"type": "weaving_run", "action": "stop", "work_center_id": str(run.work_center_id)})
    return run


@router.delete("/weaving-runs/{run_id}")
async def delete_weaving_run(
    run_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    res = await db.execute(select(WeavingRun).where(WeavingRun.id == run_id))
    run = res.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Weaving run not found")
    wc_id = str(run.work_center_id)
    await db.delete(run)
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "DELETE", "weaving_run", run_id, details="Deleted weaving run",
    )
    await manager.broadcast({"type": "weaving_run", "action": "delete", "work_center_id": wc_id})
    return {"status": "success"}


# ── Monitor grid (all weaving machines, at a glance) ────────────────────────

def _machine_payload(wc: WorkCenter, run: Optional[WeavingRun], actual: Optional[float], weekdays, holidays, today: date) -> dict:
    payload = {"id": str(wc.id), "code": wc.code, "name": wc.name, "center_type": wc.center_type, "active_run": None}
    if run:
        m = weaving_service.compute_run_metrics(run, actual, weekdays, holidays, today)
        mo = run.mo
        payload["active_run"] = {
            "id": str(run.id),
            "mo_code": mo.code if mo else None,
            "item_code": mo.item_code if mo else None,
            "item_name": mo.item_name if mo else None,
            "target_qty": float(mo.qty) if mo else None,
            "status": run.status,
            **{k: m[k] for k in (
                "efficiency_pct", "target_efficiency_pct", "on_target", "actual_kg",
                "theoretical_100_kg", "actual_daily_rate_kg", "elapsed_working_days", "lines",
            )},
        }
    return payload


@router.get("/weaving/monitor")
async def weaving_monitor(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    res = await db.execute(
        select(WorkCenter)
        .where(WorkCenter.center_type == "WEAVING")
        .where(WorkCenter.parent_id.isnot(None))
        .order_by(WorkCenter.code)
    )
    machines = res.scalars().all()
    if not machines:
        return {"machines": [], "total": 0, "running": 0, "avg_efficiency_pct": None}

    machine_ids = [wc.id for wc in machines]

    # Batch holidays for every machine in one query instead of one query per
    # machine (_load_calendar was called per-wc in a loop before this).
    hol_res = await db.execute(
        select(WorkCenterHoliday.work_center_id, WorkCenterHoliday.holiday_date)
        .where(WorkCenterHoliday.work_center_id.in_(machine_ids))
    )
    holidays_by_wc: dict = {}
    for wc_id, hdate in hol_res.all():
        holidays_by_wc.setdefault(wc_id, []).append(hdate)

    # Batch the active RUNNING run per machine in one query instead of one query
    # per machine. Ordered so the first row seen per work_center_id is the most
    # recently created one — matches the old per-machine ".first()" semantics.
    run_res = await db.execute(
        select(WeavingRun)
        .options(selectinload(WeavingRun.mo).selectinload(ManufacturingOrder.item))
        .where(WeavingRun.work_center_id.in_(machine_ids))
        .where(WeavingRun.status == "RUNNING")
        .order_by(WeavingRun.work_center_id, WeavingRun.created_at.desc())
    )
    active_run_by_wc: dict = {}
    for run in run_res.scalars().all():
        active_run_by_wc.setdefault(run.work_center_id, run)

    # Warp up on each loom. A beam is a machine resource shared by every WO that
    # runs there, so "what is mounted" is a property of the machine and belongs on
    # its card. Batched with the remaining-kg balance in one query — one round trip
    # for the whole grid, not one per loom.
    mount_res = await db.execute(
        select(BeamMount, Batch.batch_number, Batch.ends, StockBalance.qty)
        .join(Batch, BeamMount.batch_id == Batch.id)
        .outerjoin(
            StockBalance,
            and_(
                StockBalance.item_id == BeamMount.item_id,
                StockBalance.location_id == BeamMount.location_id,
                StockBalance.variant_key == "",
                StockBalance.batch_key == cast(BeamMount.batch_id, String),
            ),
        )
        .where(BeamMount.work_center_id.in_(machine_ids), BeamMount.dismounted_at.is_(None))
        .order_by(BeamMount.work_center_id, BeamMount.mounted_at)
    )
    beams_by_wc: dict = {}
    for mount, beam_number, ends, qty in mount_res.all():
        beams_by_wc.setdefault(mount.work_center_id, []).append({
            "mount_id": str(mount.id),
            "batch_id": str(mount.batch_id),
            "beam_number": beam_number,
            "ends": ends,
            "remaining": float(qty or 0),
            "mounted_at": mount.mounted_at,
            "mounted_by": mount.mounted_by,
        })

    out = []
    for wc in machines:
        weekdays = wc.working_weekdays if wc.working_weekdays else DEFAULT_WEEKDAYS
        holidays = holidays_by_wc.get(wc.id, [])
        run = active_run_by_wc.get(wc.id)
        actual = await _run_actual_kg(db, run) if run else None
        payload = _machine_payload(wc, run, actual, weekdays, holidays, today)
        beams = beams_by_wc.get(wc.id, [])
        payload["beam_slots"] = max(1, int(wc.beam_slots or 1))
        payload["mounted_beams"] = beams
        payload["mounted_pcs"] = sum(1 for b in beams if b["remaining"] > 1e-9)
        payload["mounted_kg"] = sum(b["remaining"] for b in beams)
        out.append(payload)

    running = sum(1 for m in out if m["active_run"])
    effs = [m["active_run"]["efficiency_pct"] for m in out if m["active_run"] and m["active_run"]["efficiency_pct"] is not None]
    avg_eff = round(sum(effs) / len(effs), 1) if effs else None
    return {"machines": out, "total": len(out), "running": running, "avg_efficiency_pct": avg_eff}


@router.get("/weaving/id-holidays")
async def id_national_holidays(
    year: int = Query(...),
    current_user: User = Depends(get_current_user),
):
    return {"year": year, "holidays": id_holidays.holidays_for_year(year)}


# ── Performance report ───────────────────────────────────────────────────────

async def _run_payload(db: AsyncSession, run: WeavingRun, weekdays, holidays, today: date) -> dict:
    actual = await _run_actual_kg(db, run)
    metrics = weaving_service.compute_run_metrics(run, actual, weekdays, holidays, today)
    mo = run.mo
    return {
        "id": str(run.id),
        "work_center_id": str(run.work_center_id),
        "mo_id": str(run.mo_id),
        "mo_code": mo.code if mo else None,
        "item_code": mo.item_code if mo else None,
        "item_name": mo.item_name if mo else None,
        "target_qty": float(mo.qty) if mo else None,
        "start_date": run.start_date,
        "end_date": run.end_date,
        "status": run.status,
        "actual_qty_override": float(run.actual_qty_override) if run.actual_qty_override is not None else None,
        "notes": run.notes,
        **metrics,
    }


@router.get("/work-centers/{wc_id}/performance")
async def work_center_performance(
    wc_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    wc = await _get_wc(db, wc_id)
    weekdays, holidays = await _load_calendar(db, wc)
    today = date.today()

    res = await db.execute(
        select(WeavingRun)
        .options(selectinload(WeavingRun.mo).selectinload(ManufacturingOrder.item))
        .where(WeavingRun.work_center_id == wc.id)
        .order_by(WeavingRun.created_at.desc())
    )
    runs = res.scalars().all()

    active = next((r for r in runs if r.status == "RUNNING"), None)
    active_payload = None
    mo_projection = None

    if active:
        active_payload = await _run_payload(db, active, weekdays, holidays, today)
        mo_projection = await _project_mo(db, active.mo_id, today)

    history = [
        await _run_payload(db, r, weekdays, holidays, today)
        for r in runs if r.id != (active.id if active else None)
    ]

    return {
        "work_center": {
            "id": str(wc.id), "code": wc.code, "name": wc.name, "center_type": wc.center_type,
        },
        "calendar": {"working_weekdays": weekdays, "holidays": [
            {"id": None, "holiday_date": h} for h in holidays
        ]},
        "active_run": active_payload,
        "mo_projection": mo_projection,
        "history": history,
    }


async def _project_mo(db: AsyncSession, mo_id, today: date) -> Optional[dict]:
    """Project target & reality completion dates across ALL active runs of this MO."""
    mo_res = await db.execute(
        select(ManufacturingOrder).options(selectinload(ManufacturingOrder.item))
        .where(ManufacturingOrder.id == mo_id)
    )
    mo = mo_res.scalars().first()
    if not mo:
        return None
    target_qty = float(mo.qty)

    runs_res = await db.execute(
        select(WeavingRun).where(WeavingRun.mo_id == mo_id).where(WeavingRun.status == "RUNNING")
    )
    runs = runs_res.scalars().all()
    if not runs:
        return None

    target_machines, reality_machines = [], []
    total_target_daily = 0.0
    total_actual = 0.0
    earliest_start = None
    machines_meta = []

    for run in runs:
        wc = await _get_wc(db, str(run.work_center_id))
        weekdays, holidays = await _load_calendar(db, wc)
        actual = await _run_actual_kg(db, run)
        m = weaving_service.compute_run_metrics(run, actual, weekdays, holidays, today)

        total_target_daily += m["target_eff_per_day_kg"]
        total_actual += m["actual_kg"]
        if earliest_start is None or run.start_date < earliest_start:
            earliest_start = run.start_date

        target_machines.append({"weekdays": weekdays, "holidays": holidays, "daily_kg": m["target_eff_per_day_kg"]})
        reality_machines.append({"weekdays": weekdays, "holidays": holidays, "daily_kg": m["actual_daily_rate_kg"] or 0})
        machines_meta.append({"work_center_code": wc.code, "work_center_name": wc.name})

    target_working_days = ceil(target_qty / total_target_daily) if total_target_daily > 0 else None
    target_completion = weaving_service.walk_to_target(target_machines, target_qty, earliest_start) if earliest_start else None
    reality_completion = weaving_service.walk_to_target(reality_machines, target_qty, today, initial=total_actual)

    return {
        "mo_code": mo.code,
        "item_code": mo.item_code,
        "target_qty": target_qty,
        "total_actual_kg": round(total_actual, 3),
        "total_target_daily_kg": round(total_target_daily, 3),
        "target_working_days": target_working_days,
        "target_completion_date": target_completion,
        "reality_completion_date": reality_completion,
        "machines": machines_meta,
    }


# ── Production calendar ──────────────────────────────────────────────────────

@router.get("/work-centers/{wc_id}/calendar")
async def get_calendar(
    wc_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    wc = await _get_wc(db, wc_id)
    weekdays, _ = await _load_calendar(db, wc)
    res = await db.execute(
        select(WorkCenterHoliday).where(WorkCenterHoliday.work_center_id == wc.id)
        .order_by(WorkCenterHoliday.holiday_date)
    )
    holidays = res.scalars().all()
    return {
        "work_center_id": str(wc.id),
        "working_weekdays": weekdays,
        "holidays": [WorkCenterHolidayResponse.model_validate(h) for h in holidays],
    }


@router.put("/work-centers/{wc_id}/calendar")
async def update_calendar(
    wc_id: str,
    payload: WorkCenterCalendarUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    wc = await _get_wc(db, wc_id)
    wc.working_weekdays = sorted(set(int(d) for d in payload.working_weekdays if 0 <= int(d) <= 6))
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "UPDATE", "work_center_calendar", str(wc.id),
        details="Updated working weekdays", changes={"working_weekdays": wc.working_weekdays},
    )
    await manager.broadcast({"type": "weaving_run", "action": "calendar", "work_center_id": str(wc.id)})
    return {"work_center_id": str(wc.id), "working_weekdays": wc.working_weekdays}


@router.post("/work-centers/{wc_id}/holidays", response_model=WorkCenterHolidayResponse)
async def add_holiday(
    wc_id: str,
    payload: WorkCenterHolidayCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    wc = await _get_wc(db, wc_id)
    existing = await db.execute(
        select(WorkCenterHoliday)
        .where(WorkCenterHoliday.work_center_id == wc.id)
        .where(WorkCenterHoliday.holiday_date == payload.holiday_date)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Holiday already set for this date")
    hol = WorkCenterHoliday(work_center_id=wc.id, holiday_date=payload.holiday_date, note=payload.note)
    db.add(hol)
    await db.commit()
    await db.refresh(hol)
    await audit_service.log_activity(
        db, current_user.id, "CREATE", "work_center_holiday", str(hol.id),
        details=f"Holiday {payload.holiday_date} on {wc.code}",
    )
    await manager.broadcast({"type": "weaving_run", "action": "calendar", "work_center_id": str(wc.id)})
    return hol


@router.post("/work-centers/{wc_id}/holidays/import-national")
async def import_national_holidays(
    wc_id: str,
    year: int = Query(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    wc = await _get_wc(db, wc_id)
    existing = await db.execute(
        select(WorkCenterHoliday.holiday_date).where(WorkCenterHoliday.work_center_id == wc.id)
    )
    have = {r[0] for r in existing.all()}
    added = 0
    for h in id_holidays.holidays_for_year(year):
        hd = date.fromisoformat(h["date"])
        if hd in have:
            continue
        db.add(WorkCenterHoliday(work_center_id=wc.id, holiday_date=hd, note=h["name"]))
        have.add(hd)
        added += 1
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "CREATE", "work_center_holiday", str(wc.id),
        details=f"Imported {added} national holidays ({year}) for {wc.code}",
    )
    await manager.broadcast({"type": "weaving_run", "action": "calendar", "work_center_id": str(wc.id)})
    return {"added": added}


@router.delete("/work-center-holidays/{holiday_id}")
async def delete_holiday(
    holiday_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.manage')),
):
    res = await db.execute(select(WorkCenterHoliday).where(WorkCenterHoliday.id == holiday_id))
    hol = res.scalars().first()
    if not hol:
        raise HTTPException(status_code=404, detail="Holiday not found")
    wc_id = str(hol.work_center_id)
    await db.delete(hol)
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "DELETE", "work_center_holiday", holiday_id, details="Deleted holiday",
    )
    await manager.broadcast({"type": "weaving_run", "action": "calendar", "work_center_id": wc_id})
    return {"status": "success"}
