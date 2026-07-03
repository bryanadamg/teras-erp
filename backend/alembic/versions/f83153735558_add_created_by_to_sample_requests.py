"""add created_by to sample_requests

Revision ID: f83153735558
Revises: f62afa39fac1
Create Date: 2026-07-03 08:50:58.456108

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f83153735558'
down_revision: Union[str, None] = 'f62afa39fac1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sample_requests', sa.Column('created_by_id', sa.UUID(), nullable=True))
    op.create_foreign_key(op.f('fk_sample_requests_created_by_id_users'), 'sample_requests', 'users', ['created_by_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint(op.f('fk_sample_requests_created_by_id_users'), 'sample_requests', type_='foreignkey')
    op.drop_column('sample_requests', 'created_by_id')
