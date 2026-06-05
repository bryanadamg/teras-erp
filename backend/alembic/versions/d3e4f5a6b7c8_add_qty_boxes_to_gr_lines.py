"""add_qty_boxes_to_gr_lines

Revision ID: d3e4f5a6b7c8
Revises: bc5e9d31cee8
Create Date: 2026-06-05 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'bc5e9d31cee8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'goods_receipt_lines',
        sa.Column('qty_boxes', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('goods_receipt_lines', 'qty_boxes')
