"""add performance indexes on hot filter/sort/FK columns

Baseline schema was stamped off a legacy DB, so many model-declared (index=True)
indexes and several FK indexes never made it into the actual database. This adds
them. Index-only change: no behavior change, no API/contract change, pure read
speedup that grows with data volume.

All statements use IF NOT EXISTS so the migration is idempotent and safe regardless
of which indexes already exist in a given environment.

Revision ID: f9a1c2d3e4b5
Revises: c8d9e0f1a2b3
Create Date: 2026-06-14
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f9a1c2d3e4b5'
down_revision: Union[str, None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table, column-expression)
_INDEXES = [
    # manufacturing_orders — MO list endpoint filters parent_mo_id / created_at range,
    # sorts created_at DESC, filters status; FK joins on item/bom/location/PR/SO.
    ("ix_manufacturing_orders_created_at", "manufacturing_orders", "created_at"),
    ("ix_manufacturing_orders_status", "manufacturing_orders", "status"),
    ("ix_manufacturing_orders_parent_mo_id", "manufacturing_orders", "parent_mo_id"),
    ("ix_manufacturing_orders_item_id", "manufacturing_orders", "item_id"),
    ("ix_manufacturing_orders_bom_id", "manufacturing_orders", "bom_id"),
    ("ix_manufacturing_orders_location_id", "manufacturing_orders", "location_id"),
    ("ix_manufacturing_orders_production_run_id", "manufacturing_orders", "production_run_id"),
    ("ix_manufacturing_orders_sales_order_id", "manufacturing_orders", "sales_order_id"),

    # mo_dependencies — MRP pegging traversal. dependent_mo_id is covered by the
    # composite PK's leftmost column; required_mo_id needs its own index for reverse lookups.
    ("ix_mo_dependencies_required_mo_id", "mo_dependencies", "required_mo_id"),

    # mo_planned_components — material availability checks join by mo_id / item_id / location.
    ("ix_mo_planned_components_mo_id", "mo_planned_components", "mo_id"),
    ("ix_mo_planned_components_item_id", "mo_planned_components", "item_id"),
    ("ix_mo_planned_components_source_location_id", "mo_planned_components", "source_location_id"),

    # mo_completions — completion queries by mo_id / work_center_id / time.
    ("ix_mo_completions_mo_id", "mo_completions", "mo_id"),
    ("ix_mo_completions_work_center_id", "mo_completions", "work_center_id"),
    ("ix_mo_completions_created_at", "mo_completions", "created_at"),

    # work_orders — center_type filtering joins on work_center_id; location routing.
    ("ix_work_orders_work_center_id", "work_orders", "work_center_id"),
    ("ix_work_orders_input_location_id", "work_orders", "input_location_id"),
    ("ix_work_orders_output_location_id", "work_orders", "output_location_id"),

    # stock_ledger — model declares index=True on these but baseline only created batch_id.
    ("ix_stock_ledger_item_id", "stock_ledger", "item_id"),
    ("ix_stock_ledger_location_id", "stock_ledger", "location_id"),
    ("ix_stock_ledger_created_at", "stock_ledger", "created_at"),
]

# Composite indexes: (index_name, table, "colA, colB, ...")
_COMPOSITE_INDEXES = [
    # audit_logs — "history of one entity" lookup: entity_type + entity_id, ordered by timestamp.
    ("ix_audit_logs_entity_type_entity_id_timestamp", "audit_logs", "entity_type, entity_id, timestamp"),
]


def upgrade() -> None:
    for name, table, column in _INDEXES:
        op.execute(f'CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})')
    for name, table, columns in _COMPOSITE_INDEXES:
        op.execute(f'CREATE INDEX IF NOT EXISTS {name} ON {table} ({columns})')


def downgrade() -> None:
    for name, _table, _column in _INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')
    for name, _table, _columns in _COMPOSITE_INDEXES:
        op.execute(f'DROP INDEX IF EXISTS {name}')
