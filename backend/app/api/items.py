from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services import item_service, stock_service
from app.schemas import ItemCreate, ItemResponse, StockEntryCreate, ItemUpdate, VariantCreate
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
        uom=payload.uom,
        category=payload.category,
        source_sample_id=payload.source_sample_id,
        attribute_ids=payload.attribute_ids
    )

@router.get("/items", response_model=list[ItemResponse])
def get_items_api(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    items = item_service.get_items(db, skip=skip, limit=limit)
    # Populate attribute_ids for response
    for item in items:
        item.attribute_ids = [a.id for a in item.attributes]
    return items

@router.put("/items/{item_id}", response_model=ItemResponse)
def update_item_api(item_id: str, payload: ItemUpdate, db: Session = Depends(get_db)):
    item = item_service.update_item(db, item_id, payload.dict(exclude_unset=True))
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.attribute_ids = [a.id for a in item.attributes]
    return item

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

    # Validate Attribute Values if provided
    if payload.attribute_value_ids:
        from app.models.attribute import AttributeValue
        valid_attr_ids = [a.id for a in item.attributes]
        
        for val_id in payload.attribute_value_ids:
            val = db.query(AttributeValue).filter(AttributeValue.id == val_id).first()
            if not val or val.attribute_id not in valid_attr_ids:
                 raise HTTPException(status_code=400, detail=f"Invalid attribute value {val_id} for this item")

    stock_service.add_stock_entry(
        db,
        item_id=item.id,
        location_id=location.id,
        attribute_value_ids=[str(vid) for vid in payload.attribute_value_ids],
        qty_change=payload.qty,
        reference_type="manual",
        reference_id="manual_entry"
    )
    return {"status": "success", "message": "Stock recorded"}
