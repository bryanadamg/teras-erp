from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload
from typing import Optional
from app.db.session import get_async_db
from app.models.work_order import WorkOrder
from app.models.manufacturing import ManufacturingOrder, MOPlannedComponent
from app.models.bom import BOMOperation
from app.models.routing import WorkCenter
from app.models.dyeing_setting import DyeRecipe, DyeingRun, dye_recipe_attribute_values
from app.schemas import WorkOrderCreate, WorkOrderResponse
from app.models.auth import User
from app.api.auth import get_current_user
from app.services import audit_service, stock_service
from app.core.ws_manager import manager
from datetime import datetime
import uuid


async def _find_matching_dye_recipe(db: AsyncSession, mo_attr_ids: set) -> Optional[DyeRecipe]:
    """Find active DyeRecipe whose attribute_values exactly match the given set."""
    count = len(mo_attr_ids)
    # Recipes containing ALL required attribute values
    has_all = (
        select(dye_recipe_attribute_values.c.dye_recipe_id)
        .where(dye_recipe_attribute_values.c.attribute_value_id.in_(mo_attr_ids))
        .group_by(dye_recipe_attribute_values.c.dye_recipe_id)
        .having(func.count() == count)
    )
    # Among those, only ones with no extra attribute values
    result = await db.execute(
        select(DyeRecipe)
        .where(DyeRecipe.id.in_(has_all))
        .where(DyeRecipe.is_active == True)
        .join(dye_recipe_attribute_values, DyeRecipe.id == dye_recipe_attribute_values.c.dye_recipe_id)
        .group_by(DyeRecipe.id)
        .having(func.count() == count)
    )
    return result.scalars().first()

router = APIRouter()

def _wo_options():
    return [joinedload(WorkOrder.work_center), selectinload(WorkOrder.completions)]

@router.get("/work-orders", response_model=list[WorkOrderResponse])
async def list_work_orders(
    manufacturing_order_id: Optional[str] = Query(None),
    center_type: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 9999,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    q = select(WorkOrder).options(*_wo_options()).order_by(WorkOrder.sequence)
    if manufacturing_order_id:
        q = q.filter(WorkOrder.manufacturing_order_id == manufacturing_order_id)
    if center_type:
        q = q.join(WorkCenter, WorkOrder.work_center_id == WorkCenter.id).filter(WorkCenter.center_type == center_type)
    result = await db.execute(q.offset(skip).limit(limit))
    return result.scalars().all()

@router.post("/work-orders", response_model=WorkOrderResponse)
async def create_work_order(
    payload: WorkOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    mo_result = await db.execute(
        select(ManufacturingOrder)
        .options(
            selectinload(ManufacturingOrder.attribute_values),
            selectinload(ManufacturingOrder.planned_components),
        )
        .filter(ManufacturingOrder.id == payload.manufacturing_order_id)
    )
    mo = mo_result.scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    # Count existing WOs for this MO to derive scoped sequence number
    count_result = await db.execute(
        select(func.count()).select_from(WorkOrder)
        .where(WorkOrder.manufacturing_order_id == payload.manufacturing_order_id)
    )
    wo_seq_num = (count_result.scalar() or 0) + 1
    wo_code = f"{mo.code}-WO-{wo_seq_num:02d}"

    # Load work center and check for DYEING gate
    wc = None
    planned_recipe_id = None
    if payload.work_center_id:
        wc_result = await db.execute(
            select(WorkCenter).filter(WorkCenter.id == payload.work_center_id)
        )
        wc = wc_result.scalars().first()

        if wc and wc.center_type == "DYEING":
            mo_attr_ids = {av.id for av in mo.attribute_values}
            if not mo_attr_ids:
                raise HTTPException(
                    status_code=422,
                    detail="MO has no attributes — cannot match a dyeing recipe"
                )
            matched_recipe = await _find_matching_dye_recipe(db, mo_attr_ids)
            if not matched_recipe:
                raise HTTPException(
                    status_code=422,
                    detail="No active dyeing recipe found matching this MO's attribute combination"
                )
            planned_recipe_id = matched_recipe.id

    # Auto-generate name from work center; fall back to code
    name = payload.name
    if not name:
        name = wc.name if wc else wo_code

    sequence = payload.sequence if payload.sequence and payload.sequence > 1 else wo_seq_num

    # Inherit locations from work center unless caller explicitly provided them
    input_location_id = payload.input_location_id
    output_location_id = payload.output_location_id
    if wc:
        if input_location_id is None:
            input_location_id = wc.input_location_id
        if output_location_id is None:
            output_location_id = wc.output_location_id

    wo = WorkOrder(
        manufacturing_order_id=payload.manufacturing_order_id,
        sequence=sequence,
        code=wo_code,
        name=name,
        work_center_id=payload.work_center_id,
        planned_recipe_id=planned_recipe_id,
        input_location_id=input_location_id,
        output_location_id=output_location_id,
        qty=payload.qty,
        planned_duration_hours=payload.planned_duration_hours,
        notes=payload.notes,
        target_start_date=payload.target_start_date,
        target_end_date=payload.target_end_date,
        status="PENDING",
    )
    db.add(wo)
    await db.flush()  # get wo.id before creating DyeingRun

    # Auto-seed pending DyeingRun so operator sees pre-filled recipe
    if planned_recipe_id:
        db.add(DyeingRun(
            work_order_id=wo.id,
            recipe_id=planned_recipe_id,
            run_number=1,
            substrate_qty=wo.qty or 0,
            status="PENDING",
        ))

    # Auto-start MO on first WO creation if MO is still PENDING
    if mo.status == "PENDING" and payload.work_center_id:
        # Find BOMOperation IDs linked to this work center
        ops_result = await db.execute(
            select(BOMOperation.id).where(BOMOperation.work_center_id == payload.work_center_id)
        )
        op_ids = {row[0] for row in ops_result.fetchall()}

        # Filter planned components assigned to those operations
        relevant_comps = [
            c for c in mo.planned_components
            if c.bom_operation_id and c.bom_operation_id in op_ids
        ]

        for comp in relevant_comps:
            if not comp.percentage:
                continue
            req = (float(mo.qty) * float(comp.percentage)) / 100
            check_loc_id = comp.source_location_id or mo.source_location_id or mo.location_id
            stock = await stock_service.get_stock_balance(
                db, comp.item_id, check_loc_id,
                [uuid.UUID(s) for s in comp.attribute_value_ids]
            )
            if stock < req:
                raise HTTPException(
                    status_code=422,
                    detail=f"Insufficient stock for component {comp.item_id} — cannot start MO"
                )

        mo.status = "IN_PROGRESS"
        mo.actual_start_date = datetime.utcnow()
        await db.commit()
        await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": str(mo.id), "status": "IN_PROGRESS", "code": mo.code})
    else:
        await db.commit()

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo.id)
    )
    wo = result.scalars().first()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE",
        entity_type="WORK_ORDER", entity_id=str(wo.id),
        details=f"Created Work Order '{wo.code}'",
        changes=payload.model_dump()
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": str(wo.id), "status": "PENDING"})

    response = WorkOrderResponse.model_validate(wo)

    # Soft over-assignment check
    total_assigned_result = await db.execute(
        select(func.sum(WorkOrder.qty)).where(
            WorkOrder.manufacturing_order_id == wo.manufacturing_order_id,
            WorkOrder.qty.isnot(None),
        )
    )
    total_assigned = float(total_assigned_result.scalar() or 0)
    mo_qty = float(mo.qty) if mo.qty else 0.0
    if mo_qty > 0 and total_assigned > mo_qty:
        response.warning = "total_assigned_exceeds_mo_qty"
        response.total_assigned = total_assigned
        response.mo_qty = mo_qty

    return response

