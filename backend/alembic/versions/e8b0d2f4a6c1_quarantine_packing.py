"""Quarantine Packing: hold locations + per-lot QC disposition

Goods landing in a quarantine location are held on the Quarantine Packing page,
grouped by the MO that produced them, until QC dispositions them. The status
lives on the lot (Batch) so a partially-passed MO can release the good lots and
hold the rest; the MO row is a rollup of its lots. Only the passing status
("OK") lets a lot be packed.

`locations.is_quarantine` is a flag, not a system_code check: a plant may run
several hold areas and the seeded QC store is only the default one.

Revision ID: e8b0d2f4a6c1
Revises: b7d9f1a3c5e8
Create Date: 2026-08-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e8b0d2f4a6c1'
down_revision = 'b7d9f1a3c5e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'locations',
        sa.Column('is_quarantine', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    # The seeded Quarantine store is a hold area out of the box.
    op.execute("UPDATE locations SET is_quarantine = true WHERE system_code = 'QC'")

    op.add_column('batches', sa.Column('quarantine_status_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('batches', sa.Column('quarantine_status', sa.String(length=64), nullable=True))
    op.add_column('batches', sa.Column('quarantine_status_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('batches', sa.Column('quarantine_status_by', sa.String(length=128), nullable=True))
    op.add_column('batches', sa.Column('quarantine_notes', sa.String(length=512), nullable=True))
    op.create_foreign_key(
        'fk_batches_quarantine_status_id', 'batches', 'attribute_values',
        ['quarantine_status_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_batches_quarantine_status_id', 'batches', ['quarantine_status_id'])


def downgrade() -> None:
    op.drop_index('ix_batches_quarantine_status_id', table_name='batches')
    op.drop_constraint('fk_batches_quarantine_status_id', 'batches', type_='foreignkey')
    op.drop_column('batches', 'quarantine_notes')
    op.drop_column('batches', 'quarantine_status_by')
    op.drop_column('batches', 'quarantine_status_at')
    op.drop_column('batches', 'quarantine_status')
    op.drop_column('batches', 'quarantine_status_id')
    op.drop_column('locations', 'is_quarantine')
