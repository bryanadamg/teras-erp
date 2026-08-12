from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import User
from app.schemas import AuditLogResponse
from app.api.auth import get_current_user, user_has_permission, require_permission
from typing import Optional

router = APIRouter()

from app.schemas import AuditLogResponse, PaginatedAuditLogResponse # Add Paginated schema

@router.get("/audit-logs", response_model=PaginatedAuditLogResponse)
def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("audit_log.view"))
):
    # Entity-scoped lookups (HistoryPane: "show history for this record") stay
    # open to any authenticated user — they're already viewing a record they
    # have access to. Browsing the full unscoped audit trail (the Admin > Audit
    # Logs page) is sensitive and requires admin.access, matching that page's
    # own nav permission gate.
    if not (entity_type and entity_id) and not user_has_permission(current_user, 'admin.access'):
        raise HTTPException(status_code=403, detail="Missing permission: admin.access")

    query = db.query(AuditLog)

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
        
    total = query.count()
    items = query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1,
        "size": len(items)
    }
