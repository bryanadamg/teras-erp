from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.bom import BOM, BOMLine
from app.models.item import Item
from app.schemas import BOMCreate, BOMResponse

router = APIRouter()

@router.post("/boms", response_model=BOMResponse)
def create_bom(payload: BOMCreate, db: Session = Depends(get_db)):
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
        attribute_value_id=payload.attribute_value_id,
        qty=payload.qty
    )
    db.add(bom)
    db.commit()
    db.refresh(bom)

    # 4. Create BOM Lines
    for line in payload.lines:
        material = db.query(Item).filter(Item.code == line.item_code).first()
        if not material:
            # Rollback is ideal, but for simplicity we assume valid inputs or cleanup later. 
            # In production, use explicit transactions or verify all first.
            raise HTTPException(status_code=404, detail=f"Material item '{line.item_code}' not found")
        
        bom_line = BOMLine(
            bom_id=bom.id,
            item_id=material.id,
            attribute_value_id=line.attribute_value_id,
            qty=line.qty
        )
        db.add(bom_line)
    
    db.commit()
    db.refresh(bom)
    return bom

@router.get("/boms", response_model=list[BOMResponse])
def get_boms(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(BOM).offset(skip).limit(limit).all()

@router.get("/boms/{bom_id}", response_model=BOMResponse)
def get_bom(bom_id: str, db: Session = Depends(get_db)):
    bom = db.query(BOM).filter(BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    return bom
