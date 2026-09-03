"""packing order box size in the alt selling unit

A carton holds a whole number of pieces ("12 Pcs per carton"), and the kilos
those work out to are an estimate the scale contradicts on every box. Splitting
the kilos minted a phantom last carton and printed labels reading 11.8 Pcs, so
the count is stored and `pack_size` becomes its derived weight estimate.

Backfilled from `pack_size` where the conversion is knowable, so existing orders
keep splitting the way they do today.

Revision ID: b6d8f0a2c4e9
Revises: a8c0e2f4b6d1
"""
from alembic import op
import sqlalchemy as sa

revision = 'b6d8f0a2c4e9'
down_revision = 'a8c0e2f4b6d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('packing_orders', sa.Column('pack_size_alt', sa.Numeric(14, 4), nullable=True))
    # Backfill only the one-hop case the SQL can do honestly: a factor already in
    # the item's own stock UOM (`1 Box = 10 kg` on a kg item, `1 Roll = 144 yard`
    # on a yard item). The two-hop kg case needs the item's g/y — and the
    # conversion aliases and gsm refusal that go with it — which belongs in
    # `packing_service.base_per_alt`, not in a migration. Those orders simply
    # arrive with no count and keep splitting by `pack_size` exactly as before,
    # until someone states one.
    op.execute("""
        UPDATE packing_orders po
           SET pack_size_alt = ROUND((po.pack_size / po.uom2_factor)::numeric, 4)
          FROM items i
         WHERE i.id = po.item_id
           AND po.pack_size > 0
           AND po.uom2_factor > 0
           AND po.uom2 IS NOT NULL
           AND LOWER(TRIM(po.uom2_length_uom)) = LOWER(TRIM(i.uom))
    """)


def downgrade() -> None:
    op.drop_column('packing_orders', 'pack_size_alt')
