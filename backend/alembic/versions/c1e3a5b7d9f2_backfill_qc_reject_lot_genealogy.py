"""backfill lineage for reject sub-lots cut by an earlier partial QC reject

A partial QC reject peels the bad kg into a `-R{n}` sub-lot. Like the lot split
before `a3e5c7b9d1f4`, it wrote neither `parent_batch_id` nor a
`batch_consumptions` row, so the rejected piece traced back to nothing — the very
lineage a QC investigation wants ("what was this bad material made from?").

Rebuilt from the ledger, but the QC_REJECT reference is shaped differently from a
split's: both the peel AND the quarantine move to the defect store post under
`reference_type = 'QC_REJECT'` with the same `reference_id` (the sub-lot's number),
and a whole-lot reject posts only the quarantine move. So the parent cannot be
"the negative row" — it is the negative row whose batch is NOT the sub-lot, which
also excludes whole-lot rejects (nothing was cut) automatically. The peeled qty is
read off the parent's side for the same reason: the sub-lot's own positive rows
sum the peel and the quarantine move together.

Revision ID: c1e3a5b7d9f2
Revises: a3e5c7b9d1f4
"""
from alembic import op

revision = "c1e3a5b7d9f2"
down_revision = "a3e5c7b9d1f4"
branch_labels = None
depends_on = None


# `array_agg(...) FILTER (...)` rather than MAX(): postgres has no max() for uuid.
_REJECTS = """
    WITH rej AS (
        SELECT c.id AS child_id,
               (array_agg(l.batch_id) FILTER (WHERE l.qty_change < 0 AND l.batch_id <> c.id))[1] AS parent_id,
               -SUM(CASE WHEN l.batch_id IS DISTINCT FROM c.id THEN l.qty_change ELSE 0 END) AS qty,
               MIN(l.created_at) AS created_at
        FROM stock_ledger l
        JOIN batches c ON c.batch_number = l.reference_id
        WHERE l.reference_type = 'QC_REJECT'
        GROUP BY c.id
    )
"""


def upgrade() -> None:
    op.execute(
        _REJECTS
        + """
        INSERT INTO batch_consumptions (id, input_batch_id, output_batch_id, qty_consumed, created_at)
        SELECT gen_random_uuid(), r.parent_id, r.child_id, r.qty, r.created_at
        FROM rej r
        WHERE r.parent_id IS NOT NULL
          AND r.parent_id <> r.child_id
          AND r.qty > 0
          AND NOT EXISTS (
              SELECT 1 FROM batch_consumptions bc
              WHERE bc.input_batch_id = r.parent_id
                AND bc.output_batch_id = r.child_id
          );
        """
    )
    op.execute(
        _REJECTS
        + """
        UPDATE batches b
        SET parent_batch_id = r.parent_id
        FROM rej r
        WHERE b.id = r.child_id
          AND r.parent_id IS NOT NULL
          AND r.parent_id <> b.id
          AND b.parent_batch_id IS NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        _REJECTS
        + """
        UPDATE batches b
        SET parent_batch_id = NULL
        FROM rej r
        WHERE b.id = r.child_id
          AND b.parent_batch_id = r.parent_id;
        """
    )
    op.execute(
        _REJECTS
        + """
        DELETE FROM batch_consumptions bc
        USING rej r
        WHERE bc.input_batch_id = r.parent_id
          AND bc.output_batch_id = r.child_id
          AND bc.manufacturing_order_id IS NULL
          AND bc.packing_order_id IS NULL;
        """
    )
