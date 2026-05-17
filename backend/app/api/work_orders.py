from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload, selectinload
from typing import Optional
from app.db.session import get_async_db
from app.models.work_order import WorkOrder
from app.models.manufacturing import ManufacturingOrder, MOCompletion
from app.models.routing import WorkCenter
from app.schemas import WorkOrderCreate, WorkOrderResponse
from app.models.auth import User
from app.api.auth import get_current_user
from app.services import audit_service
from app.core.ws_manager import manager
from datetime import datetime

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
        select(ManufacturingOrder).filter(ManufacturingOrder.id == payload.manufacturing_order_id)
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

    # Auto-generate name from work center; fall back to code
    name = payload.name
    if not name:
        if payload.work_center_id:
            wc_result = await db.execute(
                select(WorkCenter).filter(WorkCenter.id == payload.work_center_id)
            )
            wc = wc_result.scalars().first()
            name = wc.name if wc else wo_code
        else:
            name = wo_code

    sequence = payload.sequence if payload.sequence and payload.sequence > 1 else wo_seq_num

    wo = WorkOrder(
        manufacturing_order_id=payload.manufacturing_order_id,
        sequence=sequence,
        code=wo_code,
        name=name,
        work_center_id=payload.work_center_id,
        qty=payload.qty,
        planned_duration_hours=payload.planned_duration_hours,
        notes=payload.notes,
        target_start_date=payload.target_start_date,
        target_end_date=payload.target_end_date,
        status="PENDING",
    )
    db.add(wo)
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
    return wo

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

    await db.commit()

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    return result.scalars().first()

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

    if status == "COMPLETED" and wo.qty:
        total_result = await db.execute(
            select(func.sum(MOCompletion.qty_completed))
            .filter(MOCompletion.mo_id == wo.manufacturing_order_id, MOCompletion.work_order_id == wo.id)
        )
        total = float(total_result.scalar() or 0)
        if total < float(wo.qty):
            raise HTTPException(
                status_code=400,
                detail=f"Target not reached: {total:.2f} of {float(wo.qty):.2f} produced. Log more output before marking complete."
            )

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
