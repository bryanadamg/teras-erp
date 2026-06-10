"""add_beam_fields_to_batches

Revision ID: f4a5b6c7d8e9
Revises: d3e4f5a6b7c8
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('batches', sa.Column('ends', sa.Integer(), nullable=True))
    op.add_column('batches', sa.Column('source_wo_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_batches_source_wo_id_work_orders', 'batches', 'work_orders',
        ['source_wo_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_batches_source_wo_id_work_orders', 'batches', type_='foreignkey')
    op.drop_column('batches', 'source_wo_id')
    op.drop_column('batches', 'ends')
