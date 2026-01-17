from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.manufacturing import WorkOrder
from app.models.bom import BOM
from app.models.location import Location
from app.services import stock_service
from app.schemas import WorkOrderCreate, WorkOrderResponse
from datetime import datetime
from typing import Optional

router = APIRouter()

@router.post("/work-orders", response_model=WorkOrderResponse)
def create_work_order(payload: WorkOrderCreate, db: Session = Depends(get_db)):
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

    # 4. Create Work Order
    # We copy item_id and attribute_values from BOM for historical data integrity
    wo = WorkOrder(
        code=payload.code,
        bom_id=bom.id,
        item_id=bom.item_id,
        location_id=location.id,
        qty=payload.qty,
        start_date=payload.start_date,
        due_date=payload.due_date,
        status="PENDING"
    )
    
    # Copy attribute values from BOM
    wo.attribute_values = bom.attribute_values

    db.add(wo)
    db.commit()
    db.refresh(wo)
    
    wo.attribute_value_ids = [v.id for v in wo.attribute_values]
    
    # Check material availability
    wo.is_material_available = True
    for line in bom.lines:
        required_qty = float(line.qty) * float(wo.qty)
        current = stock_service.get_stock_balance(
            db, 
            item_id=line.item_id, 
            location_id=wo.location_id, 
            attribute_value_ids=[v.id for v in line.attribute_values]
        )
        if current < required_qty:
            wo.is_material_available = False
            break
            
    return wo

@router.get("/work-orders", response_model=list[WorkOrderResponse])
def get_work_orders(
    skip: int = 0, 
    limit: int = 100, 
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(WorkOrder)
    
    if start_date:
        query = query.filter(WorkOrder.created_at >= start_date)
    if end_date:
        query = query.filter(WorkOrder.created_at <= end_date)
        
    items = query.order_by(WorkOrder.created_at.desc()).offset(skip).limit(limit).all()
    for item in items:
        item.attribute_value_ids = [v.id for v in item.attribute_values]
        
        # Check availability
        item.is_material_available = True
        if item.status == "PENDING":
            for line in item.bom.lines:
                required_qty = float(line.qty) * float(item.qty)
                current = stock_service.get_stock_balance(
                    db, 
                    item_id=line.item_id, 
                    location_id=item.location_id, 
                    attribute_value_ids=[v.id for v in line.attribute_values]
                )
                if current < required_qty:
                    item.is_material_available = False
                    break
                    
    return items

@router.put("/work-orders/{wo_id}/status")
def update_work_order_status(wo_id: str, status: str, db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    valid_statuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # 1. Update start_date if moving to IN_PROGRESS
    if status == "IN_PROGRESS" and wo.status != "IN_PROGRESS":
        # Validate Stock Availability for all BOM Lines
        for line in wo.bom.lines:
            required_qty = float(line.qty) * float(wo.qty)
            current_stock = stock_service.get_stock_balance(
                db, 
                item_id=line.item_id, 
                location_id=wo.location_id, 
                attribute_value_ids=[v.id for v in line.attribute_values]
            )
            
            if current_stock < required_qty:
                from app.models.item import Item
                item_obj = db.query(Item).filter(Item.id == line.item_id).first()
                item_name = item_obj.name if item_obj else "Unknown Item"
                
                location_obj = db.query(Location).filter(Location.id == wo.location_id).first()
                loc_name = location_obj.name if location_obj else "Unknown Location"
                
                raise HTTPException(
                    status_code=400, 
                    detail=f"Insufficient stock for {item_name} at {loc_name}. Required: {required_qty}, Available: {current_stock}"
                )
        
        wo.start_date = datetime.utcnow()

    # 2. Check if completing
    if status == "COMPLETED" and wo.status != "COMPLETED":
        wo.completed_at = datetime.utcnow()
        # 1. Deduct Materials (This will trigger the stock_service negative check as a safety net)
        for line in wo.bom.lines:
            # Required Qty = BOM Line Qty * Work Order Qty
            required_qty = float(line.qty) * float(wo.qty)
            stock_service.add_stock_entry(
                db,
                item_id=line.item_id,
                location_id=wo.location_id,
                attribute_value_ids=[v.id for v in line.attribute_values],
                qty_change=-required_qty, # Negative for deduction
                reference_type="Work Order",
                reference_id=wo.code
            )
        
        # 2. Add Finished Good
        stock_service.add_stock_entry(
            db,
            item_id=wo.item_id,
            location_id=wo.location_id,
            attribute_value_ids=[v.id for v in wo.attribute_values],
            qty_change=wo.qty,
            reference_type="Work Order",
            reference_id=wo.code
        )

    wo.status = status
    db.commit()
    return {"status": "success", "message": f"Work Order updated to {status}"}
