"""add work_order_id to weaving_runs

A loom runs several WOs of the same item at once (one per combo), each with its own
line count and its own promised end date, so a run is keyed on the WO. Nullable:
pre-existing runs and looms with no WO dispatched keep reporting at MO grain.

Revision ID: f4a6c8e0b2d1
Revises: e5a7c9b1d3f6
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f4a6c8e0b2d1'
down_revision: Union[str, Sequence[str], None] = 'e5a7c9b1d3f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('weaving_runs')}
    if 'work_order_id' not in cols:
        op.add_column(
            'weaving_runs',
            sa.Column('work_order_id', postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_index('ix_weaving_runs_work_order_id', 'weaving_runs', ['work_order_id'])
        op.create_foreign_key(
            'fk_weaving_runs_work_order_id', 'weaving_runs', 'work_orders',
            ['work_order_id'], ['id'], ondelete='SET NULL',
        )


def downgrade() -> None:
    op.drop_constraint('fk_weaving_runs_work_order_id', 'weaving_runs', type_='foreignkey')
    op.drop_index('ix_weaving_runs_work_order_id', table_name='weaving_runs')
    op.drop_column('weaving_runs', 'work_order_id')
