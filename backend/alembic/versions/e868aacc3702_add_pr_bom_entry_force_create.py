"""add_pr_bom_entry_force_create

Revision ID: e868aacc3702
Revises: c2d4f6a8b0e1
Create Date: 2026-07-01 14:29:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e868aacc3702'
down_revision: Union[str, None] = 'c2d4f6a8b0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'pr_bom_entries',
        sa.Column('force_create', sa.Boolean(), server_default='false', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('pr_bom_entries', 'force_create')
