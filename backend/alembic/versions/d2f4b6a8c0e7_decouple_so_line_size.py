"""decouple sales order line size from BOM

The size a customer orders is a generic size (S/M/L, or a free-mode label), not a
`BOMSize` row: BOMSize rows are per-BOM, so picking one forces the recipe to be
chosen at order entry. Add the generic pick and backfill it from whatever BOMSize
existing lines point at, so the recipe can be deferred to the Production Run.

Revision ID: d2f4b6a8c0e7
Revises: e39417dc819e
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd2f4b6a8c0e7'
down_revision = 'e39417dc819e'
branch_labels = None
depends_on = None

BACKFILL = (
    "UPDATE sales_order_lines sol "
    "SET size_id = bs.size_id, size_label = bs.label "
    "FROM bom_sizes bs "
    "WHERE sol.bom_size_id = bs.id"
)


def upgrade() -> None:
    op.add_column('sales_order_lines', sa.Column('size_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('sales_order_lines', sa.Column('size_label', sa.String(length=128), nullable=True))
    op.create_index('ix_sales_order_lines_size_id', 'sales_order_lines', ['size_id'])
    op.create_foreign_key(
        'fk_sales_order_lines_size_id', 'sales_order_lines', 'sizes',
        ['size_id'], ['id'], ondelete='SET NULL',
    )
    # Backfill: every line that already picked a BOMSize keeps the same identity,
    # now stated generically. bom_size_id is left in place as the legacy pointer.
    op.execute(BACKFILL)


def downgrade() -> None:
    op.drop_constraint('fk_sales_order_lines_size_id', 'sales_order_lines', type_='foreignkey')
    op.drop_index('ix_sales_order_lines_size_id', table_name='sales_order_lines')
    op.drop_column('sales_order_lines', 'size_label')
    op.drop_column('sales_order_lines', 'size_id')