@router.get("/work-orders/{wo_id}", response_model=WorkOrderResponse)
async def get_work_order(
    wo_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkOrder)
        .options(joinedload(WorkOrder.work_center), selectinload(WorkOrder.completions))
        .filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    return wo

@router.put("/work-orders/{wo_id}", response_model=WorkOrderResponse)
async def update_work_order(
    wo_id: str,
    payload: WorkOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")

    wo.sequence = payload.sequence
    if payload.name is not None:
        wo.name = payload.name
    wo.work_center_id = payload.work_center_id
    wo.qty = payload.qty
    wo.planned_duration_hours = payload.planned_duration_hours
    wo.notes = payload.notes
    wo.target_start_date = payload.target_start_date
    wo.target_end_date = payload.target_end_date

    # Re-populate locations: explicit payload values win; fall back to new WC's defaults
    if payload.input_location_id is not None or payload.output_location_id is not None:
        wo.input_location_id = payload.input_location_id
        wo.output_location_id = payload.output_location_id
    elif payload.work_center_id:
        wc_result = await db.execute(select(WorkCenter).filter(WorkCenter.id == payload.work_center_id))
        wc_upd = wc_result.scalars().first()
        if wc_upd:
            wo.input_location_id = wc_upd.input_location_id
            wo.output_location_id = wc_upd.output_location_id
    else:
        wo.input_location_id = None
        wo.output_location_id = None

    await db.commit()

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="UPDATE",
        entity_type="WORK_ORDER", entity_id=wo_id,
        details=f"Updated Work Order",
        changes=payload.model_dump()
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": wo_id, "status": wo.status})

    response = WorkOrderResponse.model_validate(wo)

    # Soft over-assignment check
    total_assigned_result = await db.execute(
        select(func.sum(WorkOrder.qty)).where(
            WorkOrder.manufacturing_order_id == wo.manufacturing_order_id,
            WorkOrder.qty.isnot(None),
        )
    )
    total_assigned = float(total_assigned_result.scalar() or 0)

    mo_result = await db.execute(
        select(ManufacturingOrder).filter(ManufacturingOrder.id == wo.manufacturing_order_id)
    )
    mo = mo_result.scalars().first()
    mo_qty = float(mo.qty) if mo and mo.qty else 0.0

    if mo_qty > 0 and total_assigned > mo_qty:
        response.warning = "total_assigned_exceeds_mo_qty"
        response.total_assigned = total_assigned
        response.mo_qty = mo_qty

    return response

@router.put("/work-orders/{wo_id}/status", response_model=WorkOrderResponse)
async def update_work_order_status(
    wo_id: str,
    status: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    valid = {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")

    wo.status = status
    if status == "IN_PROGRESS" and not wo.actual_start_date:
        wo.actual_start_date = datetime.utcnow()
    if status == "COMPLETED" and not wo.actual_end_date:
        wo.actual_end_date = datetime.utcnow()

    await db.commit()
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": wo_id, "status": status})

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    return result.scalars().first()

@router.delete("/work-orders/{wo_id}")
async def delete_work_order(
    wo_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(WorkOrder).filter(WorkOrder.id == wo_id))
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    label = wo.code or wo.name
    await db.delete(wo)
    await db.commit()
    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE",
        entity_type="WORK_ORDER", entity_id=wo_id,
        details=f"Deleted Work Order '{label}'"
    )
    return {"status": "success"}
