"""add stock_reservations

Records the on-hand FG a sales order's Production Run netted away, so the next
order cannot net the same pile a second time.

Revision ID: e4b6d8f0a2c7
Revises: b2d4f6a8c0e3
Create Date: 2026-08-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e4b6d8f0a2c7'
down_revision = 'b2d4f6a8c0e3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'stock_reservations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('sales_order_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('production_run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('pr_bom_entry_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('variant_key', sa.String(length=512), server_default='', nullable=False),
        sa.Column('attribute_value_ids', sa.JSON(), server_default='[]', nullable=True),
        sa.Column('color_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('bom_size_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('qty', sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column('qty_released', sa.Numeric(precision=14, scale=4), server_default='0', nullable=False),
        sa.Column('status', sa.String(length=24), server_default='ACTIVE', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('released_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['sales_order_id'], ['sales_orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['production_run_id'], ['production_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['pr_bom_entry_id'], ['pr_bom_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['items.id'], ),
        sa.ForeignKeyConstraint(['color_id'], ['colors.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['bom_size_id'], ['bom_sizes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_stock_reservations_sales_order_id', 'stock_reservations', ['sales_order_id'])
    op.create_index('ix_stock_reservations_production_run_id', 'stock_reservations', ['production_run_id'])
    op.create_index('ix_stock_reservations_item_id', 'stock_reservations', ['item_id'])
    op.create_index('ix_stock_reservations_status', 'stock_reservations', ['status'])
    op.create_index('ix_stock_reservations_created_at', 'stock_reservations', ['created_at'])
    op.create_index('ix_stock_reservations_item_variant', 'stock_reservations', ['item_id', 'variant_key'])


def downgrade():
    op.drop_index('ix_stock_reservations_item_variant', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_created_at', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_status', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_item_id', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_production_run_id', table_name='stock_reservations')
    op.drop_index('ix_stock_reservations_sales_order_id', table_name='stock_reservations')
    op.drop_table('stock_reservations')
