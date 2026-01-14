from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.manufacturing import WorkOrder
from app.models.bom import BOM
from app.models.location import Location
from app.services import stock_service
from app.schemas import WorkOrderCreate, WorkOrderResponse

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
    # We copy item_id and attribute_value_id from BOM for historical data integrity
    wo = WorkOrder(
        code=payload.code,
        bom_id=bom.id,
        item_id=bom.item_id,
        attribute_value_id=bom.attribute_value_id,
        location_id=location.id,
        qty=payload.qty,
        start_date=payload.start_date,
        due_date=payload.due_date,
        status="PENDING"
    )
    
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo

@router.get("/work-orders", response_model=list[WorkOrderResponse])
def get_work_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(WorkOrder).order_by(WorkOrder.created_at.desc()).offset(skip).limit(limit).all()

@router.put("/work-orders/{wo_id}/status")
def update_work_order_status(wo_id: str, status: str, db: Session = Depends(get_db)):
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    
    valid_statuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # Check if completing
    if status == "COMPLETED" and wo.status != "COMPLETED":
        # 1. Deduct Materials
        for line in wo.bom.lines:
            # Required Qty = BOM Line Qty * Work Order Qty
            required_qty = float(line.qty) * float(wo.qty)
            stock_service.add_stock_entry(
                db,
                item_id=line.item_id,
                location_id=wo.location_id,
                attribute_value_id=line.attribute_value_id,
                qty_change=-required_qty, # Negative for deduction
                reference_type="Work Order",
                reference_id=wo.code
            )
        
        # 2. Add Finished Good
        stock_service.add_stock_entry(
            db,
            item_id=wo.item_id,
            location_id=wo.location_id,
            attribute_value_id=wo.attribute_value_id,
            qty_change=wo.qty,
            reference_type="Work Order",
            reference_id=wo.code
        )

    wo.status = status
    db.commit()
    return {"status": "success", "message": f"Work Order updated to {status}"}
