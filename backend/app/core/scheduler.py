import logging
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_BACKUP_JOB_ID = "scheduled_backup"


def _cron_kwargs(schedule) -> dict:
    kwargs = {"hour": schedule.hour, "minute": schedule.minute, "timezone": schedule.timezone}
    if schedule.frequency == "weekly" and schedule.day_of_week is not None:
        kwargs["day_of_week"] = schedule.day_of_week
    return kwargs


class BackupScheduler:
    """Thin wrapper around a single AsyncIOScheduler instance. Started/stopped from
    main.py's lifespan (same start-in-lifespan/stop-in-lifespan pattern already used
    for the websocket redis manager) — the only recurring-job runner in the app."""

    def __init__(self):
        self._scheduler: Optional[AsyncIOScheduler] = None

    def start(self) -> None:
        if self._scheduler is None:
            self._scheduler = AsyncIOScheduler()
            self._scheduler.start()

    def shutdown(self) -> None:
        if self._scheduler is not None:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None

    def reschedule(self, schedule) -> None:
        """(Re)registers the recurring backup job from a BackupSchedule row so an
        admin's edit takes effect immediately, no restart needed. Removes the job
        entirely when the schedule is disabled."""
        if self._scheduler is None:
            return
        if self._scheduler.get_job(_BACKUP_JOB_ID):
            self._scheduler.remove_job(_BACKUP_JOB_ID)
        if not schedule.enabled:
            return
        from app.services.backup_schedule_service import run_scheduled_backup
        self._scheduler.add_job(
            run_scheduled_backup,
            trigger=CronTrigger(**_cron_kwargs(schedule)),
            id=_BACKUP_JOB_ID,
            replace_existing=True,
            misfire_grace_time=3600,
        )

    def next_run_time(self, schedule) -> Optional[datetime]:
        """Computes the next fire time for a schedule without requiring it to be
        registered — used by the API to show "Next run" right after a save."""
        if not schedule.enabled:
            return None
        trigger = CronTrigger(**_cron_kwargs(schedule))
        now = datetime.now(ZoneInfo(schedule.timezone))
        return trigger.get_next_fire_time(None, now)


backup_scheduler = BackupScheduler()
