from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.sample import SampleRequest
from app.models.sales import SalesOrder
from app.models.item import Item
from app.models.attribute import AttributeValue
from app.schemas import SampleRequestCreate, SampleRequestResponse
from datetime import datetime

router = APIRouter()

@router.post("/samples", response_model=SampleRequestResponse)
def create_sample_request(payload: SampleRequestCreate, db: Session = Depends(get_db)):
    # 1. Generate Code (Simple Auto-Increment Logic for MVP)
    # In production, use a dedicated sequence generator
    count = db.query(SampleRequest).count()
    code = f"SMP-{datetime.now().year}-{str(count + 1).zfill(3)}"
    
    sample = SampleRequest(
        code=code,
        sales_order_id=payload.sales_order_id,
        base_item_id=payload.base_item_id,
        notes=payload.notes,
        status="DRAFT"
    )
    
    # 2. Link Attributes
    if payload.attribute_value_ids:
        attrs = db.query(AttributeValue).filter(AttributeValue.id.in_(payload.attribute_value_ids)).all()
        sample.attribute_values = attrs
        
    db.add(sample)
    db.commit()
    db.refresh(sample)
    return sample

@router.get("/samples", response_model=list[SampleRequestResponse])
def get_samples(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(SampleRequest).order_by(SampleRequest.created_at.desc()).offset(skip).limit(limit).all()

@router.put("/samples/{sample_id}/status")
def update_sample_status(sample_id: str, status: str, db: Session = Depends(get_db)):
    sample = db.query(SampleRequest).filter(SampleRequest.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
        
    valid_statuses = ["DRAFT", "IN_PRODUCTION", "SENT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    sample.status = status
    
    # Logic for Rejection -> Version Bump?
    # For now, we just update status. V2 creation is a manual "Duplicate" action on frontend.
    
    db.commit()
    return {"status": "success", "message": f"Sample updated to {status}"}

@router.delete("/samples/{sample_id}")
def delete_sample(sample_id: str, db: Session = Depends(get_db)):
    sample = db.query(SampleRequest).filter(SampleRequest.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    
    db.delete(sample)
    db.commit()
    return {"status": "success", "message": "Sample deleted"}
