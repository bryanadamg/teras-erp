"""add default_putaway_location_id to items

Revision ID: e1a3c5b7d9f0
Revises: d9a1c3e5b7f9
Create Date: 2026-07-05

Receiving-side mirror of Item.default_source_location_id: the item master's
preferred bin, used as a putaway-suggestion candidate before falling back to
routing/work-order output locations. MO.planned_putaway_location_id still
takes priority once explicitly set.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e1a3c5b7d9f0'
down_revision: Union[str, None] = 'd9a1c3e5b7f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('items', sa.Column('default_putaway_location_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_items_default_putaway_location', 'items', 'locations',
        ['default_putaway_location_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_items_default_putaway_location', 'items', type_='foreignkey')
    op.drop_column('items', 'default_putaway_location_id')
