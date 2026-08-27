import asyncio

from app.core.db_manager import db_manager
from app.models.audit import AuditLog
from app.models.settings import BackupSchedule
from app.schemas import DatabaseResponse
from app.services import backup_schedule_service as svc


def _delete_audit_logs_for(user_id):
    """`_log_admin_action` (admin.py) commits through its own real session,
    independent of the test's rollback-scoped `db_session` — so a PUT that
    logs an admin action leaves a real row behind. Clean it up before
    `committed_admin`'s teardown tries to hard-delete that same user, or the
    delete FK-violates against the audit log still referencing it."""
    session = db_manager.session_factory()
    session.query(AuditLog).filter(AuditLog.user_id == user_id).delete()
    session.commit()
    session.close()


def test_get_backup_schedule_creates_default(client, auth_headers):
    res = client.get("/api/admin/database/backup-schedule", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["enabled"] is False
    assert body["frequency"] == "daily"
    assert body["retain_count"] >= 1
    assert body["next_run_at"] is None  # disabled schedules have no next run


def test_update_backup_schedule_weekly_requires_day(client, auth_headers):
    payload = {
        "enabled": True, "frequency": "weekly", "day_of_week": None,
        "hour": 3, "minute": 0, "timezone": "Asia/Jakarta", "retain_count": 7,
    }
    res = client.put("/api/admin/database/backup-schedule", json=payload, headers=auth_headers)
    assert res.status_code == 400


def test_update_backup_schedule_persists_and_computes_next_run(client, auth_headers, test_user):
    payload = {
        "enabled": True, "frequency": "weekly", "day_of_week": 2,
        "hour": 3, "minute": 30, "timezone": "Asia/Jakarta", "retain_count": 7,
    }
    try:
        res = client.put("/api/admin/database/backup-schedule", json=payload, headers=auth_headers)
        assert res.status_code == 200
        body = res.json()
        assert body["enabled"] is True
        assert body["frequency"] == "weekly"
        assert body["day_of_week"] == 2
        assert body["retain_count"] == 7
        assert body["next_run_at"] is not None

        # Persisted, not just echoed back
        res2 = client.get("/api/admin/database/backup-schedule", headers=auth_headers)
        assert res2.json()["retain_count"] == 7
    finally:
        _delete_audit_logs_for(test_user.id)


def test_update_backup_schedule_rejects_bad_retain_count(client, auth_headers):
    payload = {
        "enabled": False, "frequency": "daily", "day_of_week": None,
        "hour": 3, "minute": 0, "timezone": "Asia/Jakarta", "retain_count": 0,
    }
    res = client.put("/api/admin/database/backup-schedule", json=payload, headers=auth_headers)
    assert res.status_code == 400


def _commit_schedule(**overrides):
    """run_scheduled_backup() reads/writes through its own short-lived session
    (db_manager.session_factory()), independent of the test's rollback-scoped
    `db_session` — so the row it needs to see has to be committed for real.

    BackupSchedule is a singleton-by-convention table (like CompanyProfile) —
    nothing enforces it at the schema level, and the app's lifespan already
    committed a default row on TestClient startup. `run_scheduled_backup`'s
    `.first()` would otherwise nondeterministically pick that row instead of
    this one, so clear the table first to guarantee there's exactly one."""
    session = db_manager.session_factory()
    session.query(BackupSchedule).delete()
    schedule = BackupSchedule(**{
        "enabled": True, "frequency": "daily", "hour": 3, "minute": 0,
        "timezone": "Asia/Jakarta", "retain_count": 3, **overrides,
    })
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    schedule_id = schedule.id
    session.close()
    return schedule_id


def _delete_schedule(schedule_id):
    session = db_manager.session_factory()
    session.query(BackupSchedule).filter(BackupSchedule.id == schedule_id).delete()
    session.commit()
    session.close()


def test_run_scheduled_backup_success(monkeypatch):
    schedule_id = _commit_schedule()
    monkeypatch.setattr(
        db_manager, "create_snapshot",
        lambda label="manual": asyncio.sleep(0, result=DatabaseResponse(message="ok", status=True, data={"filename": "x.sql"})),
    )
    monkeypatch.setattr(db_manager, "prune_old_scheduled_snapshots", lambda retain_count: 2)

    try:
        result = asyncio.run(svc.run_scheduled_backup())
        assert result.status is True

        session = db_manager.session_factory()
        schedule = session.query(BackupSchedule).filter(BackupSchedule.id == schedule_id).first()
        assert schedule.last_run_status == "success"
        assert schedule.last_run_error is None
        assert schedule.last_run_at is not None
        session.close()
    finally:
        _delete_schedule(schedule_id)


def test_run_scheduled_backup_failure_recorded(monkeypatch):
    schedule_id = _commit_schedule()
    monkeypatch.setattr(
        db_manager, "create_snapshot",
        lambda label="manual": asyncio.sleep(0, result=DatabaseResponse(message="pg_dump failed: boom", status=False)),
    )

    try:
        result = asyncio.run(svc.run_scheduled_backup())
        assert result.status is False

        session = db_manager.session_factory()
        schedule = session.query(BackupSchedule).filter(BackupSchedule.id == schedule_id).first()
        assert schedule.last_run_status == "failed"
        assert "boom" in schedule.last_run_error
        session.close()
    finally:
        _delete_schedule(schedule_id)


def test_prune_old_scheduled_snapshots_keeps_newest_and_spares_manual(tmp_path, monkeypatch):
    monkeypatch.setattr(db_manager, "_snapshots_dir", tmp_path)

    import time
    for ts in ["a", "b", "c", "d", "e"]:
        (tmp_path / f"snapshot_scheduled_2026010{ord(ts) - ord('a') + 1}_010101.sql").write_text("x")
        time.sleep(0.01)  # distinct mtimes so list_snapshots' created_at ordering is deterministic
    (tmp_path / "snapshot_manual_20260101_010101.sql").write_text("x")
    (tmp_path / "snapshot_manual_20260102_010101.sql").write_text("x")

    deleted = db_manager.prune_old_scheduled_snapshots(retain_count=2)
    assert deleted == 3

    remaining = db_manager.list_snapshots()
    scheduled = [f for f in remaining if f["label"] == "scheduled"]
    manual = [f for f in remaining if f["label"] == "manual"]
    assert len(scheduled) == 2
    assert len(manual) == 2  # manual snapshots are never pruned
