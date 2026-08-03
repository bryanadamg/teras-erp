"""backfill mo_completions.work_center_id from their work order

The Work Center picker on the completion form is optional, so most logs were saved
with work_center_id NULL even though the WO was dispatched to a machine. Anything
that reports production per machine missed those rows entirely — the weaving
monitor's actual_kg (weaving_service.sum_actual_kg filters on work_center_id) read
0 no matter how much was logged. add_mo_completion now defaults the column to the
WO's machine; this backfills the history so existing runs report correctly.

Data-only migration: no schema change, and it never overwrites a value an operator
actually chose.

Revision ID: a4c6e8b0d2f5
Revises: f3b7d9c1a5e2
"""
from alembic import op

revision = 'a4c6e8b0d2f5'
down_revision = 'f3b7d9c1a5e2'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        UPDATE mo_completions c
           SET work_center_id = w.work_center_id
          FROM work_orders w
         WHERE c.work_order_id = w.id
           AND c.work_center_id IS NULL
           AND w.work_center_id IS NOT NULL
    """)


def downgrade():
    # Irreversible by design: the pre-backfill NULLs carried no information, so
    # there is nothing to restore and blanking the column again would lose the
    # values new logs write legitimately.
    pass
