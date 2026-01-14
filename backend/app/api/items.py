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
        attribute_id=payload.attribute_id
    )

@router.get("/items", response_model=list[ItemResponse])
def get_items_api(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return item_service.get_items(db, skip=skip, limit=limit)

@router.put("/items/{item_id}", response_model=ItemResponse)
def update_item_api(item_id: str, payload: ItemUpdate, db: Session = Depends(get_db)):
    item = item_service.update_item(db, item_id, payload.dict(exclude_unset=True))
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
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

    # Validate Attribute Value if provided
    if payload.attribute_value_id:
        # Check if attribute_value belongs to item's bound attribute
        if not item.attribute_id:
             raise HTTPException(status_code=400, detail="Item has no bound attribute")
        
        # Verify value exists and belongs to correct attribute
        from app.models.attribute import AttributeValue
        val = db.query(AttributeValue).filter(AttributeValue.id == payload.attribute_value_id).first()
        if not val or val.attribute_id != item.attribute_id:
             raise HTTPException(status_code=400, detail="Invalid attribute value for this item")

    stock_service.add_stock_entry(
        db,
        item_id=item.id,
        location_id=location.id,
        variant_id=payload.attribute_value_id, # renaming service param next
        qty_change=payload.qty,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id
    )
    return {"status": "success", "message": "Stock recorded"}
