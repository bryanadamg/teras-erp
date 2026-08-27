import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.db_manager import db_manager
from app.core.scheduler import backup_scheduler
from app.models.audit import AuditLog
from app.models.settings import BackupSchedule

logger = logging.getLogger(__name__)

_UPDATABLE_FIELDS = ("enabled", "frequency", "day_of_week", "hour", "minute", "timezone", "retain_count")


def get_or_create_schedule(db: Session) -> BackupSchedule:
    schedule = db.query(BackupSchedule).first()
    if not schedule:
        schedule = BackupSchedule()
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
    return schedule


def update_schedule(db: Session, schedule: BackupSchedule, data: dict, user_id: Optional[UUID]) -> BackupSchedule:
    for field in _UPDATABLE_FIELDS:
        if field in data:
            setattr(schedule, field, data[field])
    schedule.updated_by_id = user_id
    schedule.updated_at = datetime.utcnow()
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    backup_scheduler.reschedule(schedule)
    return schedule


async def run_scheduled_backup():
    """Entry point invoked by the scheduler (and by the admin "Run Now" action).
    Uses its own short-lived sync session since a scheduler-fired job runs outside
    any request context, mirroring admin.py's _log_admin_action pattern. Returns
    the DatabaseResponse from create_snapshot (None if no schedule row exists yet)."""
    session = db_manager.session_factory()
    try:
        schedule = session.query(BackupSchedule).first()
        if not schedule:
            return None

        result = await db_manager.create_snapshot(label="scheduled")
        schedule.last_run_at = datetime.utcnow()

        if result.status:
            schedule.last_run_status = "success"
            schedule.last_run_error = None
            pruned = db_manager.prune_old_scheduled_snapshots(schedule.retain_count)
            details = f"{result.message}; pruned {pruned} old scheduled snapshot(s)"
            session.add(AuditLog(user_id=schedule.updated_by_id, action="DB_BACKUP_SCHEDULED_RUN", entity_type="Database", entity_id="admin", details=details))
        else:
            schedule.last_run_status = "failed"
            schedule.last_run_error = result.message
            session.add(AuditLog(user_id=schedule.updated_by_id, action="DB_BACKUP_SCHEDULED_FAILED", entity_type="Database", entity_id="admin", details=result.message))

        session.add(schedule)
        session.commit()
        return result
    except Exception as e:
        logger.error(f"Scheduled backup run failed: {e}")
        session.rollback()
        raise
    finally:
        session.close()
