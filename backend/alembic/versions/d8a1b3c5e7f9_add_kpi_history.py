"""add kpi_history (daily KPI snapshots for trend charts)

Revision ID: d8a1b3c5e7f9
Revises: c7f0a2b4d6e8
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'd8a1b3c5e7f9'
down_revision: Union[str, None] = 'c7f0a2b4d6e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'kpi_history',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.UniqueConstraint('key', 'snapshot_date', name='uq_kpi_history_key_date'),
    )
    op.create_index('ix_kpi_history_key', 'kpi_history', ['key'])
    op.create_index('ix_kpi_history_snapshot_date', 'kpi_history', ['snapshot_date'])


def downgrade() -> None:
    op.drop_index('ix_kpi_history_snapshot_date', table_name='kpi_history')
    op.drop_index('ix_kpi_history_key', table_name='kpi_history')
    op.drop_table('kpi_history')
