"""packing order's own sampled unit weight (g/y or g/m)

`Item.weight_per_unit` is the estimate taken when the style was developed. The
operator samples the actual goods before packing, and every alt -> kg conversion
on the order (its kg target, its box-size estimate, a carton's derived count)
rides on that figure — so the measured one is recorded per order.

Not backfilled: NULL means "never sampled", which is exactly what every existing
order is, and the item's estimate keeps being used for them.

Revision ID: d9f1b3c5e7a2
Revises: c8e0a2b4d6f1
"""
from alembic import op
import sqlalchemy as sa

revision = 'd9f1b3c5e7a2'
down_revision = 'c8e0a2b4d6f1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('packing_orders', sa.Column('sample_weight_per_unit', sa.Numeric(14, 4), nullable=True))
    # 'g/y' or 'g/m' only — gsm needs the fabric width, so it is refused at the
    # API rather than stored and silently mis-converted.
    op.add_column('packing_orders', sa.Column('sample_weight_unit', sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column('packing_orders', 'sample_weight_unit')
    op.drop_column('packing_orders', 'sample_weight_per_unit')
