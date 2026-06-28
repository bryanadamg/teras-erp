"""add vendor_lot to batches

Revision ID: b1c3e5a7f9d2
Revises: f9a1c2d3e4b5
Create Date: 2026-06-28

Pattern 1 lot tracking: internal batch_number stays unique/system-generated;
vendor_lot stores supplier's lot reference (non-unique, nullable).
"""
from alembic import op
import sqlalchemy as sa


revision = 'b1c3e5a7f9d2'
down_revision = 'b01d5335176f'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('batches', sa.Column('vendor_lot', sa.String(128), nullable=True))


def downgrade():
    op.drop_column('batches', 'vendor_lot')
