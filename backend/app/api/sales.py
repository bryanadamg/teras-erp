from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.item import Item
from app.schemas import SalesOrderCreate, SalesOrderResponse

router = APIRouter()

@router.post("/sales-orders", response_model=SalesOrderResponse)
def create_sales_order(payload: SalesOrderCreate, db: Session = Depends(get_db)):
    if db.query(SalesOrder).filter(SalesOrder.po_number == payload.po_number).first():
        raise HTTPException(status_code=400, detail="PO Number already exists")
    
    so = SalesOrder(
        po_number=payload.po_number,
        customer_name=payload.customer_name,
        order_date=payload.order_date
    )
    db.add(so)
    db.commit()
    db.refresh(so)

    for line in payload.lines:
        # Validate Item
        item = db.query(Item).filter(Item.id == line.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
            
        so_line = SalesOrderLine(
            sales_order_id=so.id,
            item_id=line.item_id,
            qty=line.qty,
            due_date=line.due_date
        )
        
        # Link attributes
        if line.attribute_value_ids:
            from app.models.attribute import AttributeValue
            attrs = db.query(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids)).all()
            so_line.attribute_values = attrs
            
        db.add(so_line)
    
    db.commit()
    db.refresh(so)
    return so

@router.get("/sales-orders", response_model=list[SalesOrderResponse])
def get_sales_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    orders = db.query(SalesOrder).order_by(SalesOrder.created_at.desc()).offset(skip).limit(limit).all()
    for order in orders:
        for line in order.lines:
            line.attribute_value_ids = [v.id for v in line.attribute_values]
    return orders

@router.delete("/sales-orders/{so_id}")
def delete_sales_order(so_id: str, db: Session = Depends(get_db)):
    so = db.query(SalesOrder).filter(SalesOrder.id == so_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales Order not found")
    db.delete(so)
    db.commit()
    return {"status": "success", "message": "Sales Order deleted"}
