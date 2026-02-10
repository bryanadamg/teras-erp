from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.audit import AuditLog
from app.schemas import AuditLogResponse
from typing import Optional

router = APIRouter()

@router.get("/audit-logs", response_model=list[AuditLogResponse])
def get_audit_logs(
    skip: int = 0, 
    limit: int = 100, 
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
        
    return query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
