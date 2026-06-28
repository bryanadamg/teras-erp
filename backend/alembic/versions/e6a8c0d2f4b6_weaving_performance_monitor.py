"""work-center performance monitor: weaving_runs + work_center_holidays + calendar

New per-machine performance monitoring (loom efficiency). Adds:
  - work_centers.working_weekdays (production calendar: which weekdays a machine runs)
  - work_center_holidays (per-machine non-working days)
  - weaving_runs (a tracked MO run on a machine; lines, rate/line, target eff%, dates)

Revision ID: e6a8c0d2f4b6
Revises: d8f0b2c4e6a9
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'e6a8c0d2f4b6'
down_revision: Union[str, None] = 'd8f0b2c4e6a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Per-machine production calendar: which weekdays this machine runs (0=Mon..6=Sun)
    op.add_column(
        'work_centers',
        sa.Column('working_weekdays', sa.JSON(), nullable=True, server_default=sa.text("'[0, 1, 2, 3, 4]'")),
    )

    op.create_table(
        'work_center_holidays',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('work_center_id', UUID(as_uuid=True), nullable=False),
        sa.Column('holiday_date', sa.Date(), nullable=False),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_work_center_holidays'),
        sa.ForeignKeyConstraint(
            ['work_center_id'], ['work_centers.id'],
            name='fk_work_center_holidays_work_center_id_work_centers', ondelete='CASCADE',
        ),
    )
    op.create_index('ix_work_center_holidays_work_center_id', 'work_center_holidays', ['work_center_id'])

    op.create_table(
        'weaving_runs',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('work_center_id', UUID(as_uuid=True), nullable=False),
        sa.Column('mo_id', UUID(as_uuid=True), nullable=False),
        sa.Column('lines', sa.Integer(), nullable=False),
        sa.Column('rate_per_line_g_min', sa.Numeric(10, 3), nullable=False),
        sa.Column('target_efficiency_pct', sa.Numeric(6, 2), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('actual_qty_override', sa.Numeric(14, 4), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_weaving_runs'),
        sa.ForeignKeyConstraint(
            ['work_center_id'], ['work_centers.id'],
            name='fk_weaving_runs_work_center_id_work_centers', ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['mo_id'], ['manufacturing_orders.id'],
            name='fk_weaving_runs_mo_id_manufacturing_orders', ondelete='CASCADE',
        ),
    )
    op.create_index('ix_weaving_runs_work_center_id', 'weaving_runs', ['work_center_id'])
    op.create_index('ix_weaving_runs_mo_id', 'weaving_runs', ['mo_id'])
    op.create_index('ix_weaving_runs_status', 'weaving_runs', ['status'])
    op.create_index('ix_weaving_runs_created_at', 'weaving_runs', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_weaving_runs_created_at', table_name='weaving_runs')
    op.drop_index('ix_weaving_runs_status', table_name='weaving_runs')
    op.drop_index('ix_weaving_runs_mo_id', table_name='weaving_runs')
    op.drop_index('ix_weaving_runs_work_center_id', table_name='weaving_runs')
    op.drop_table('weaving_runs')

    op.drop_index('ix_work_center_holidays_work_center_id', table_name='work_center_holidays')
    op.drop_table('work_center_holidays')

    op.drop_column('work_centers', 'working_weekdays')
