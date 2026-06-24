"""add rejection reason/notes to sample_colors

Revision ID: f2a4b6c8d0e1
Revises: e4f6a8b0c2d5
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f2a4b6c8d0e1'
down_revision: Union[str, None] = 'e4f6a8b0c2d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sample_colors', sa.Column('rejection_reason', sa.String(255), nullable=True))
    op.add_column('sample_colors', sa.Column('rejection_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sample_colors', 'rejection_notes')
    op.drop_column('sample_colors', 'rejection_reason')
