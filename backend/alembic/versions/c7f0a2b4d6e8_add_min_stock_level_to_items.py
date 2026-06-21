"""add min_stock_level (reorder point) to items

Revision ID: c7f0a2b4d6e8
Revises: b3d5f7a9c1e4
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c7f0a2b4d6e8'
down_revision: Union[str, None] = 'b3d5f7a9c1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('items', sa.Column('min_stock_level', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('items', 'min_stock_level')
