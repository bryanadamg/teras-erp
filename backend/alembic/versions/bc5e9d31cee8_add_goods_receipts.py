"""add_goods_receipts

Revision ID: bc5e9d31cee8
Revises: e3f4a5b6c7d8
Create Date: 2026-06-04 18:40:06.538843

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'bc5e9d31cee8'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'goods_receipts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('po_id', UUID(as_uuid=True), sa.ForeignKey('purchase_orders.id'), nullable=False, index=True),
        sa.Column('receipt_date', sa.DateTime(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
    )

    op.create_table(
        'goods_receipt_lines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('receipt_id', UUID(as_uuid=True), sa.ForeignKey('goods_receipts.id'), nullable=False, index=True),
        sa.Column('po_line_id', UUID(as_uuid=True), sa.ForeignKey('purchase_order_lines.id'), nullable=False, index=True),
        sa.Column('item_id', UUID(as_uuid=True), sa.ForeignKey('items.id'), nullable=False, index=True),
        sa.Column('qty_received', sa.Numeric(14, 4), nullable=False),
        sa.Column('batch_id', UUID(as_uuid=True), sa.ForeignKey('batches.id'), nullable=True),
    )

    op.add_column(
        'purchase_order_lines',
        sa.Column('qty_received', sa.Numeric(14, 4), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('purchase_order_lines', 'qty_received')
    op.drop_table('goods_receipt_lines')
    op.drop_table('goods_receipts')
