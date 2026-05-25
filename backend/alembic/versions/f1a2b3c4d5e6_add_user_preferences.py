"""add_user_preferences

Revision ID: f1a2b3c4d5e6
Revises: 7736ae999657
Create Date: 2026-05-25 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = '7736ae999657'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_preferences',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('key', sa.String(128), nullable=False),
        sa.Column('value', JSON, nullable=False),
        sa.UniqueConstraint('user_id', 'key', name='uq_user_preferences_user_id_key'),
    )


def downgrade() -> None:
    op.drop_table('user_preferences')
