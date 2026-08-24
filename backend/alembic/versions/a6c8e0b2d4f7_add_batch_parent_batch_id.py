"""add batches.parent_batch_id for leftover warp beams

Revision ID: a6c8e0b2d4f7
Revises: ffbfa3859715
Create Date: 2026-08-25

A leftover beam is a NEW lot split off its parent when the parent comes off the
loom with warp still on it. This column records that parentage (and doubles as
the "this is a leftover" flag); the qty lineage itself is a BatchConsumption row.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a6c8e0b2d4f7'
down_revision: Union[str, None] = 'ffbfa3859715'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'batches',
        sa.Column('parent_batch_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index('ix_batches_parent_batch_id', 'batches', ['parent_batch_id'])
    op.create_foreign_key(
        'fk_batches_parent_batch_id', 'batches', 'batches',
        ['parent_batch_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_batches_parent_batch_id', 'batches', type_='foreignkey')
    op.drop_index('ix_batches_parent_batch_id', table_name='batches')
    op.drop_column('batches', 'parent_batch_id')
