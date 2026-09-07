"""backfill dyeing_runs.status from the work order

A dyeing run's status was written independently of the WO the bath belongs to, so
the two could disagree: 4 of 12 rows on the dev DB had a `COMPLETED` work order and
a `PENDING` run, and "is this bath finished" had two answers. The status is now
derived in one place (`services/dyeing_run_service.derive_status`) and rewritten
whenever either side moves; this recomputes the rows already on disk with the same
rule.

The rule, in order: the WO cancelled → CANCELLED; the bath closed (`completed_at`)
or the WO closed → COMPLETED; a bath recorded (`started_at` or a volume) →
IN_PROGRESS; else PENDING.

Data backfill, hand-written: `--autogenerate` produces nothing for this and also
picks up unrelated pre-existing schema drift on this database.

`setting_runs` is deliberately untouched — SettingRun has the same shape but is not
part of this change.

Revision ID: b6d8f0a2c4e7
Revises: d5b7f9a1c3e6
Create Date: 2026-09-07
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b6d8f0a2c4e7'
down_revision: Union[str, None] = 'd5b7f9a1c3e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE dyeing_runs AS r
        SET status = CASE
            WHEN w.status = 'CANCELLED' THEN 'CANCELLED'
            WHEN r.completed_at IS NOT NULL OR w.status = 'COMPLETED' THEN 'COMPLETED'
            WHEN r.started_at IS NOT NULL OR r.volume_air_liters IS NOT NULL THEN 'IN_PROGRESS'
            ELSE 'PENDING'
        END
        FROM work_orders AS w
        WHERE w.id = r.work_order_id
    """)


def downgrade() -> None:
    # Nothing to restore: the pre-backfill values were the drift itself, and a row
    # that already agreed with its WO is indistinguishable from one this fixed.
    pass
