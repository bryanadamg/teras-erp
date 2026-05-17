"""add_bom_automator_profiles

Revision ID: c8f2e9a1b3d5
Revises: b2c3d4e5f6a7
Create Date: 2026-05-17 09:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision: str = 'c8f2e9a1b3d5'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bom_automator_profiles',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('levels', JSON, nullable=False),
    )


def downgrade() -> None:
    op.drop_table('bom_automator_profiles')
