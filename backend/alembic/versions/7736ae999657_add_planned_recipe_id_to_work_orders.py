"""add_planned_recipe_id_to_work_orders

Revision ID: 7736ae999657
Revises: e2f3a4b5c6d7
Create Date: 2026-05-24 14:47:02.554009

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '7736ae999657'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('work_orders', sa.Column('planned_recipe_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_work_orders_planned_recipe_id_dye_recipes',
        'work_orders', 'dye_recipes',
        ['planned_recipe_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_work_orders_planned_recipe_id_dye_recipes', 'work_orders', type_='foreignkey')
    op.drop_column('work_orders', 'planned_recipe_id')
