from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.manufacturing import WorkOrder
from app.models.bom import BOM
from app.models.location import Location
from app.services import stock_service, audit_service
from app.schemas import WorkOrderCreate, WorkOrderResponse, PaginatedWorkOrderResponse
from app.models.auth import User
from app.api.auth import get_current_user
from app.models.item import Item
from datetime import datetime
from typing import Optional
from app.core.ws_manager import manager
import asyncio

router = APIRouter()

@router.post("/work-orders", response_model=WorkOrderResponse)
def create_work_order(payload: WorkOrderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Check if WO code exists
    if db.query(WorkOrder).filter(WorkOrder.code == payload.code).first():
        raise HTTPException(status_code=400, detail="Work Order Code already exists")

    # 2. Resolve BOM
    bom = db.query(BOM).filter(BOM.id == payload.bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    # 3. Resolve Location
    location = db.query(Location).filter(Location.code == payload.location_code).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # 3b. Resolve Source Location (if provided)
    source_location = None
    if payload.source_location_code:
        source_location = db.query(Location).filter(Location.code == payload.source_location_code).first()
        if not source_location:
            raise HTTPException(status_code=404, detail="Source Location not found")

    # 4. Create Work Order
    wo = WorkOrder(
        code=payload.code,
        bom_id=bom.id,
        item_id=bom.item_id,
        location_id=location.id,
        source_location_id=source_location.id if source_location else location.id,
        qty=payload.qty,
        target_start_date=payload.target_start_date,
        target_end_date=payload.target_end_date,
        status="PENDING"
    )
    
    # Copy attribute values from BOM
    wo.attribute_values = bom.attribute_values

    db.add(wo)
    db.commit()
    db.refresh(wo)
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="WorkOrder",
        entity_id=str(wo.id),
        details=f"Created Work Order {wo.code} for BOM {bom.code}",
        changes=payload.dict()
    )
    
    wo.attribute_value_ids = [v.id for v in wo.attribute_values]
    return wo

@router.get("/work-orders", response_model=PaginatedWorkOrderResponse)
def get_work_orders(
    skip: int = 0, 
    limit: int = 100, 
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(WorkOrder)
    
    if start_date:
        query = query.filter(WorkOrder.created_at >= start_date)
    if end_date:
        query = query.filter(WorkOrder.created_at <= end_date)
        
    if current_user.allowed_categories:
        query = query.join(Item, WorkOrder.item_id == Item.id).filter(Item.category.in_(current_user.allowed_categories))
        
    total = query.count()
    items = query.order_by(WorkOrder.created_at.desc()).offset(skip).limit(limit).all()

    # --- BATCH MATERIAL CHECK ---
    requirements = []
    for item in items:
        item.attribute_value_ids = [v.id for v in item.attribute_values]
        if item.status == "PENDING":
            for line in item.bom.lines:
                check_location_id = line.source_location_id or item.source_location_id or item.location_id
                requirements.append({
                    "item_id": line.item_id,
                    "location_id": check_location_id,
                    "attribute_value_ids": [str(v.id) for v in line.attribute_values]
                })
    
    balances_map = stock_service.get_batch_stock_balances(db, requirements) if requirements else {}

    for item in items:
        item.is_material_available = True
        if item.status == "PENDING":
            for line in item.bom.lines:
                # Logic for calculating required qty
                required_qty = float(line.qty)
                if line.is_percentage:
                    required_qty = (float(item.qty) * required_qty) / 100
                else:
                    required_qty = float(item.qty) * required_qty
                
                tolerance = float(item.bom.tolerance_percentage or 0)
                if tolerance > 0:
                    required_qty = required_qty * (1 + (tolerance / 100))

                check_location_id = line.source_location_id or item.source_location_id or item.location_id
                val_ids_str = ",".join(sorted([str(v.id) for v in line.attribute_values]))
                key = (str(line.item_id), str(check_location_id), val_ids_str)
                
                current = balances_map.get(key, 0)
                if current < required_qty:
                    item.is_material_available = False
                    break
                    
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1,
        "size": len(items)
    }

@router.put("/work-orders/{wo_id}/status")
async def update_work_order_status(wo_id: str, status: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    previous_status = wo.status
    valid_statuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # 1. Update actual_start_date if moving to IN_PROGRESS
    if status == "IN_PROGRESS" and previous_status != "IN_PROGRESS":
        # Validate Stock Availability for all BOM Lines
        for line in wo.bom.lines:
            required_qty = float(line.qty)
            if line.is_percentage:
                required_qty = (float(wo.qty) * required_qty) / 100
            else:
                required_qty = float(wo.qty) * required_qty
            
            tolerance = float(wo.bom.tolerance_percentage or 0)
            if tolerance > 0:
                required_qty = required_qty * (1 + (tolerance / 100))
            
            check_location_id = line.source_location_id or wo.source_location_id or wo.location_id
            current_stock = stock_service.get_stock_balance(db, line.item_id, check_location_id, [v.id for v in line.attribute_values])
            
            if current_stock < required_qty:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {line.item_id}")
        
        wo.actual_start_date = datetime.utcnow()

    # 2. Check if completing
    if status == "COMPLETED" and previous_status != "COMPLETED":
        wo.actual_end_date = datetime.utcnow()
        for line in wo.bom.lines:
            qty_to_deduct = float(line.qty)
            if line.is_percentage:
                qty_to_deduct = (float(wo.qty) * qty_to_deduct) / 100
            else:
                qty_to_deduct = float(wo.qty) * qty_to_deduct
            
            tolerance = float(wo.bom.tolerance_percentage or 0)
            if tolerance > 0:
                qty_to_deduct = qty_to_deduct * (1 + (tolerance / 100))
            
            deduct_location_id = line.source_location_id or wo.source_location_id or wo.location_id
            stock_service.add_stock_entry(db, line.item_id, deduct_location_id, -qty_to_deduct, "Work Order", wo.code, [v.id for v in line.attribute_values])
        
        stock_service.add_stock_entry(db, wo.item_id, wo.location_id, wo.qty, "Work Order", wo.code, [v.id for v in wo.attribute_values])

    wo.status = status
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed: {str(e)}")
    
    audit_service.log_activity(db, current_user.id, "UPDATE_STATUS", "WorkOrder", wo_id, f"Status: {previous_status} -> {status}", {"status": status})
    
    # Broadcast ENRICHED event for instant UI update
    await manager.broadcast({
        "type": "WORK_ORDER_UPDATE",
        "wo_id": wo_id,
        "status": status,
        "code": wo.code,
        "actual_start_date": wo.actual_start_date.isoformat() if wo.actual_start_date else None,
        "actual_end_date": wo.actual_end_date.isoformat() if wo.actual_end_date else None
    })
    return {"status": "success", "message": f"Work Order updated to {status}"}

@router.delete("/work-orders/{wo_id}")
def delete_work_order(wo_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    db.delete(wo)
    db.commit()
    return {"status": "success", "message": "Work Order deleted"}
