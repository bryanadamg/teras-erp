from sqlalchemy.orm import Session
from app.models.audit import AuditLog
import json

def log_activity(
    db: Session, 
    user_id: str | None, 
    action: str, 
    entity_type: str, 
    entity_id: str, 
    details: str = None, 
    changes: dict = None
):
    """
    Records an activity in the audit log.
    """
    try:
        log = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            details=details,
            changes=changes
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"Failed to create audit log: {e}")
        db.rollback()
