from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload
from typing import Optional
from datetime import datetime, timezone
import uuid

from app.db.session import get_async_db
from app.models.dyeing_setting import (
    DyeRecipe, DyeRecipeLine, DyeingRun, DyeingRunChemical, SettingRun,
    DyeRecipeWashBath, DyeRecipeFinishing, dye_recipe_attribute_values,
)
from app.models.attribute import AttributeValue
from app.models.work_order import WorkOrder as _WorkOrder
from app.models.manufacturing import ManufacturingOrder as _MO, manufacturing_order_values as _mo_values
from app.models.batch import Batch
from app.models.work_order import WorkOrder
from app.models.routing import WorkCenter
from app.models.auth import User
from app.api.auth import get_current_user, require_permission
from app.services import audit_service
from app.schemas import (
    DyeRecipeCreate, DyeRecipeUpdate, DyeRecipeResponse,
    DyeRecipeWashBathCreate, DyeRecipeWashBathResponse,
    DyeRecipeFinishingCreate, DyeRecipeFinishingResponse,
    DyeingRunCreate, DyeingRunCompletePayload, DyeingRunResponse,
    SettingRunCreate, SettingRunCompletePayload, SettingRunResponse,
)

router = APIRouter()


# ─── helpers ────────────────────────────────────────────────────────────────

def _recipe_opts():
    return [
        selectinload(DyeRecipe.lines).selectinload(DyeRecipeLine.item),
        selectinload(DyeRecipe.lines).selectinload(DyeRecipeLine.uom),
        selectinload(DyeRecipe.wash_baths),
        selectinload(DyeRecipe.finishing_steps),
        selectinload(DyeRecipe.attribute_values),
        joinedload(DyeRecipe.color),
    ]


def _serialize_recipe(r: DyeRecipe) -> dict:
    lines = []
    for ln in r.lines:
        ld = {col.name: getattr(ln, col.name) for col in ln.__table__.columns}
        ld["item_name"] = ln.item.name if ln.item else None
        ld["uom_name"] = ln.uom.name if ln.uom else None
        lines.append(ld)
    rd = {col.name: getattr(r, col.name) for col in r.__table__.columns}
    rd["lines"] = lines
    rd["wash_baths"] = [
        {col.name: getattr(wb, col.name) for col in wb.__table__.columns}
        for wb in r.wash_baths
    ]
    rd["finishing_steps"] = [
        {col.name: getattr(fs, col.name) for col in fs.__table__.columns}
        for fs in r.finishing_steps
    ]
    rd["attribute_value_ids"] = [str(v.id) for v in r.attribute_values]
    rd["color_name"] = r.color.name if r.color else None
    rd["color_code"] = r.color.code if r.color else None
    return rd


def _dyeing_run_opts():
    return [
        selectinload(DyeingRun.chemicals).selectinload(DyeingRunChemical.item),
        selectinload(DyeingRun.chemicals).selectinload(DyeingRunChemical.uom),
        joinedload(DyeingRun.recipe),
        joinedload(DyeingRun.input_batch),
        joinedload(DyeingRun.output_batch),
    ]


def _setting_run_opts():
    return [
        joinedload(SettingRun.input_batch),
        joinedload(SettingRun.output_batch),
    ]


def _enrich_dyeing_run(run: DyeingRun) -> dict:
    d = {c.name: getattr(run, c.name) for c in run.__table__.columns}
    d["recipe_name"] = run.recipe.name if run.recipe else None
    d["input_batch_number"] = run.input_batch.batch_number if run.input_batch else None
    d["output_batch_number"] = run.output_batch.batch_number if run.output_batch else None
    chems = []
    for c in run.chemicals:
        cd = {col.name: getattr(c, col.name) for col in c.__table__.columns}
        cd["item_name"] = c.item.name if c.item else None
        cd["uom_name"] = c.uom.name if c.uom else None
        chems.append(cd)
    d["chemicals"] = chems
    return d


def _enrich_setting_run(run: SettingRun) -> dict:
    d = {c.name: getattr(run, c.name) for c in run.__table__.columns}
    d["input_batch_number"] = run.input_batch.batch_number if run.input_batch else None
    d["output_batch_number"] = run.output_batch.batch_number if run.output_batch else None
    return d


