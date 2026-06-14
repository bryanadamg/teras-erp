"""add_cones_drums_to_gr_lines

Revision ID: b7c8d9e0f1a2
Revises: a5b6c7d8e9f1
Create Date: 2026-06-14 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a5b6c7d8e9f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goods_receipt_lines', sa.Column('qty_cones', sa.Integer(), nullable=True))
    op.add_column('goods_receipt_lines', sa.Column('qty_drums', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('goods_receipt_lines', 'qty_drums')
    op.drop_column('goods_receipt_lines', 'qty_cones')
