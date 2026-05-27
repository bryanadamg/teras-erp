"""add_work_center_parent

Revision ID: c1d2e3f4a5b6
Revises: f06cc081a192
Create Date: 2026-05-27 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'f06cc081a192'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('work_centers', sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('work_centers.id'), nullable=True))
    op.create_index('ix_work_centers_parent_id', 'work_centers', ['parent_id'])


def downgrade() -> None:
    op.drop_index('ix_work_centers_parent_id', table_name='work_centers')
    op.drop_column('work_centers', 'parent_id')
