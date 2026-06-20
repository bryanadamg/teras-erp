"""add supplier delivery note fields to goods receipts

Revision ID: b3d5f7a9c1e4
Revises: a2c4e6f8b1d3
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b3d5f7a9c1e4'
down_revision: Union[str, None] = 'a2c4e6f8b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goods_receipts', sa.Column('delivery_note_number', sa.String(length=64), nullable=True))
    op.add_column('goods_receipts', sa.Column('delivery_note_date', sa.Date(), nullable=True))
    op.add_column('goods_receipts', sa.Column('delivery_note_url', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('goods_receipts', 'delivery_note_url')
    op.drop_column('goods_receipts', 'delivery_note_date')
    op.drop_column('goods_receipts', 'delivery_note_number')
