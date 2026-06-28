"""add work order staging: bom_operation_id + staging_status

L2 per-operation material staging. A WO records which routing step (BOM
operation) it executes, so staging/consumption only handle that step's
materials. staging_status tracks line-side staging progress.

Revision ID: f7b9d1e3a5c8
Revises: e6a8c0d2f4b6
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'f7b9d1e3a5c8'
down_revision: Union[str, None] = 'e6a8c0d2f4b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'work_orders',
        sa.Column('bom_operation_id', UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        'work_orders',
        sa.Column('staging_status', sa.String(length=16), nullable=False, server_default='NOT_STAGED'),
    )
    op.create_index('ix_work_orders_bom_operation_id', 'work_orders', ['bom_operation_id'])
    op.create_foreign_key(
        'fk_work_orders_bom_operation_id',
        'work_orders', 'bom_operations',
        ['bom_operation_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_work_orders_bom_operation_id', 'work_orders', type_='foreignkey')
    op.drop_index('ix_work_orders_bom_operation_id', table_name='work_orders')
    op.drop_column('work_orders', 'staging_status')
    op.drop_column('work_orders', 'bom_operation_id')
