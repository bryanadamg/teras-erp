"""index production_runs.sales_order_id

The sales-order list now serves each row's PR code chips from a grouped query on
production_runs.sales_order_id (_populate_production_runs), and the duplicate-PR
guard GET /sales-orders/{id}/pr-coverage filters the same column per click. Both
replaced a client-side scan of the windowed /production-runs feed. The FK had no
index, so both were sequential scans on the SO list's hot path.

Revision ID: a2f4c6e8b0d3
Revises: c4e6a8b0d2f7
"""
from alembic import op


revision = "a2f4c6e8b0d3"
down_revision = "c4e6a8b0d2f7"
branch_labels = None
depends_on = None


INDEX_NAME = "ix_production_runs_sales_order_id"


def upgrade() -> None:
    op.create_index(
        INDEX_NAME, "production_runs", ["sales_order_id"], unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="production_runs", if_exists=True)
