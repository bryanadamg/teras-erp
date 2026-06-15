"""add work_order ends (and merge heads)

Revision ID: c5d8e1f2a3b4
Revises: b3c4d5e6f7a8, b4c7d2e9f1a3, d5f7b9a1c3e2
Create Date: 2026-06-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c5d8e1f2a3b4'
down_revision = ('b3c4d5e6f7a8', 'b4c7d2e9f1a3', 'd5f7b9a1c3e2')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS ends INTEGER")


def downgrade() -> None:
    op.drop_column('work_orders', 'ends')
