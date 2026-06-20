"""add packaging counts (cones/boxes/drums) to stock ledger and balances

Revision ID: a2c4e6f8b1d3
Revises: f1c2a3b4d5e7
Create Date: 2026-06-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a2c4e6f8b1d3'
down_revision: Union[str, None] = 'f1c2a3b4d5e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ledger: signed per-movement deltas, nullable (null = not applicable)
    op.add_column('stock_ledger', sa.Column('qty_cones_change', sa.Integer(), nullable=True))
    op.add_column('stock_ledger', sa.Column('qty_boxes_change', sa.Integer(), nullable=True))
    op.add_column('stock_ledger', sa.Column('qty_drums_change', sa.Integer(), nullable=True))

    # Balances: aggregated counts, NOT NULL default 0
    op.add_column('stock_balances', sa.Column('qty_cones', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('stock_balances', sa.Column('qty_boxes', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('stock_balances', sa.Column('qty_drums', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('stock_balances', 'qty_drums')
    op.drop_column('stock_balances', 'qty_boxes')
    op.drop_column('stock_balances', 'qty_cones')
    op.drop_column('stock_ledger', 'qty_drums_change')
    op.drop_column('stock_ledger', 'qty_boxes_change')
    op.drop_column('stock_ledger', 'qty_cones_change')
