"""add allowed_work_center_types to roles

Revision ID: e235f74a2780
Revises: e1a3c5b7d9f0
Create Date: 2026-07-06

Station-type restriction for work_order.* actions, mirrors
User.allowed_categories: null = unrestricted, set = role's WO actions only
apply to WOs whose work_center.center_type is in the list.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e235f74a2780'
down_revision: Union[str, None] = 'e1a3c5b7d9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('roles', sa.Column('allowed_work_center_types', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('roles', 'allowed_work_center_types')
