from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.models.bom import BOM, BOMLine, BOMOperation
from app.models.item import Item
from app.models.location import Location
from app.models.routing import WorkCenter, Operation
from app.schemas import BOMCreate, BOMResponse
from app.models.auth import User
from app.api.auth import get_current_user
from app.services import audit_service

router = APIRouter()

from app.models.attribute import AttributeValue

@router.post("/boms", response_model=BOMResponse)
def create_bom(payload: BOMCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Resolve Produced Item
    item = db.query(Item).filter(Item.code == payload.item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Produced item '{payload.item_code}' not found")
    
    # 2. Check if BOM code exists
    if db.query(BOM).filter(BOM.code == payload.code).first():
        raise HTTPException(status_code=400, detail="BOM Code already exists")

    # 3. Create BOM Header
    bom = BOM(
        code=payload.code,
        description=payload.description,
        item_id=item.id,
        qty=payload.qty
    )
    
    if payload.attribute_value_ids:
        vals = db.query(AttributeValue).filter(AttributeValue.id.in_(payload.attribute_value_ids)).all()
        bom.attribute_values = vals

    db.add(bom)
    db.commit()
    db.refresh(bom)

    # 4. Create BOM Lines
    for line in payload.lines:
        material = db.query(Item).filter(Item.code == line.item_code).first()
        if not material:
            raise HTTPException(status_code=404, detail=f"Material item '{line.item_code}' not found")
        
        bom_line = BOMLine(
            bom_id=bom.id,
            item_id=material.id,
            qty=line.qty
        )
        
        # Resolve source location if provided
        if line.source_location_code:
            loc = db.query(Location).filter(Location.code == line.source_location_code).first()
            if not loc:
                raise HTTPException(status_code=404, detail=f"Source Location '{line.source_location_code}' not found")
            bom_line.source_location_id = loc.id
        
        if line.attribute_value_ids:
            vals = db.query(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids)).all()
            bom_line.attribute_values = vals

        db.add(bom_line)
    
    db.commit()
    db.refresh(bom)
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="BOM",
        entity_id=str(bom.id),
        details=f"Created BOM {bom.code} for {item.code}",
        changes=payload.dict()
    )
    
    # Populate IDs for schema response
    bom.attribute_value_ids = [v.id for v in bom.attribute_values]
    for line in bom.lines:
        line.attribute_value_ids = [v.id for v in line.attribute_values]
    
    return bom

@router.get("/boms", response_model=list[BOMResponse])
def get_boms(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    items = db.query(BOM).offset(skip).limit(limit).all()
    for item in items:
        # Populate IDs for schema
        item.attribute_value_ids = [v.id for v in item.attribute_values]
        for line in item.lines:
            line.attribute_value_ids = [v.id for v in line.attribute_values]
    return items

@router.get("/boms/{bom_id}", response_model=BOMResponse)
def get_bom(bom_id: str, db: Session = Depends(get_db)):
    bom = db.query(BOM).filter(BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    bom.attribute_value_ids = [v.id for v in bom.attribute_values]
    for line in bom.lines:
        line.attribute_value_ids = [v.id for v in line.attribute_values]
        
    return bom

@router.delete("/boms/{bom_id}")
def delete_bom(bom_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    bom = db.query(BOM).filter(BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    
    details = f"Deleted BOM {bom.code}"
    
    try:
        db.delete(bom)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete BOM because it is currently used by one or more Work Orders. Please delete or complete the associated Work Orders first."
        )
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="BOM",
        entity_id=bom_id,
        details=details
    )
    
    return {"status": "success", "message": "BOM deleted"}
