"""item default source location + make MO/PR location nullable

Industry-standard location resolution:
- Source (issue) location comes from the material master (Item.default_source_location_id)
  or a per-BOM-line override — no longer from the MO/PR.
- Output (receipt) location comes from the routing's WO output location — MO/PR
  no longer carry a planning location, so location_id becomes nullable.

Revision ID: a9c1e3b5d7f0
Revises: f7b9d1e3a5c8
Create Date: 2026-06-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'a9c1e3b5d7f0'
down_revision: Union[str, None] = 'f7b9d1e3a5c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # L3: material-master default issue (source) location
    op.add_column('items', sa.Column('default_source_location_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_items_default_source_location_id',
        'items', 'locations',
        ['default_source_location_id'], ['id'],
        ondelete='SET NULL',
    )
    # MO/PR no longer require a planning location (output follows the WO output loc)
    op.alter_column('manufacturing_orders', 'location_id', existing_type=UUID(as_uuid=True), nullable=True)
    op.alter_column('production_runs', 'location_id', existing_type=UUID(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.alter_column('production_runs', 'location_id', existing_type=UUID(as_uuid=True), nullable=False)
    op.alter_column('manufacturing_orders', 'location_id', existing_type=UUID(as_uuid=True), nullable=False)
    op.drop_constraint('fk_items_default_source_location_id', 'items', type_='foreignkey')
    op.drop_column('items', 'default_source_location_id')
