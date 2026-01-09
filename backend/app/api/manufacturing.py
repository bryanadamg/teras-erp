from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.manufacturing import WorkOrder
from app.models.bom import BOM
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

    # 3. Create Work Order
    # We copy item_id and variant_id from BOM for historical data integrity
    wo = WorkOrder(
        code=payload.code,
        bom_id=bom.id,
        item_id=bom.item_id,
        variant_id=bom.variant_id,
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
    
    wo.status = status
    db.commit()
    return {"status": "success", "message": f"Work Order updated to {status}"}
