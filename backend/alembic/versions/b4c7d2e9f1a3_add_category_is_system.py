"""add category is_system

Revision ID: b4c7d2e9f1a3
Revises: e53d9b57a2e4
Create Date: 2026-05-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b4c7d2e9f1a3'
down_revision = 'e53d9b57a2e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('categories', sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'))
    # Mark the 4 system categories at root level (parent_id IS NULL)
    op.execute("""
        UPDATE categories
        SET is_system = true
        WHERE name IN ('Raw Material', 'Finished Goods', 'WIP', 'Sample')
          AND parent_id IS NULL
    """)


def downgrade() -> None:
    op.drop_column('categories', 'is_system')
