"""sample color approval note + approval/rejection photo

The reject flow already captured reason + notes; approving a variant captured
nothing. Adds the mirror note on the approval side, plus one proof photo per side
(current status on the variant, per-round copy on the event row).

Revision ID: c5e7a9b1d3f6
Revises: b4d6f8a0c2e5
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'c5e7a9b1d3f6'
down_revision = 'b4d6f8a0c2e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('sample_colors', sa.Column('approval_notes', sa.Text(), nullable=True))
    op.add_column('sample_colors', sa.Column('approval_image_url', sa.String(length=512), nullable=True))
    op.add_column('sample_colors', sa.Column('rejection_image_url', sa.String(length=512), nullable=True))
    op.add_column('sample_color_events', sa.Column('image_url', sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column('sample_color_events', 'image_url')
    op.drop_column('sample_colors', 'rejection_image_url')
    op.drop_column('sample_colors', 'approval_image_url')
    op.drop_column('sample_colors', 'approval_notes')
