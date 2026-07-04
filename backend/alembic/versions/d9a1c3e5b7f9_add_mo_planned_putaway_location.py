"""add planned_putaway_location_id to manufacturing_orders

Revision ID: d9a1c3e5b7f9
Revises: c7e9a1b3d5f7
Create Date: 2026-07-05

Putaway is a planning decision, not an operator one: the MO carries its
destination bin before production finishes. Completions book output stock to
this location; the WO output location is only the fallback.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd9a1c3e5b7f9'
down_revision: Union[str, None] = 'c7e9a1b3d5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('manufacturing_orders', sa.Column('planned_putaway_location_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_manufacturing_orders_planned_putaway_location', 'manufacturing_orders', 'locations',
        ['planned_putaway_location_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_manufacturing_orders_planned_putaway_location', 'manufacturing_orders', type_='foreignkey')
    op.drop_column('manufacturing_orders', 'planned_putaway_location_id')