async def _get_next_run_number(db: AsyncSession, model, work_order_id) -> int:
    result = await db.execute(
        select(model).filter(model.work_order_id == work_order_id)
    )
    existing = result.scalars().all()
    return len(existing) + 1


# ─── Dye Recipes ─────────────────────────────────────────────────────────────

@router.get("/dye-recipes", response_model=list[DyeRecipeResponse])
async def list_dye_recipes(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    q = select(DyeRecipe).options(*_recipe_opts()).order_by(DyeRecipe.code)
    if active_only:
        q = q.filter(DyeRecipe.is_active == True)
    result = await db.execute(q)
    recipes = result.scalars().all()
    return [_serialize_recipe(r) for r in recipes]


@router.post("/dye-recipes", response_model=DyeRecipeResponse)
async def create_dye_recipe(
    payload: DyeRecipeCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    existing = await db.execute(select(DyeRecipe).filter(DyeRecipe.code == payload.code))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Recipe code already exists")

    recipe = DyeRecipe(
        code=payload.code,
        name=payload.name,
        color_standard=payload.color_standard,
        color_id=payload.color_id,
        substrate_type=payload.substrate_type,
        notes=payload.notes,
        is_active=payload.is_active,
    )
    db.add(recipe)
    await db.flush()

    for i, ln in enumerate(payload.lines):
        line = DyeRecipeLine(
            recipe_id=recipe.id,
            item_id=ln.item_id,
            qty_per_100kg=ln.qty_per_100kg,
            qty_per_liter=ln.qty_per_liter,
            uom_id=ln.uom_id,
            chemical_type=ln.chemical_type,
            sort_order=ln.sort_order if ln.sort_order else i,
        )
        db.add(line)

    for wb in payload.wash_baths:
        db.add(DyeRecipeWashBath(
            recipe_id=recipe.id,
            bath_number=wb.bath_number,
            description=wb.description,
        ))

    for i, fs in enumerate(payload.finishing_steps):
        db.add(DyeRecipeFinishing(
            recipe_id=recipe.id,
            description=fs.description,
            sort_order=fs.sort_order if fs.sort_order else i,
        ))

    if payload.attribute_value_ids:
        await db.execute(
            dye_recipe_attribute_values.insert(),
            [{"dye_recipe_id": recipe.id, "attribute_value_id": str(v)} for v in payload.attribute_value_ids]
        )

    await db.commit()
    result = await db.execute(
        select(DyeRecipe).options(*_recipe_opts()).filter(DyeRecipe.id == recipe.id)
    )
    r = result.scalars().first()
    await audit_service.log_activity(
        db, str(current_user.id), "CREATE", "DyeRecipe", str(r.id),
        details=f"Created recipe {r.code}", changes={}
    )
    return _serialize_recipe(r)


@router.get("/dye-recipes/match")
async def match_dye_recipe(
    work_order_id: str = Query(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Return the best-matching DyeRecipe for a given Work Order, based on the MO's attribute values."""
    wo_result = await db.execute(
        select(_WorkOrder).filter(_WorkOrder.id == work_order_id)
    )
    wo = wo_result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")

    mo_result = await db.execute(
        select(_MO)
        .options(selectinload(_MO.attribute_values))
        .filter(_MO.id == wo.manufacturing_order_id)
    )
    mo = mo_result.scalars().first()
    mo_attr_ids = set(str(v.id) for v in mo.attribute_values) if mo else set()

    recipes_result = await db.execute(
        select(DyeRecipe).options(*_recipe_opts()).filter(DyeRecipe.is_active == True)
    )
    recipes = recipes_result.scalars().all()

    best: DyeRecipe | None = None
    best_count = -1
    for r in recipes:
        recipe_ids = set(str(v.id) for v in r.attribute_values)
        if not recipe_ids:
            continue
        if recipe_ids.issubset(mo_attr_ids) and len(recipe_ids) > best_count:
            best = r
            best_count = len(recipe_ids)

    if not best:
        return {"match": None}
    return {"match": _serialize_recipe(best)}


@router.put("/dye-recipes/{recipe_id}", response_model=DyeRecipeResponse)
async def update_dye_recipe(
    recipe_id: str,
    payload: DyeRecipeUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(DyeRecipe).options(*_recipe_opts()).filter(DyeRecipe.id == recipe_id)
    )
    r = result.scalars().first()
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")

    for field in ("code", "name", "color_standard", "color_id", "substrate_type", "notes", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(r, field, val)

    if payload.lines is not None:
        for ln in list(r.lines):
            await db.delete(ln)
        await db.flush()
        for i, ln in enumerate(payload.lines):
            line = DyeRecipeLine(
                recipe_id=r.id,
                item_id=ln.item_id,
                qty_per_100kg=ln.qty_per_100kg,
                qty_per_liter=ln.qty_per_liter,
                uom_id=ln.uom_id,
                chemical_type=ln.chemical_type,
                sort_order=ln.sort_order if ln.sort_order else i,
            )
            db.add(line)

    if payload.wash_baths is not None:
        for wb in list(r.wash_baths):
            await db.delete(wb)
        await db.flush()
        for wb in payload.wash_baths:
            db.add(DyeRecipeWashBath(
                recipe_id=r.id,
                bath_number=wb.bath_number,
                description=wb.description,
            ))

    if payload.finishing_steps is not None:
        for fs in list(r.finishing_steps):
            await db.delete(fs)
        await db.flush()
        for i, fs in enumerate(payload.finishing_steps):
            db.add(DyeRecipeFinishing(
                recipe_id=r.id,
                description=fs.description,
                sort_order=fs.sort_order if fs.sort_order else i,
            ))

    if payload.attribute_value_ids is not None:
        av_result = await db.execute(
            select(AttributeValue).filter(AttributeValue.id.in_([str(v) for v in payload.attribute_value_ids]))
        )
        r.attribute_values = list(av_result.scalars().all())

    await db.commit()
    result = await db.execute(
        select(DyeRecipe).options(*_recipe_opts()).filter(DyeRecipe.id == recipe_id)
    )
    r = result.scalars().first()
    await audit_service.log_activity(
        db, str(current_user.id), "UPDATE", "DyeRecipe", str(r.id),
        details=f"Updated recipe {r.code}", changes={}
    )
    return _serialize_recipe(r)


@router.delete("/dye-recipes/{recipe_id}")
async def delete_dye_recipe(
    recipe_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(select(DyeRecipe).filter(DyeRecipe.id == recipe_id))
    r = result.scalars().first()
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    r_code = r.code
    await db.delete(r)
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "DELETE", "DyeRecipe", recipe_id,
        details=f"Deleted recipe {r_code}"
    )
    return {"status": "success"}


# ─── Dyeing Runs ─────────────────────────────────────────────────────────────

@router.get("/dyeing-runs", response_model=list[DyeingRunResponse])
async def list_dyeing_runs(
    work_order_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    q = select(DyeingRun).options(*_dyeing_run_opts()).order_by(DyeingRun.created_at)
    if work_order_id:
        q = q.filter(DyeingRun.work_order_id == work_order_id)
    result = await db.execute(q)
    return [_enrich_dyeing_run(r) for r in result.scalars().all()]


@router.post("/dyeing-runs", response_model=DyeingRunResponse)
async def create_dyeing_run(
    payload: DyeingRunCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    wo_result = await db.execute(select(WorkOrder).filter(WorkOrder.id == payload.work_order_id))
    if not wo_result.scalars().first():
        raise HTTPException(status_code=404, detail="Work Order not found")

    run_number = await _get_next_run_number(db, DyeingRun, payload.work_order_id)
    run = DyeingRun(
        work_order_id=payload.work_order_id,
        run_number=run_number,
        recipe_id=payload.recipe_id,
        substrate_qty=payload.substrate_qty,
        input_batch_id=payload.input_batch_id,
        machine_name=payload.machine_name,
        liquor_ratio=payload.liquor_ratio,
        temperature_c=payload.temperature_c,
        duration_min=payload.duration_min,
        operator_name=payload.operator_name,
        notes=payload.notes,
        volume_air_liters=payload.volume_air_liters,
        machine_speed=payload.machine_speed,
        machine_pressure=payload.machine_pressure,
        color_name=payload.color_name,
        color_matching_ref=payload.color_matching_ref,
        lot_number=payload.lot_number,
        customer_name=payload.customer_name,
        artikel=payload.artikel,
        po_number=payload.po_number,
        qty_order_kg=payload.qty_order_kg,
        status="PENDING",
    )
    db.add(run)
    await db.commit()
    result = await db.execute(
        select(DyeingRun).options(*_dyeing_run_opts()).filter(DyeingRun.id == run.id)
    )
    run = result.scalars().first()
    await audit_service.log_activity(
        db, str(current_user.id), "CREATE", "DyeingRun", str(run.id),
        details=f"Created dyeing run #{run.run_number} for WO {run.work_order_id}", changes={}
    )
    return _enrich_dyeing_run(run)


@router.post("/dyeing-runs/{run_id}/start", response_model=DyeingRunResponse)
async def start_dyeing_run(
    run_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(DyeingRun).options(*_dyeing_run_opts()).filter(DyeingRun.id == run_id)
    )
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Dyeing run not found")
    if run.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}")
    run.status = "IN_PROGRESS"
    run.started_at = datetime.now(timezone.utc)
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "STATUS_CHANGE", "DyeingRun", run_id,
        details=f"Started dyeing run {run.run_number}"
    )
    result = await db.execute(
        select(DyeingRun).options(*_dyeing_run_opts()).filter(DyeingRun.id == run_id)
    )
    return _enrich_dyeing_run(result.scalars().first())


@router.post("/dyeing-runs/{run_id}/complete", response_model=DyeingRunResponse)
async def complete_dyeing_run(
    run_id: str,
    payload: DyeingRunCompletePayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(DyeingRun).options(*_dyeing_run_opts()).filter(DyeingRun.id == run_id)
    )
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Dyeing run not found")
    if run.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Run already completed")

    # Create output batch
    batch_check = await db.execute(
        select(Batch).filter(Batch.batch_number == payload.output_batch_number)
    )
    out_batch = batch_check.scalars().first()
    if not out_batch:
        wo_result = await db.execute(
            select(WorkOrder).filter(WorkOrder.id == run.work_order_id)
        )
        wo = wo_result.scalars().first()
        out_batch = Batch(
            batch_number=payload.output_batch_number,
            item_id=wo.manufacturing_order_id,  # placeholder — batch item derived from WO's MO output item
            created_by=str(current_user.id),
        )
        # Use the MO's item_id for the batch
        from app.models.manufacturing import ManufacturingOrder
        mo_result = await db.execute(
            select(ManufacturingOrder).filter(ManufacturingOrder.id == wo.manufacturing_order_id)
        )
        mo = mo_result.scalars().first()
        if mo:
            out_batch.item_id = mo.item_id
        db.add(out_batch)
        await db.flush()

    run.output_batch_id = out_batch.id
    run.status = "COMPLETED"
    run.shade_result = payload.shade_result
    run.shade_notes = payload.shade_notes
    run.completed_at = datetime.now(timezone.utc)
    if not run.started_at:
        run.started_at = run.completed_at

    # Replace chemicals with actual quantities
    for old_chem in list(run.chemicals):
        await db.delete(old_chem)
    await db.flush()

    for chem in payload.chemicals:
        c = DyeingRunChemical(
            run_id=run.id,
            item_id=chem.item_id,
            planned_qty=chem.planned_qty,
            actual_qty=chem.actual_qty,
            uom_id=chem.uom_id,
        )
        db.add(c)

    await db.commit()
    result = await db.execute(
        select(DyeingRun).options(*_dyeing_run_opts()).filter(DyeingRun.id == run_id)
    )
    run = result.scalars().first()
    await audit_service.log_activity(
        db, str(current_user.id), "COMPLETE", "DyeingRun", str(run.id),
        details=f"Completed dyeing run #{run.run_number}, shade={payload.shade_result}", changes={}
    )
    return _enrich_dyeing_run(run)


# ─── Setting Runs ─────────────────────────────────────────────────────────────

@router.get("/setting-runs", response_model=list[SettingRunResponse])
async def list_setting_runs(
    work_order_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    q = select(SettingRun).options(*_setting_run_opts()).order_by(SettingRun.created_at)
    if work_order_id:
        q = q.filter(SettingRun.work_order_id == work_order_id)
    result = await db.execute(q)
    return [_enrich_setting_run(r) for r in result.scalars().all()]


@router.post("/setting-runs", response_model=SettingRunResponse)
async def create_setting_run(
    payload: SettingRunCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    wo_result = await db.execute(select(WorkOrder).filter(WorkOrder.id == payload.work_order_id))
    if not wo_result.scalars().first():
        raise HTTPException(status_code=404, detail="Work Order not found")

    run_number = await _get_next_run_number(db, SettingRun, payload.work_order_id)
    run = SettingRun(
        work_order_id=payload.work_order_id,
        run_number=run_number,
        substrate_qty=payload.substrate_qty,
        input_batch_id=payload.input_batch_id,
        machine_name=payload.machine_name,
        temperature_c=payload.temperature_c,
        speed_mpm=payload.speed_mpm,
        width_cm=payload.width_cm,
        overfeed_pct=payload.overfeed_pct,
        operator_name=payload.operator_name,
        notes=payload.notes,
        status="PENDING",
    )
    db.add(run)
    await db.commit()
    result = await db.execute(
        select(SettingRun).options(*_setting_run_opts()).filter(SettingRun.id == run.id)
    )
    run = result.scalars().first()
    await audit_service.log_activity(
        db, str(current_user.id), "CREATE", "SettingRun", str(run.id),
        details=f"Created setting run #{run.run_number} for WO {run.work_order_id}", changes={}
    )
    return _enrich_setting_run(run)


@router.post("/setting-runs/{run_id}/start", response_model=SettingRunResponse)
async def start_setting_run(
    run_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(SettingRun).options(*_setting_run_opts()).filter(SettingRun.id == run_id)
    )
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Setting run not found")
    if run.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Run is already {run.status}")
    run.status = "IN_PROGRESS"
    run.started_at = datetime.now(timezone.utc)
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "STATUS_CHANGE", "SettingRun", run_id,
        details=f"Started setting run {run.run_number}"
    )
    result = await db.execute(
        select(SettingRun).options(*_setting_run_opts()).filter(SettingRun.id == run_id)
    )
    return _enrich_setting_run(result.scalars().first())


@router.post("/setting-runs/{run_id}/complete", response_model=SettingRunResponse)
async def complete_setting_run(
    run_id: str,
    payload: SettingRunCompletePayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('dyeing.manage')),
):
    result = await db.execute(
        select(SettingRun).options(*_setting_run_opts()).filter(SettingRun.id == run_id)
    )
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="Setting run not found")
    if run.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Run already completed")

    # Create output batch
    batch_check = await db.execute(
        select(Batch).filter(Batch.batch_number == payload.output_batch_number)
    )
    out_batch = batch_check.scalars().first()
    if not out_batch:
        wo_result = await db.execute(
            select(WorkOrder).filter(WorkOrder.id == run.work_order_id)
        )
        wo = wo_result.scalars().first()
        from app.models.manufacturing import ManufacturingOrder
        mo_result = await db.execute(
            select(ManufacturingOrder).filter(ManufacturingOrder.id == wo.manufacturing_order_id)
        )
        mo = mo_result.scalars().first()
        out_batch = Batch(
            batch_number=payload.output_batch_number,
            item_id=mo.item_id if mo else wo.manufacturing_order_id,
            created_by=str(current_user.id),
        )
        db.add(out_batch)
        await db.flush()

    run.output_batch_id = out_batch.id
    run.status = "COMPLETED"
    run.actual_width_cm = payload.actual_width_cm
    run.actual_gsm = payload.actual_gsm
    run.actual_shrinkage_pct = payload.actual_shrinkage_pct
    run.completed_at = datetime.now(timezone.utc)
    if not run.started_at:
        run.started_at = run.completed_at

    await db.commit()
    result = await db.execute(
        select(SettingRun).options(*_setting_run_opts()).filter(SettingRun.id == run_id)
    )
    run = result.scalars().first()
    await audit_service.log_activity(
        db, str(current_user.id), "COMPLETE", "SettingRun", str(run.id),
        details=f"Completed setting run #{run.run_number}", changes={}
    )
    return _enrich_setting_run(run)
