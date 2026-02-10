from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.sample import SampleRequest
from app.models.sales import SalesOrder
from app.models.item import Item
from app.models.attribute import AttributeValue
from app.schemas import SampleRequestCreate, SampleRequestResponse
from app.models.auth import User
from app.api.auth import get_current_user
from app.services import audit_service
from datetime import datetime

router = APIRouter()

@router.post("/samples", response_model=SampleRequestResponse)
def create_sample_request(payload: SampleRequestCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="SampleRequest",
        entity_id=str(sample.id),
        details=f"Created Sample Request {sample.code}",
        changes=payload.dict()
    )
    
    return sample

@router.get("/samples", response_model=list[SampleRequestResponse])
def get_samples(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(SampleRequest).order_by(SampleRequest.created_at.desc()).offset(skip).limit(limit).all()

@router.put("/samples/{sample_id}/status")
def update_sample_status(sample_id: str, status: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sample = db.query(SampleRequest).filter(SampleRequest.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
        
    valid_statuses = ["DRAFT", "IN_PRODUCTION", "SENT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    previous_status = sample.status
    sample.status = status
    
    # Logic for Rejection -> Version Bump?
    # For now, we just update status. V2 creation is a manual "Duplicate" action on frontend.
    
    db.commit()
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE_STATUS",
        entity_type="SampleRequest",
        entity_id=sample_id,
        details=f"Updated Sample {sample.code} status from {previous_status} to {status}",
        changes={"status": status, "previous_status": previous_status}
    )
    
    return {"status": "success", "message": f"Sample updated to {status}"}

@router.delete("/samples/{sample_id}")
def delete_sample(sample_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sample = db.query(SampleRequest).filter(SampleRequest.id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    
    details = f"Deleted Sample {sample.code}"
    
    db.delete(sample)
    db.commit()
    
    audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="SampleRequest",
        entity_id=sample_id,
        details=details
    )
    
    return {"status": "success", "message": "Sample deleted"}
