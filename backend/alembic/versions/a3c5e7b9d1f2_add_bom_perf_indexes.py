"""add performance indexes on BOM table FK columns

The BOM tables (boms/bom_lines/bom_operations/bom_sizes) declare index=True on
their FK columns in the models, but the baseline was stamped off a legacy DB and
the earlier perf-index migration (f9a1c2d3e4b5) covered only manufacturing/stock
tables — the BOM FK indexes never made it into the actual database. The BOM list
endpoint selectin-loads lines/sizes/operations by bom_id and joins lines→item by
item_id, so these are the hot columns.

Index-only change: no behavior change, no API/contract change, pure read speedup
that grows with BOM/line volume.

All statements use IF NOT EXISTS so the migration is idempotent and safe
regardless of which indexes already exist in a given environment.

Revision ID: a3c5e7b9d1f2
Revises: f2a4b6c8d0e1
Create Date: 2026-06-27
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a3c5e7b9d1f2'
down_revision: Union[str, None] = 'f2a4b6c8d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table, column)
_INDEXES = [
    # bom_lines — list endpoint selectin-loads lines by bom_id, then joins each
    # line to its item by item_id.
    ("ix_bom_lines_bom_id", "bom_lines", "bom_id"),
    ("ix_bom_lines_item_id", "bom_lines", "item_id"),
    # bom_operations — operation-count aggregate groups by bom_id.
    ("ix_bom_operations_bom_id", "bom_operations", "bom_id"),
    # bom_sizes — selectin-loaded by bom_id, joined to sizes by size_id.
    ("ix_bom_sizes_bom_id", "bom_sizes", "bom_id"),
    ("ix_bom_sizes_size_id", "bom_sizes", "size_id"),
]


def upgrade() -> None:
    for name, table, column in _INDEXES:
        op.execute(f'CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})')


def downgrade() -> None:
    for name, _table, _column in _INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')
