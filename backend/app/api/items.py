from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.services import item_service, stock_service, import_service, audit_service
from app.schemas import ItemCreate, ItemResponse, StockEntryCreate, ItemUpdate, VariantCreate, PaginatedItemResponse
from app.models.location import Location
from app.models.auth import User
from app.api.auth import get_current_user

router = APIRouter()

@router.post("/items", response_model=ItemResponse)
def create_item_api(payload: ItemCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_item = item_service.get_item_by_code(db, code=payload.code)
    if db_item:
        raise HTTPException(status_code=400, detail="Item already exists")
    
    item = item_service.create_item(
        db,
        code=payload.code,
        name=payload.name,
        uom=payload.uom,
        category=payload.category,
        source_sample_id=payload.source_sample_id,
        attribute_ids=payload.attribute_ids
    )
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="Item",
        entity_id=str(item.id),
        details=f"Created item {item.code} ({item.name})",
        changes=payload.dict()
    )
    
    return item

@router.get("/items", response_model=PaginatedItemResponse)
def get_items_api(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    items, total = item_service.get_items(db, skip=skip, limit=limit, user=current_user)
    # Populate attribute_ids for response
    for item in items:
        item.attribute_ids = [a.id for a in item.attributes]
    
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1,
        "size": len(items)
    }

@router.put("/items/{item_id}", response_model=ItemResponse)
def update_item_api(item_id: str, payload: ItemUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = item_service.update_item(db, item_id, payload.dict(exclude_unset=True))
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.attribute_ids = [a.id for a in item.attributes]
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="Item",
        entity_id=item_id,
        details=f"Updated item {item.code}",
        changes=payload.dict(exclude_unset=True)
    )
    
    return item

@router.post("/items/stock")
def add_stock_api(payload: StockEntryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="StockEntry",
        entity_id=item.code, # Using code as pseudo-ID for stock entry grouping
        details=f"Manual stock adjustment: {payload.qty} for {item.code} at {location.name}",
        changes=payload.dict()
    )
    
    return {"status": "success", "message": "Stock recorded"}

@router.get("/items/template")
def get_items_template():
    content = import_service.generate_items_template()
    return Response(content=content, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=items_template.csv"})

@router.post("/items/import")
async def import_items(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV.")
    
    content = await file.read()
    results = import_service.import_items_csv(db, content)
    
    if results["errors"]:
        return {"status": "partial_success", "imported": results["success"], "errors": results["errors"]}
    
    return {"status": "success", "imported": results["success"]}

@router.delete("/items/{item_id}")
def delete_item(item_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.item import Item
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Capture details before deletion
    details = f"Deleted item {item.code} ({item.name})"
    
    # Optional: Check for dependencies (stock, BOMs, etc.) before deleting
    # For now, we'll rely on foreign key constraints or cascade deletes
    
    try:
        db.delete(item)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete item {item.code} because it is still being used in one or more Bill of Materials (BOMs) or other records. Please delete the associated records first."
        )
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="Item",
        entity_id=item_id,
        details=details
    )
    
    return {"status": "success", "message": "Item deleted"}
