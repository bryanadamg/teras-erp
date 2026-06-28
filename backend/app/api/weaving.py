from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import date
from math import ceil
import uuid

from app.db.session import get_async_db
from app.models.weaving import WeavingRun, WorkCenterHoliday
from app.models.routing import WorkCenter
from app.models.manufacturing import ManufacturingOrder
from app.models.auth import User
from app.api.auth import get_current_user
from app.schemas import (
    WeavingRunCreate, WeavingRunUpdate, WeavingRunResponse,
    WorkCenterHolidayCreate, WorkCenterHolidayResponse, WorkCenterCalendarUpdate,
)
from app.services import audit_service, weaving_service
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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


@router.delete("/work-center-holidays/{holiday_id}")
async def delete_holiday(
    holiday_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
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
