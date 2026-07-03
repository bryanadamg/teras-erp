"""add user is_active

Revision ID: 7bf93345a063
Revises: e868aacc3702
Create Date: 2026-07-03 03:32:09.901303

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '7bf93345a063'
down_revision: Union[str, None] = 'e868aacc3702'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'is_active')
