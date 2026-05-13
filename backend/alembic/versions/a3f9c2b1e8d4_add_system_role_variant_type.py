"""add system_role to attributes and variant_type to sample_requests

Revision ID: a3f9c2b1e8d4
Revises: db1bb5dfc21d
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a3f9c2b1e8d4'
down_revision: Union[str, None] = 'db1bb5dfc21d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('attributes', sa.Column('system_role', sa.String(32), nullable=True))
    op.add_column('sample_requests', sa.Column('variant_type', sa.String(16), nullable=False, server_default='color'))


def downgrade() -> None:
    op.drop_column('sample_requests', 'variant_type')
    op.drop_column('attributes', 'system_role')
