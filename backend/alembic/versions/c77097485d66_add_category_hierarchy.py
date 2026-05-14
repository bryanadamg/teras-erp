"""add category hierarchy

Revision ID: c77097485d66
Revises: c344af2c8543
Create Date: 2026-05-14 07:37:54.412976

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c77097485d66'
down_revision: Union[str, None] = 'c344af2c8543'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID")
    op.execute("DROP INDEX IF EXISTS ix_categories_name")
    op.execute("DROP INDEX IF EXISTS idx_categories_name")
    op.execute("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key")
    op.execute("CREATE INDEX IF NOT EXISTS ix_categories_name ON categories (name)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_categories_parent_id ON categories (parent_id)")
    op.execute("ALTER TABLE categories DROP CONSTRAINT IF EXISTS fk_categories_parent_id")
    op.execute("""
        ALTER TABLE categories
        ADD CONSTRAINT fk_categories_parent_id
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT
    """)


def downgrade() -> None:
    op.drop_constraint('fk_categories_parent_id', 'categories', type_='foreignkey')
    op.drop_index(op.f('ix_categories_parent_id'), table_name='categories')
    op.drop_index(op.f('ix_categories_name'), table_name='categories')
    op.create_index('ix_categories_name', 'categories', ['name'], unique=True)
    op.drop_column('categories', 'parent_id')
