"""backfill packed-unit size from the lots each carton was packed from

A carton (a `Batch` row with `packing_order_id`) now inherits its source lot's
size at mint time — shade/combo/attributes never needed copying because they ride
in the carton's StockBalance `variant_key`, but size is stamped on the Batch row
and has nowhere else to live, so it was simply lost on every carton packed before
this.

Recoverable after the fact: `batch_consumptions` already pegs input lot -> carton
for genealogy, so the size can be read back through it. Same rule as the mint
path (`packing_service.lot_size_identity`): a carton fed by lots that disagree on
size has no single size and is left null rather than given whichever lot won a
join.

Revision ID: f8a0c2e4b6d9
Revises: e4b6d8f0a2c7
"""
from alembic import op

revision = "f8a0c2e4b6d9"
down_revision = "e4b6d8f0a2c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # One statement: for every carton with no size, take the size of its input
    # lots when they all agree (COUNT DISTINCT = 1) and only then.
    op.execute(
        """
        UPDATE batches AS carton
        SET bom_size_id = src.bom_size_id,
            bom_size_snapshot = src.bom_size_snapshot
        FROM (
            SELECT bc.output_batch_id AS carton_id,
                   MIN(inp.bom_size_id::text)::uuid AS bom_size_id,
                   MIN(inp.bom_size_snapshot::text)::json AS bom_size_snapshot
            FROM batch_consumptions bc
            JOIN batches inp ON inp.id = bc.input_batch_id
            WHERE bc.output_batch_id IS NOT NULL
              AND inp.bom_size_id IS NOT NULL
            GROUP BY bc.output_batch_id
            HAVING COUNT(DISTINCT inp.bom_size_id) = 1
        ) AS src
        WHERE carton.id = src.carton_id
          AND carton.packing_order_id IS NOT NULL
          AND carton.bom_size_id IS NULL
        """
    )


def downgrade() -> None:
    # Clearing a carton's size would also clear one set at mint by the current
    # code, and the field is purely descriptive — nothing keys off it. Leave it.
    pass
