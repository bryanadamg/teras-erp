"""add_work_order_locations

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-05-27 16:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('work_orders', sa.Column('input_location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True))
    op.add_column('work_orders', sa.Column('output_location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('work_orders', 'output_location_id')
    op.drop_column('work_orders', 'input_location_id')
