"""add_lab_dip_item_status

Revision ID: d8e0f2a4c6b9
Revises: c7f9b1d3e5a8
Create Date: 2026-07-17 01:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd8e0f2a4c6b9'
down_revision: Union[str, None] = 'c7f9b1d3e5a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lab_dip_items', sa.Column('status', sa.String(length=32), nullable=False, server_default='PENDING'))


def downgrade() -> None:
    op.drop_column('lab_dip_items', 'status')
