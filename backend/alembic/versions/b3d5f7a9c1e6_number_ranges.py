"""number_ranges table for atomic document numbering

Backs `services/numbering_service.py`. Codes were minted by counting rows and
probing for a free suffix, which races: two concurrent creates read the same count
and mint the same code. On MO codes (unique) the loser 500s and rolls back its
whole Production Run; on WO codes (no unique constraint) duplicates land silently.

One counter row per series, incremented by the allocating UPDATE, gives the
gapless-counter behaviour ERPs use for document numbering. No backfill: series
rows are created lazily on first allocation, seeded from the highest number
already in use, so existing codes keep their numbers.

Revision ID: b3d5f7a9c1e6
Revises: e8b0d2f4a6c9
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'b3d5f7a9c1e6'
down_revision = 'e8b0d2f4a6c9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'number_ranges',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('range_key', sa.String(length=255), nullable=False),
        sa.Column('next_value', sa.BigInteger(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id', name='pk_number_ranges'),
    )
    # Unique: the allocator's ON CONFLICT target, and what makes two first-ever
    # allocations for one series queue instead of both inserting.
    op.create_index('ix_number_ranges_range_key', 'number_ranges', ['range_key'], unique=True)


def downgrade():
    op.drop_index('ix_number_ranges_range_key', table_name='number_ranges')
    op.drop_table('number_ranges')
