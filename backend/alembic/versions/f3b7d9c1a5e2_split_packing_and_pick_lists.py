"""split packing (pack FG into cartons) from pick lists (dispatch)

Renames the old packing_orders/packing_lines — which were always the *delivery*
document — to pick_lists/pick_list_lines, drops their carton tables (cartons are
now PackedUnit batches), and creates a new WO-shaped packing_orders family.

Revision ID: f3b7d9c1a5e2
Revises: e3b5d7f9a1c4
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'f3b7d9c1a5e2'
down_revision: Union[str, None] = 'e3b5d7f9a1c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. packing_orders -> pick_lists -------------------------------------
    # The new packing_orders table below reuses the freed name, so every index
    # and constraint carried over by the rename must be renamed too or the
    # create_table further down collides on ix_packing_orders_*.
    op.rename_table('packing_orders', 'pick_lists')
    op.rename_table('packing_lines', 'pick_list_lines')

    # Primary-key and unique constraints are index-backed, and index names are
    # unique per SCHEMA (not per table) — so pk_packing_orders on the renamed table
    # is what blocks the new packing_orders below, not just cosmetic drift.
    # Foreign keys are per-table and would not collide; renamed anyway so nothing
    # on pick_lists still claims to be a packing constraint.
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT pk_packing_orders TO pk_pick_lists')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT uq_packing_orders_code TO uq_pick_lists_code')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT fk_packing_orders_sales_order_id_sales_orders TO fk_pick_lists_sales_order_id_sales_orders')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT fk_packing_orders_source_location_id_locations TO fk_pick_lists_source_location_id_locations')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT fk_packing_orders_created_by_id_users TO fk_pick_lists_created_by_id_users')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT pk_packing_lines TO pk_pick_list_lines')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_packing_lines_packing_order_id_packing_orders TO fk_pick_list_lines_pick_list_id_pick_lists')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_packing_lines_sales_order_line_id_sales_order_lines TO fk_pick_list_lines_sales_order_line_id_sales_order_lines')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_packing_lines_item_id_items TO fk_pick_list_lines_item_id_items')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_packing_lines_source_location_id_locations TO fk_pick_list_lines_source_location_id_locations')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_packing_lines_batch_id_batches TO fk_pick_list_lines_batch_id_batches')

    op.execute('ALTER INDEX IF EXISTS ix_packing_orders_sales_order_id RENAME TO ix_pick_lists_sales_order_id')
    op.execute('ALTER INDEX IF EXISTS ix_packing_orders_status RENAME TO ix_pick_lists_status')
    op.execute('ALTER INDEX IF EXISTS ix_packing_orders_created_at RENAME TO ix_pick_lists_created_at')
    op.execute('ALTER INDEX IF EXISTS ix_packing_lines_packing_order_id RENAME TO ix_pick_list_lines_pick_list_id')
    op.execute('ALTER INDEX IF EXISTS ix_packing_lines_sales_order_line_id RENAME TO ix_pick_list_lines_sales_order_line_id')
    op.execute('ALTER INDEX IF EXISTS ix_packing_lines_item_id RENAME TO ix_pick_list_lines_item_id')

    op.alter_column('pick_list_lines', 'packing_order_id', new_column_name='pick_list_id')
    op.alter_column('pick_list_lines', 'qty_packed', new_column_name='qty_picked')
    op.add_column('pick_list_lines', sa.Column('picked_at', sa.DateTime(), nullable=True))
    op.add_column('pick_list_lines', sa.Column('picked_by', sa.String(128), nullable=True))

    # --- 2. cartons are PackedUnit batches now -------------------------------
    op.drop_table('packing_package_items')
    op.drop_table('packing_packages')

    # --- 3. new packing order family (pack FG into packaging) ----------------
    op.create_table(
        'packing_orders',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(32), nullable=False),
        sa.Column('sales_order_id', UUID(as_uuid=True), sa.ForeignKey('sales_orders.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('sales_order_line_id', UUID(as_uuid=True), sa.ForeignKey('sales_order_lines.id', ondelete='SET NULL'), nullable=True),
        sa.Column('item_id', UUID(as_uuid=True), sa.ForeignKey('items.id'), nullable=False, index=True),
        sa.Column('color_id', UUID(as_uuid=True), sa.ForeignKey('colors.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('qty_target', sa.Numeric(14, 4), nullable=False, server_default='0'),
        sa.Column('pack_size', sa.Numeric(14, 4), nullable=True),
        sa.Column('package_label', sa.String(32), nullable=False, server_default='Carton'),
        sa.Column('source_location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('output_location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='PENDING', index=True),
        sa.Column('target_start_date', sa.DateTime(), nullable=True),
        sa.Column('target_end_date', sa.DateTime(), nullable=True),
        sa.Column('actual_start_date', sa.DateTime(), nullable=True),
        sa.Column('actual_end_date', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('card_printed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
    )
    op.create_unique_constraint('uq_packing_orders_code', 'packing_orders', ['code'])

    op.create_table(
        'packing_order_values',
        sa.Column('packing_order_id', UUID(as_uuid=True), sa.ForeignKey('packing_orders.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('attribute_value_id', UUID(as_uuid=True), sa.ForeignKey('attribute_values.id'), primary_key=True),
    )

    op.create_table(
        'packing_order_materials',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('packing_order_id', UUID(as_uuid=True), sa.ForeignKey('packing_orders.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('item_id', UUID(as_uuid=True), sa.ForeignKey('items.id'), nullable=False, index=True),
        sa.Column('qty_planned', sa.Numeric(14, 4), nullable=False, server_default='0'),
        sa.Column('location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('notes', sa.String(255), nullable=True),
    )

    op.create_table(
        'packing_completions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('packing_order_id', UUID(as_uuid=True), sa.ForeignKey('packing_orders.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('qty', sa.Numeric(14, 4), nullable=False, server_default='0'),
        sa.Column('package_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('source_batch_id', UUID(as_uuid=True), sa.ForeignKey('batches.id', ondelete='SET NULL'), nullable=True),
        sa.Column('operator', sa.String(128), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'packing_completion_materials',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('completion_id', UUID(as_uuid=True), sa.ForeignKey('packing_completions.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('item_id', UUID(as_uuid=True), sa.ForeignKey('items.id'), nullable=False, index=True),
        sa.Column('qty', sa.Numeric(14, 4), nullable=False, server_default='0'),
        sa.Column('location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('batch_id', UUID(as_uuid=True), sa.ForeignKey('batches.id', ondelete='SET NULL'), nullable=True),
    )

    # --- 4. PackedUnit fields on batches -------------------------------------
    op.add_column('batches', sa.Column('packing_order_id', UUID(as_uuid=True), nullable=True))
    op.add_column('batches', sa.Column('packing_completion_id', UUID(as_uuid=True), nullable=True))
    op.add_column('batches', sa.Column('package_no', sa.Integer(), nullable=True))
    op.add_column('batches', sa.Column('package_label', sa.String(32), nullable=True))
    op.add_column('batches', sa.Column('weight_kg', sa.Numeric(14, 4), nullable=True))
    op.add_column('batches', sa.Column('packed_for_so_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_batches_packing_order', 'batches', 'packing_orders', ['packing_order_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_batches_packing_completion', 'batches', 'packing_completions', ['packing_completion_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_batches_packed_for_so', 'batches', 'sales_orders', ['packed_for_so_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_batches_packing_order_id', 'batches', ['packing_order_id'])
    op.create_index('ix_batches_packed_for_so_id', 'batches', ['packed_for_so_id'])

    # --- 5. batch genealogy can now hang off a packing order -----------------
    op.alter_column('batch_consumptions', 'manufacturing_order_id', existing_type=UUID(as_uuid=True), nullable=True)
    op.add_column('batch_consumptions', sa.Column('packing_order_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_batch_consumptions_packing_order', 'batch_consumptions', 'packing_orders', ['packing_order_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_batch_consumptions_packing_order_id', 'batch_consumptions', ['packing_order_id'])


def downgrade() -> None:
    op.drop_index('ix_batch_consumptions_packing_order_id', table_name='batch_consumptions')
    op.drop_constraint('fk_batch_consumptions_packing_order', 'batch_consumptions', type_='foreignkey')
    op.drop_column('batch_consumptions', 'packing_order_id')
    op.execute('DELETE FROM batch_consumptions WHERE manufacturing_order_id IS NULL')
    op.alter_column('batch_consumptions', 'manufacturing_order_id', existing_type=UUID(as_uuid=True), nullable=False)

    op.drop_index('ix_batches_packed_for_so_id', table_name='batches')
    op.drop_index('ix_batches_packing_order_id', table_name='batches')
    op.drop_constraint('fk_batches_packed_for_so', 'batches', type_='foreignkey')
    op.drop_constraint('fk_batches_packing_completion', 'batches', type_='foreignkey')
    op.drop_constraint('fk_batches_packing_order', 'batches', type_='foreignkey')
    for col in ('packed_for_so_id', 'weight_kg', 'package_label', 'package_no',
                'packing_completion_id', 'packing_order_id'):
        op.drop_column('batches', col)

    op.drop_table('packing_completion_materials')
    op.drop_table('packing_completions')
    op.drop_table('packing_order_materials')
    op.drop_table('packing_order_values')
    op.drop_constraint('uq_packing_orders_code', 'packing_orders', type_='unique')
    op.drop_table('packing_orders')

    op.create_table(
        'packing_packages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('packing_order_id', UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('package_no', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('label', sa.String(32), nullable=True),
        sa.Column('weight_kg', sa.Numeric(14, 4), nullable=True),
        sa.Column('notes', sa.String(255), nullable=True),
    )
    op.create_table(
        'packing_package_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('package_id', UUID(as_uuid=True), sa.ForeignKey('packing_packages.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('packing_line_id', UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('qty', sa.Numeric(14, 4), nullable=False, server_default='0'),
    )

    op.drop_column('pick_list_lines', 'picked_by')
    op.drop_column('pick_list_lines', 'picked_at')
    op.alter_column('pick_list_lines', 'qty_picked', new_column_name='qty_packed')
    op.alter_column('pick_list_lines', 'pick_list_id', new_column_name='packing_order_id')

    op.execute('ALTER INDEX IF EXISTS ix_pick_list_lines_item_id RENAME TO ix_packing_lines_item_id')
    op.execute('ALTER INDEX IF EXISTS ix_pick_list_lines_sales_order_line_id RENAME TO ix_packing_lines_sales_order_line_id')
    op.execute('ALTER INDEX IF EXISTS ix_pick_list_lines_pick_list_id RENAME TO ix_packing_lines_packing_order_id')
    op.execute('ALTER INDEX IF EXISTS ix_pick_lists_created_at RENAME TO ix_packing_orders_created_at')
    op.execute('ALTER INDEX IF EXISTS ix_pick_lists_status RENAME TO ix_packing_orders_status')
    op.execute('ALTER INDEX IF EXISTS ix_pick_lists_sales_order_id RENAME TO ix_packing_orders_sales_order_id')

    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_pick_list_lines_batch_id_batches TO fk_packing_lines_batch_id_batches')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_pick_list_lines_source_location_id_locations TO fk_packing_lines_source_location_id_locations')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_pick_list_lines_item_id_items TO fk_packing_lines_item_id_items')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_pick_list_lines_sales_order_line_id_sales_order_lines TO fk_packing_lines_sales_order_line_id_sales_order_lines')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT fk_pick_list_lines_pick_list_id_pick_lists TO fk_packing_lines_packing_order_id_packing_orders')
    op.execute('ALTER TABLE pick_list_lines RENAME CONSTRAINT pk_pick_list_lines TO pk_packing_lines')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT fk_pick_lists_created_by_id_users TO fk_packing_orders_created_by_id_users')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT fk_pick_lists_source_location_id_locations TO fk_packing_orders_source_location_id_locations')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT fk_pick_lists_sales_order_id_sales_orders TO fk_packing_orders_sales_order_id_sales_orders')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT uq_pick_lists_code TO uq_packing_orders_code')
    op.execute('ALTER TABLE pick_lists RENAME CONSTRAINT pk_pick_lists TO pk_packing_orders')

    op.rename_table('pick_list_lines', 'packing_lines')
    op.rename_table('pick_lists', 'packing_orders')
