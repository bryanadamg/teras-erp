"""add_work_center_locations

Revision ID: f06cc081a192
Revises: b3c4d5e6f7a8
Create Date: 2026-05-27 15:56:25.550789

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f06cc081a192'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('work_centers', sa.Column('input_location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id'), nullable=True))
    op.add_column('work_centers', sa.Column('output_location_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('locations.id'), nullable=True))


def downgrade() -> None:
    op.drop_column('work_centers', 'output_location_id')
    op.drop_column('work_centers', 'input_location_id')
