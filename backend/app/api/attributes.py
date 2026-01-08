from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.attribute import Attribute, AttributeValue
from app.schemas import AttributeCreate, AttributeResponse, AttributeValueCreate

router = APIRouter()

@router.post("/attributes", response_model=AttributeResponse)
def create_attribute(payload: AttributeCreate, db: Session = Depends(get_db)):
    db_attr = db.query(Attribute).filter(Attribute.name == payload.name).first()
    if db_attr:
        raise HTTPException(status_code=400, detail="Attribute already exists")
    
    attribute = Attribute(name=payload.name)
    db.add(attribute)
    db.commit()
    db.refresh(attribute)

    for v in payload.values:
        attr_val = AttributeValue(attribute_id=attribute.id, value=v.value)
        db.add(attr_val)
    
    db.commit()
    db.refresh(attribute)
    return attribute

@router.get("/attributes", response_model=list[AttributeResponse])
def get_attributes(db: Session = Depends(get_db)):
    return db.query(Attribute).all()
