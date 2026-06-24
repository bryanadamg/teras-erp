"""add packing orders (outbound dispatch / Surat Jalan)

Revision ID: e4f6a8b0c2d5
Revises: a2b3c4d5e6f8
Create Date: 2026-06-24 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'e4f6a8b0c2d5'
down_revision: Union[str, None] = 'a2b3c4d5e6f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'packing_orders',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(32), nullable=False),
        sa.Column('sales_order_id', UUID(as_uuid=True), sa.ForeignKey('sales_orders.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('source_location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='DRAFT', index=True),
        sa.Column('qc_passed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('qc_inspector', sa.String(128), nullable=True),
        sa.Column('qc_at', sa.DateTime(), nullable=True),
        sa.Column('delivery_note_number', sa.String(64), nullable=True),
        sa.Column('delivery_date', sa.DateTime(), nullable=True),
        sa.Column('carrier', sa.String(128), nullable=True),
        sa.Column('vehicle_plate', sa.String(64), nullable=True),
        sa.Column('driver', sa.String(128), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('dispatched_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
    )
    op.create_unique_constraint('uq_packing_orders_code', 'packing_orders', ['code'])

    op.create_table(
        'packing_lines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('packing_order_id', UUID(as_uuid=True), sa.ForeignKey('packing_orders.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('sales_order_line_id', UUID(as_uuid=True), sa.ForeignKey('sales_order_lines.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('item_id', UUID(as_uuid=True), sa.ForeignKey('items.id'), nullable=False, index=True),
        sa.Column('qty_packed', sa.Numeric(14, 4), nullable=False, server_default='0'),
        sa.Column('source_location_id', UUID(as_uuid=True), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('batch_id', UUID(as_uuid=True), sa.ForeignKey('batches.id', ondelete='SET NULL'), nullable=True),
    )

    op.create_table(
        'packing_packages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('packing_order_id', UUID(as_uuid=True), sa.ForeignKey('packing_orders.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('package_no', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('label', sa.String(32), nullable=True),
        sa.Column('weight_kg', sa.Numeric(14, 4), nullable=True),
        sa.Column('notes', sa.String(255), nullable=True),
    )

    op.create_table(
        'packing_package_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('package_id', UUID(as_uuid=True), sa.ForeignKey('packing_packages.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('packing_line_id', UUID(as_uuid=True), sa.ForeignKey('packing_lines.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('qty', sa.Numeric(14, 4), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_table('packing_package_items')
    op.drop_table('packing_packages')
    op.drop_table('packing_lines')
    op.drop_constraint('uq_packing_orders_code', 'packing_orders', type_='unique')
    op.drop_table('packing_orders')
