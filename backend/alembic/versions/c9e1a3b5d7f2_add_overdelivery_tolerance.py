"""add overdelivery tolerance to boms and manufacturing_orders

Output-side (overdelivery) tolerance, distinct from the existing
boms.tolerance_percentage which is an INPUT-side material wastage allowance.

Revision ID: c9e1a3b5d7f2
Revises: b8d0f2a4c6e9
Create Date: 2026-07-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'c9e1a3b5d7f2'
down_revision = 'b8d0f2a4c6e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'boms',
        sa.Column(
            'overdelivery_tolerance_percentage',
            sa.Numeric(5, 2),
            nullable=False,
            server_default='10.00',
        ),
    )
    op.add_column(
        'manufacturing_orders',
        sa.Column('overdelivery_tolerance_pct', sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        'manufacturing_orders',
        sa.Column(
            'allow_unlimited_overdelivery',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )

    # Backfill: existing warp-beam MOs get no output ceiling. Beam definition
    # mirrors beam_service.beam_item_ids() — category "beam", BEAM- code prefix,
    # or an items.ends value. Closed/cancelled orders are left alone.
    op.execute(
        """
        UPDATE manufacturing_orders mo
        SET allow_unlimited_overdelivery = true
        FROM items i
        LEFT JOIN categories c ON c.id = i.category_id
        WHERE mo.item_id = i.id
          AND mo.status NOT IN ('COMPLETED', 'CANCELLED')
          AND (lower(c.name) = 'beam' OR i.code LIKE 'BEAM-%' OR i.ends IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.drop_column('manufacturing_orders', 'allow_unlimited_overdelivery')
    op.drop_column('manufacturing_orders', 'overdelivery_tolerance_pct')
    op.drop_column('boms', 'overdelivery_tolerance_percentage')
