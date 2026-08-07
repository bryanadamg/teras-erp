"""SO line flag: customer sent no physical color swatch

Sales flags a color-variant line at order entry when the customer ordered a
shade without supplying the physical swatch. Cleared by editing the SO once the
swatch arrives. Informational only — nothing downstream gates on it.

Revision ID: b7d9f1a3c5e8
Revises: f4a6c8e0b2d5
Create Date: 2026-08-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'b7d9f1a3c5e8'
down_revision = 'f4a6c8e0b2d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'sales_order_lines',
        sa.Column('no_color_swatch', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )


def downgrade() -> None:
    op.drop_column('sales_order_lines', 'no_color_swatch')
