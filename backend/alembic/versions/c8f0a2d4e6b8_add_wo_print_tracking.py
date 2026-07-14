"""add wo print tracking

Revision ID: c8f0a2d4e6b8
Revises: f1a3c5e7b9d2
Create Date: 2026-07-14

Adds card_printed_at / labels_printed_at to work_orders so the ERP can show
which work orders have been printed (Kartu Kerja card + bag labels). Nullable
timestamps: presence = printed; reprints just overwrite with a newer time.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c8f0a2d4e6b8'
down_revision = 'f1a3c5e7b9d2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('work_orders', sa.Column('card_printed_at', sa.DateTime(), nullable=True))
    op.add_column('work_orders', sa.Column('labels_printed_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('work_orders', 'labels_printed_at')
    op.drop_column('work_orders', 'card_printed_at')
