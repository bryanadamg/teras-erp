"""backfill lineage for lots created by an earlier split

`POST /batches/{id}/split` now writes both halves of a lot's lineage — the child's
`parent_batch_id` and a `batch_consumptions` row (input = parent, output = child) —
the same way a leftover beam does. Splits posted before that wrote neither, so
those children trace back to nothing: `/batches/{id}/trace-back` walks
`batch_consumptions.output_batch_id`, and the pre-fix child had no such row.

Recoverable exactly, without parsing the `-S{n}` suffix: the split posted a
two-sided stock movement with `reference_type = 'Split'` and `reference_id` = the
child's lot number, so each pair of ledger rows names its parent (the negative
side), its child (the positive side) and the kg that moved.

Revision ID: a3e5c7b9d1f4
Revises: d9f1b3c5e7a2
"""
from alembic import op

revision = "a3e5c7b9d1f4"
down_revision = "d9f1b3c5e7a2"
branch_labels = None
depends_on = None


# The pairs, rebuilt from the ledger. `array_agg(...) FILTER (...)` rather than
# MAX(): postgres has no max() for uuid. A group missing either side (a
# hand-edited ledger, a deleted lot) drops out on the NOT NULL checks.
_MOVES = """
    WITH moves AS (
        SELECT (array_agg(l.batch_id) FILTER (WHERE l.qty_change < 0))[1] AS parent_id,
               (array_agg(l.batch_id) FILTER (WHERE l.qty_change > 0))[1] AS child_id,
               SUM(CASE WHEN l.qty_change > 0 THEN l.qty_change ELSE 0 END) AS qty,
               MIN(l.created_at) AS created_at
        FROM stock_ledger l
        WHERE l.reference_type = 'Split'
        GROUP BY l.reference_id
    )
"""


def upgrade() -> None:
    op.execute(
        _MOVES
        + """
        INSERT INTO batch_consumptions (id, input_batch_id, output_batch_id, qty_consumed, created_at)
        SELECT gen_random_uuid(), m.parent_id, m.child_id, m.qty, m.created_at
        FROM moves m
        WHERE m.parent_id IS NOT NULL
          AND m.child_id IS NOT NULL
          AND m.parent_id <> m.child_id
          AND m.qty > 0
          AND NOT EXISTS (
              SELECT 1 FROM batch_consumptions bc
              WHERE bc.input_batch_id = m.parent_id
                AND bc.output_batch_id = m.child_id
          );
        """
    )
    # Only fill a child that has no parent yet — never overwrite a lineage some
    # other path (a leftover beam) already claimed.
    op.execute(
        _MOVES
        + """
        UPDATE batches b
        SET parent_batch_id = m.parent_id
        FROM moves m
        WHERE b.id = m.child_id
          AND m.parent_id IS NOT NULL
          AND m.parent_id <> b.id
          AND b.parent_batch_id IS NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        _MOVES
        + """
        UPDATE batches b
        SET parent_batch_id = NULL
        FROM moves m
        WHERE b.id = m.child_id
          AND b.parent_batch_id = m.parent_id;
        """
    )
    op.execute(
        _MOVES
        + """
        DELETE FROM batch_consumptions bc
        USING moves m
        WHERE bc.input_batch_id = m.parent_id
          AND bc.output_batch_id = m.child_id
          AND bc.manufacturing_order_id IS NULL
          AND bc.packing_order_id IS NULL;
        """
    )
