"""add alt selling unit to packing orders and cartons

Packing used to work only in the item's own UOM, so an item stocked in kg could
only ever be packed in kg — while the customer ordered it in Pic (rolls) or Pcs
(cut pieces) on the sales order. These columns carry that alt unit onto the
packing order (snapshotted from the ordered SO line, or picked by hand when
packing to stock) and the packed count onto each carton.

`qty_target` and every stock movement stay in the item's own UOM; the alt unit is
the entry/label layer only. Mirrors `sales_order_lines.qty2/uom2/uom2_factor`,
plus `uom2_length_uom` so the factor's target unit is never guessed by matching
the factor value back against the UOM master.

Revision ID: a3c7e9b1d5f4
Revises: b8d0f2a4c6e1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3c7e9b1d5f4'
down_revision: Union[str, None] = 'b8d0f2a4c6e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('packing_orders', sa.Column('qty2', sa.Numeric(14, 4), nullable=True))
    op.add_column('packing_orders', sa.Column('uom2', sa.String(32), nullable=True))
    op.add_column('packing_orders', sa.Column('uom2_factor', sa.Numeric(14, 4), nullable=True))
    op.add_column('packing_orders', sa.Column('uom2_length_uom', sa.String(32), nullable=True))
    # Per-carton count in that unit. On `batches` because a carton IS a Batch row
    # (`packing_order_id` is the discriminator), the same way `ends` rides there
    # for warp beams.
    op.add_column('batches', sa.Column('alt_qty', sa.Numeric(14, 4), nullable=True))

    # Backfill in-flight orders from the line they pack, so an order already on the
    # floor keeps printing piece counts on its carton labels. Done here rather than
    # as a read-time fallback in the API: reading through to the line would mean
    # assigning to the order's own columns on every response, and any later commit
    # in that request would persist them as a silent write.
    op.execute("""
        UPDATE packing_orders po
           SET uom2 = sol.uom2,
               uom2_factor = sol.uom2_factor
          FROM sales_order_lines sol
         WHERE sol.id = po.sales_order_line_id
           AND po.uom2 IS NULL
           AND sol.uom2 IS NOT NULL
    """)
    # The factor's target unit comes off the UOM master's own factor rows
    # ('Roll -> Yard = 50'). Left null when no row matches, which `base_per_alt`
    # then reads as yard — the unit every legacy factor was entered against.
    op.execute("""
        UPDATE packing_orders po
           SET uom2_length_uom = (
                   SELECT tu.name
                     FROM uom_factors f
                     JOIN uoms fu ON fu.id = f.from_uom_id
                     JOIN uoms tu ON tu.id = f.to_uom_id
                    WHERE lower(fu.name) = lower(po.uom2)
                      AND f.value = po.uom2_factor
                    LIMIT 1
               )
         WHERE po.uom2 IS NOT NULL
           AND po.uom2_factor IS NOT NULL
           AND po.uom2_length_uom IS NULL
    """)


def downgrade() -> None:
    op.drop_column('batches', 'alt_qty')
    op.drop_column('packing_orders', 'uom2_length_uom')
    op.drop_column('packing_orders', 'uom2_factor')
    op.drop_column('packing_orders', 'uom2')
    op.drop_column('packing_orders', 'qty2')
