"""item category fk

Revision ID: e53d9b57a2e4
Revises: 3a929f91d86b
Create Date: 2026-05-14 07:54:40.825831

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e53d9b57a2e4'
down_revision: Union[str, None] = '3a929f91d86b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new FK column
    op.execute("ALTER TABLE items ADD COLUMN IF NOT EXISTS category_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_items_category_id ON items (category_id)")
    op.execute("ALTER TABLE items DROP CONSTRAINT IF EXISTS fk_items_category_id_categories")
    op.create_foreign_key(
        op.f('fk_items_category_id_categories'), 'items', 'categories',
        ['category_id'], ['id'], ondelete='SET NULL'
    )

    # Data migration: match old string value to level-1 category by name
    op.execute("""
        UPDATE items
        SET category_id = categories.id
        FROM categories
        WHERE items.category = categories.name
          AND categories.parent_id IS NULL
          AND items.category_id IS NULL
    """)

    # Drop old string column (may not exist on stamped DBs where c344af2c8543 already handled it)
    op.execute("DROP INDEX IF EXISTS ix_items_category")
    op.execute("DROP INDEX IF EXISTS idx_items_category")
    op.execute("ALTER TABLE items DROP COLUMN IF EXISTS category")


def downgrade() -> None:
    op.add_column('items', sa.Column('category', sa.String(length=64), nullable=True))
    op.execute("""
        UPDATE items
        SET category = categories.name
        FROM categories
        WHERE items.category_id = categories.id
    """)
    op.create_index(op.f('ix_items_category'), 'items', ['category'])
    op.drop_constraint(op.f('fk_items_category_id_categories'), 'items', type_='foreignkey')
    op.drop_index(op.f('ix_items_category_id'), table_name='items')
    op.drop_column('items', 'category_id')
