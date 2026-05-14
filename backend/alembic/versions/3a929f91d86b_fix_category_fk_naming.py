"""fix category fk naming

Revision ID: 3a929f91d86b
Revises: c77097485d66
Create Date: 2026-05-14 07:42:55.305694

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '3a929f91d86b'
down_revision: Union[str, None] = 'c77097485d66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('fk_categories_parent_id', 'categories', type_='foreignkey')
    op.create_foreign_key(
        op.f('fk_categories_parent_id_categories'), 'categories', 'categories',
        ['parent_id'], ['id'], ondelete='RESTRICT'
    )


def downgrade() -> None:
    op.drop_constraint(op.f('fk_categories_parent_id_categories'), 'categories', type_='foreignkey')
    op.create_foreign_key(
        'fk_categories_parent_id', 'categories', 'categories',
        ['parent_id'], ['id'], ondelete='RESTRICT'
    )
