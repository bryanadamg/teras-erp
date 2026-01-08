from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services import item_service, stock_service
from app.schemas import ItemCreate, ItemResponse, StockEntryCreate
from app.models.location import Location

router = APIRouter()

@router.post("/items", response_model=ItemResponse)
def create_item_api(payload: ItemCreate, db: Session = Depends(get_db)):
    db_item = item_service.get_item_by_code(db, code=payload.code)
    if db_item:
        raise HTTPException(status_code=400, detail="Item already exists")
    return item_service.create_item(
        db,
        code=payload.code,
        name=payload.name,
        uom=payload.uom
    )

@router.post("/items/stock")
def add_stock_api(payload: StockEntryCreate, db: Session = Depends(get_db)):
    # Resolve Item
    item = item_service.get_item_by_code(db, payload.item_code)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Resolve Location
    location = db.query(Location).filter(Location.code == payload.location_code).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    stock_service.add_stock_entry(
        db,
        item_id=item.id,
        location_id=location.id,
        qty_change=payload.qty,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id
    )
    return {"status": "success", "message": "Stock recorded"}
