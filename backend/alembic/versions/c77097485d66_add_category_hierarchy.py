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
    op.add_column('categories', sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.drop_index('ix_categories_name', table_name='categories')
    op.create_index(op.f('ix_categories_name'), 'categories', ['name'])
    op.create_index(op.f('ix_categories_parent_id'), 'categories', ['parent_id'])
    op.create_foreign_key(
        'fk_categories_parent_id', 'categories', 'categories',
        ['parent_id'], ['id'], ondelete='RESTRICT'
    )


def downgrade() -> None:
    op.drop_constraint('fk_categories_parent_id', 'categories', type_='foreignkey')
    op.drop_index(op.f('ix_categories_parent_id'), table_name='categories')
    op.drop_index(op.f('ix_categories_name'), table_name='categories')
    op.create_index('ix_categories_name', 'categories', ['name'], unique=True)
    op.drop_column('categories', 'parent_id')
