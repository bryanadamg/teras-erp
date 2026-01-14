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
        variants=payload.variants
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

@router.post("/items/{item_id}/variants")
def add_item_variant_api(item_id: str, payload: VariantCreate, db: Session = Depends(get_db)):
    return item_service.add_variant_to_item(db, item_id, payload)

@router.delete("/items/variants/{variant_id}")
def delete_item_variant_api(variant_id: str, db: Session = Depends(get_db)):
    item_service.delete_variant(db, variant_id)
    return {"status": "success", "message": "Variant deleted"}

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

    # Validate Variant if provided
    if payload.variant_id:
        variant_exists = any(v.id == payload.variant_id for v in item.variants)
        if not variant_exists:
             raise HTTPException(status_code=400, detail="Variant does not belong to this item")

    stock_service.add_stock_entry(
        db,
        item_id=item.id,
        location_id=location.id,
        variant_id=payload.variant_id,
        qty_change=payload.qty,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id
    )
    return {"status": "success", "message": "Stock recorded"}
