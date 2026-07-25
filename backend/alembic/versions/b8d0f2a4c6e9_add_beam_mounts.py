"""add beam_mounts + work_centers.beam_slots

Warp beams become loom resources instead of per-WO staged material: a beam is
mounted on a work center and shared by every WO that runs there.

Revision ID: b8d0f2a4c6e9
Revises: a7c9e1f3b5d8
Create Date: 2026-07-25

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b8d0f2a4c6e9'
down_revision = 'a7c9e1f3b5d8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'work_centers',
        sa.Column('beam_slots', sa.Integer(), nullable=False, server_default='1'),
    )

    op.create_table(
        'beam_mounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('batch_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('work_center_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('location_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('qty_mounted', sa.Numeric(14, 4), nullable=True),
        sa.Column('source_wo_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('mounted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('mounted_by', sa.String(length=128), nullable=True),
        sa.Column('dismounted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('dismounted_by', sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], name=op.f('fk_beam_mounts_batch_id_batches'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['work_center_id'], ['work_centers.id'], name=op.f('fk_beam_mounts_work_center_id_work_centers'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['items.id'], name=op.f('fk_beam_mounts_item_id_items')),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_beam_mounts_location_id_locations')),
        sa.ForeignKeyConstraint(['source_wo_id'], ['work_orders.id'], name=op.f('fk_beam_mounts_source_wo_id_work_orders'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_beam_mounts')),
    )
    op.create_index(op.f('ix_beam_mounts_batch_id'), 'beam_mounts', ['batch_id'])
    op.create_index(op.f('ix_beam_mounts_work_center_id'), 'beam_mounts', ['work_center_id'])
    op.create_index(op.f('ix_beam_mounts_item_id'), 'beam_mounts', ['item_id'])
    # Every readiness/consumption query asks "what is open on this loom", so index
    # that path directly rather than scanning a machine's whole mount history.
    op.create_index(
        'ix_beam_mounts_active',
        'beam_mounts',
        ['work_center_id', 'item_id'],
        postgresql_where=sa.text('dismounted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_beam_mounts_active', table_name='beam_mounts')
    op.drop_index(op.f('ix_beam_mounts_item_id'), table_name='beam_mounts')
    op.drop_index(op.f('ix_beam_mounts_work_center_id'), table_name='beam_mounts')
    op.drop_index(op.f('ix_beam_mounts_batch_id'), table_name='beam_mounts')
    op.drop_table('beam_mounts')
    op.drop_column('work_centers', 'beam_slots')
