"""lab dip variant approval/rejection photo

Same feature as c5e7a9b1d3f6 on the sample side: one proof photo per side, held on
the variant for its current status and on the event row per round.

Revision ID: d7f9b1c3e5a8
Revises: c5e7a9b1d3f6
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'd7f9b1c3e5a8'
down_revision = 'c5e7a9b1d3f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('lab_dip_items', sa.Column('approval_image_url', sa.String(length=512), nullable=True))
    op.add_column('lab_dip_items', sa.Column('rejection_image_url', sa.String(length=512), nullable=True))
    op.add_column('lab_dip_item_events', sa.Column('image_url', sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column('lab_dip_item_events', 'image_url')
    op.drop_column('lab_dip_items', 'rejection_image_url')
    op.drop_column('lab_dip_items', 'approval_image_url')
