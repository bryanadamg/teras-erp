"""add MRP decoupling point flag to items and bom_lines

Revision ID: d4a6c8e0f2b5
Revises: d3f5b7a9c1e4
Create Date: 2026-07-20

Adds the make-to-stock decoupling policy:
- items.is_decoupling_point (NOT NULL default false) — item-master default.
- bom_lines.is_decoupling_point (nullable) — per-line override, null = inherit item.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a6c8e0f2b5'
down_revision: Union[str, None] = 'd3f5b7a9c1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'items',
        sa.Column('is_decoupling_point', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'bom_lines',
        sa.Column('is_decoupling_point', sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('bom_lines', 'is_decoupling_point')
    op.drop_column('items', 'is_decoupling_point')
