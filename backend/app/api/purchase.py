from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas import PurchaseOrderCreate, PurchaseOrderResponse
from app.models.purchase import PurchaseOrder, PurchaseOrderLine
from app.models.attribute import AttributeValue
from app.api.auth import get_current_user
from app.models.auth import User
import uuid

router = APIRouter(prefix="/purchase-orders", tags=["purchase"])

@router.post("", response_model=PurchaseOrderResponse)
def create_purchase_order(payload: PurchaseOrderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check duplicate PO number
    if db.query(PurchaseOrder).filter(PurchaseOrder.po_number == payload.po_number).first():
        raise HTTPException(status_code=400, detail="PO Number already exists")

    po = PurchaseOrder(
        po_number=payload.po_number,
        supplier_id=payload.supplier_id,
        order_date=payload.order_date
    )
    db.add(po)
    db.commit()
    db.refresh(po)

    for line in payload.lines:
        db_line = PurchaseOrderLine(
            purchase_order_id=po.id,
            item_id=line.item_id,
            qty=line.qty,
            unit_price=line.unit_price,
            due_date=line.due_date
        )
        db.add(db_line)
        db.commit()
        db.refresh(db_line)
        
        if line.attribute_value_ids:
            for val_id in line.attribute_value_ids:
                val = db.query(AttributeValue).filter(AttributeValue.id == val_id).first()
                if val:
                    db_line.attribute_values.append(val)
            db.commit()

    return po

@router.get("", response_model=list[PurchaseOrderResponse])
def get_purchase_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(PurchaseOrder).order_by(PurchaseOrder.created_at.desc()).all()

@router.delete("/{po_id}")
def delete_purchase_order(po_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    
    db.delete(po)
    db.commit()
    return {"status": "success"}
