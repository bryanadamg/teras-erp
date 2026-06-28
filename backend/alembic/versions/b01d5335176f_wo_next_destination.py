"""wo_next_destination

Revision ID: b01d5335176f
Revises: b1d3f5a7c9e2
Create Date: 2026-06-28 14:01:07.608141

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'b01d5335176f'
down_revision: Union[str, None] = 'b1d3f5a7c9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('work_orders', sa.Column(
        'next_destination_location_id', UUID(as_uuid=True), nullable=True
    ))
    op.add_column('work_orders', sa.Column(
        'next_destination_work_center_id', UUID(as_uuid=True), nullable=True
    ))
    op.create_foreign_key(
        'fk_wo_next_dest_location', 'work_orders', 'locations',
        ['next_destination_location_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_wo_next_dest_work_center', 'work_orders', 'work_centers',
        ['next_destination_work_center_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_wo_next_dest_work_center', 'work_orders', type_='foreignkey')
    op.drop_constraint('fk_wo_next_dest_location', 'work_orders', type_='foreignkey')
    op.drop_column('work_orders', 'next_destination_work_center_id')
    op.drop_column('work_orders', 'next_destination_location_id')
