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
    op.add_column('items', sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index(op.f('ix_items_category_id'), 'items', ['category_id'])
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
    """)

    # Drop old string column
    op.drop_index(op.f('ix_items_category'), table_name='items')
    op.drop_column('items', 'category')


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
