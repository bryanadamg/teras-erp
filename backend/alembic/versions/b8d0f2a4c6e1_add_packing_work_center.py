"""add work_center_id to packing orders and packing completions

Revision ID: b8d0f2a4c6e1
Revises: a6c8e0b2d4f7
Create Date: 2026-08-26

The factory packs on machines, so a packing order is dispatched to a work center
exactly as a WO is, and every pack event records the machine it ran on. The
completion column defaults to the order's machine in the API rather than staying
null when the packer skips the picker — a nullable machine column is what made
per-machine weaving output read 0 (see a4c6e8b0d2f5).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b8d0f2a4c6e1'
down_revision: Union[str, None] = 'a6c8e0b2d4f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'packing_orders',
        sa.Column('work_center_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('ix_packing_orders_work_center_id', 'packing_orders', ['work_center_id'])
    op.create_foreign_key(
        'fk_packing_orders_work_center_id', 'packing_orders', 'work_centers',
        ['work_center_id'], ['id'], ondelete='SET NULL',
    )

    op.add_column(
        'packing_completions',
        sa.Column('work_center_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('ix_packing_completions_work_center_id', 'packing_completions', ['work_center_id'])
    op.create_foreign_key(
        'fk_packing_completions_work_center_id', 'packing_completions', 'work_centers',
        ['work_center_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_packing_completions_work_center_id', 'packing_completions', type_='foreignkey')
    op.drop_index('ix_packing_completions_work_center_id', table_name='packing_completions')
    op.drop_column('packing_completions', 'work_center_id')

    op.drop_constraint('fk_packing_orders_work_center_id', 'packing_orders', type_='foreignkey')
    op.drop_index('ix_packing_orders_work_center_id', table_name='packing_orders')
    op.drop_column('packing_orders', 'work_center_id')
