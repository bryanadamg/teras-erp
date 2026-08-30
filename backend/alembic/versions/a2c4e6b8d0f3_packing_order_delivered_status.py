"""Stamp DELIVERED on packing orders that already met their target

Data-only. PackingOrder gains the DELIVERED status ManufacturingOrder already
has: fulfilled (`qty_packed >= qty_target`) but still open, distinct from a
COMPLETED order the user explicitly closed.

The distinction is load-bearing for Quarantine Packing, which now claims each
open order's *open* quantity rather than the whole (item, location) pool. Orders
written before this ran are still IN_PROGRESS with nothing owed; this brings
their status in line with what the qty already says. No column changes — status
is a plain String(16).

Revision ID: a2c4e6b8d0f3
Revises: f8a0c2e4b6d9
"""
from alembic import op

revision = 'a2c4e6b8d0f3'
down_revision = 'f8a0c2e4b6d9'
branch_labels = None
depends_on = None


# Rejected completions don't count as packed output, mirroring
# PackingOrder.qty_packed.
_PACKED = """
    SELECT COALESCE(SUM(pc.qty), 0)
    FROM packing_completions pc
    WHERE pc.packing_order_id = po.id AND NOT pc.rejected
"""


def upgrade():
    op.execute(f"""
        UPDATE packing_orders po
        SET status = 'DELIVERED'
        WHERE po.status IN ('PENDING', 'IN_PROGRESS')
          AND COALESCE(po.qty_target, 0) > 0
          AND ({_PACKED}) + 1e-6 >= po.qty_target
    """)


def downgrade():
    # IN_PROGRESS is where these rows came from, and where the reopen path puts
    # them back — safe to collapse the status away.
    op.execute("UPDATE packing_orders SET status = 'IN_PROGRESS' WHERE status = 'DELIVERED'")
