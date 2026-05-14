"""add_mo_planned_components

Revision ID: c344af2c8543
Revises: 5fd67d0d5a49
Create Date: 2026-05-14 06:18:51.801615

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c344af2c8543'
down_revision: Union[str, None] = '5fd67d0d5a49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # Backfill schema from migrations a3f9c2b1e8d4 and 5fd67d0d5a49 that were
    # never executed on stamped deployments (dev and prod were both stamped at
    # 5fd67d0d5a49 without running the actual upgrade functions).
    # All statements use IF NOT EXISTS / IF EXISTS so they are idempotent on
    # DBs where the schema was already applied manually.
    # -----------------------------------------------------------------------

    # --- from a3f9c2b1e8d4 ---
    op.execute("ALTER TABLE attributes ADD COLUMN IF NOT EXISTS system_role VARCHAR(32)")
    op.execute("ALTER TABLE sample_requests ADD COLUMN IF NOT EXISTS variant_type VARCHAR(16) NOT NULL DEFAULT 'color'")

    # --- from 5fd67d0d5a49 ---
    op.execute("ALTER TABLE work_centers ADD COLUMN IF NOT EXISTS center_type VARCHAR(16) NOT NULL DEFAULT 'GENERAL'")

    op.execute("""
        CREATE TABLE IF NOT EXISTS dye_recipes (
            id UUID PRIMARY KEY,
            code VARCHAR(32) NOT NULL,
            name VARCHAR(128) NOT NULL,
            color_standard VARCHAR(64),
            substrate_type VARCHAR(64),
            notes TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dye_recipes_code ON dye_recipes (code)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS dye_recipe_lines (
            id UUID PRIMARY KEY,
            recipe_id UUID NOT NULL REFERENCES dye_recipes(id) ON DELETE CASCADE,
            item_id UUID NOT NULL REFERENCES items(id),
            qty_per_100kg NUMERIC(14,4) NOT NULL,
            uom_id UUID REFERENCES uoms(id),
            chemical_type VARCHAR(16) NOT NULL DEFAULT 'OTHER',
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dye_recipe_lines_recipe_id ON dye_recipe_lines (recipe_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_dye_recipe_lines_item_id ON dye_recipe_lines (item_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS dyeing_runs (
            id UUID PRIMARY KEY,
            work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
            run_number INTEGER NOT NULL DEFAULT 1,
            recipe_id UUID REFERENCES dye_recipes(id) ON DELETE SET NULL,
            substrate_qty NUMERIC(14,4) NOT NULL,
            input_batch_id UUID REFERENCES batches(id),
            output_batch_id UUID REFERENCES batches(id),
            machine_name VARCHAR(128),
            liquor_ratio NUMERIC(6,2),
            temperature_c NUMERIC(6,2),
            duration_min INTEGER,
            status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
            shade_result VARCHAR(16),
            shade_notes TEXT,
            operator_name VARCHAR(128),
            notes TEXT,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dyeing_runs_work_order_id ON dyeing_runs (work_order_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS dyeing_run_chemicals (
            id UUID PRIMARY KEY,
            run_id UUID NOT NULL REFERENCES dyeing_runs(id) ON DELETE CASCADE,
            item_id UUID NOT NULL REFERENCES items(id),
            planned_qty NUMERIC(14,4) NOT NULL,
            actual_qty NUMERIC(14,4) NOT NULL,
            uom_id UUID REFERENCES uoms(id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dyeing_run_chemicals_run_id ON dyeing_run_chemicals (run_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_dyeing_run_chemicals_item_id ON dyeing_run_chemicals (item_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS setting_runs (
            id UUID PRIMARY KEY,
            work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
            run_number INTEGER NOT NULL DEFAULT 1,
            substrate_qty NUMERIC(14,4) NOT NULL,
            input_batch_id UUID REFERENCES batches(id),
            output_batch_id UUID REFERENCES batches(id),
            machine_name VARCHAR(128),
            temperature_c NUMERIC(6,2),
            speed_mpm NUMERIC(6,2),
            width_cm NUMERIC(6,2),
            overfeed_pct NUMERIC(6,2),
            actual_width_cm NUMERIC(6,2),
            actual_gsm NUMERIC(8,4),
            actual_shrinkage_pct NUMERIC(6,2),
            status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
            operator_name VARCHAR(128),
            notes TEXT,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_setting_runs_work_order_id ON setting_runs (work_order_id)")

    # -----------------------------------------------------------------------
    # Net-new schema
    # -----------------------------------------------------------------------

    op.execute("""
        CREATE TABLE IF NOT EXISTS mo_completion_items (
            id UUID PRIMARY KEY,
            completion_id UUID NOT NULL REFERENCES mo_completions(id) ON DELETE CASCADE,
            item_id UUID NOT NULL REFERENCES items(id),
            qty_used NUMERIC(14,4) NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mo_completion_items_completion_id ON mo_completion_items (completion_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS mo_planned_components (
            id UUID PRIMARY KEY,
            mo_id UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
            item_id UUID NOT NULL REFERENCES items(id),
            percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
            qty NUMERIC(14,4) NOT NULL DEFAULT 0,
            source_location_id UUID REFERENCES locations(id),
            bom_line_id UUID REFERENCES bom_lines(id) ON DELETE SET NULL,
            attribute_value_ids JSON NOT NULL DEFAULT '[]'
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mo_planned_components_mo_id ON mo_planned_components (mo_id)")
    # Idempotent: no-op if column is already NOT NULL (fresh create above),
    # applies constraint on DBs where the table was created manually as nullable.
    op.execute("ALTER TABLE mo_planned_components ALTER COLUMN percentage SET NOT NULL")
    op.execute("ALTER TABLE mo_planned_components ALTER COLUMN qty SET NOT NULL")
    op.execute("ALTER TABLE mo_planned_components ALTER COLUMN attribute_value_ids SET NOT NULL")

    op.execute("ALTER TABLE mo_completions ADD COLUMN IF NOT EXISTS work_order_id UUID")
    op.execute("ALTER TABLE mo_completions ADD COLUMN IF NOT EXISTS work_center_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_mo_completions_work_order_id ON mo_completions (work_order_id)")
    op.execute("ALTER TABLE mo_completions DROP CONSTRAINT IF EXISTS fk_mo_completions_work_order_id_work_orders")
    op.execute("ALTER TABLE mo_completions DROP CONSTRAINT IF EXISTS fk_mo_completions_work_center_id_work_centers")
    op.create_foreign_key('fk_mo_completions_work_order_id_work_orders', 'mo_completions', 'work_orders', ['work_order_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_mo_completions_work_center_id_work_centers', 'mo_completions', 'work_centers', ['work_center_id'], ['id'])

    # -----------------------------------------------------------------------
    # Schema drift fixes (index/constraint renames, type changes, column drops)
    # -----------------------------------------------------------------------

    op.execute("DROP INDEX IF EXISTS idx_audit_logs_entity_id")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_entity_type")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_timestamp")

    op.alter_column('bom_lines', 'percentage',
                    existing_type=sa.NUMERIC(precision=6, scale=2),
                    nullable=False,
                    existing_server_default=sa.text('0.0'))
    op.execute("DROP INDEX IF EXISTS idx_bom_lines_item_id")

    op.alter_column('boms', 'code',
                    existing_type=sa.VARCHAR(length=64),
                    type_=sa.String(length=255),
                    existing_nullable=False)
    op.execute("ALTER TABLE boms DROP CONSTRAINT IF EXISTS boms_customer_id_fkey")
    op.execute("ALTER TABLE boms DROP CONSTRAINT IF EXISTS boms_work_center_id_fkey")
    op.execute("ALTER TABLE boms DROP CONSTRAINT IF EXISTS fk_boms_customer_id_partners")
    op.execute("ALTER TABLE boms DROP CONSTRAINT IF EXISTS fk_boms_work_center_id_work_centers")
    op.create_foreign_key('fk_boms_customer_id_partners', 'boms', 'partners', ['customer_id'], ['id'])
    op.create_foreign_key('fk_boms_work_center_id_work_centers', 'boms', 'work_centers', ['work_center_id'], ['id'])

    # dye_recipes: model uses a unique index, not a unique constraint
    op.execute("ALTER TABLE dye_recipes DROP CONSTRAINT IF EXISTS dye_recipes_code_key")
    op.execute("ALTER TABLE dye_recipes ALTER COLUMN created_at SET NOT NULL")
    op.execute("ALTER TABLE dyeing_runs ALTER COLUMN created_at SET NOT NULL")
    op.execute("ALTER TABLE setting_runs ALTER COLUMN created_at SET NOT NULL")

    op.alter_column('items', 'code',
                    existing_type=sa.VARCHAR(length=64),
                    type_=sa.String(length=255),
                    existing_nullable=False)
    op.execute("DROP INDEX IF EXISTS idx_items_category")
    op.execute("DROP INDEX IF EXISTS idx_items_code_trgm")
    op.execute("DROP INDEX IF EXISTS idx_items_name_trgm")
    op.execute("ALTER TABLE items DROP CONSTRAINT IF EXISTS items_attribute_id_fkey")
    op.execute("ALTER TABLE items DROP COLUMN IF EXISTS attribute_id")

    op.execute("CREATE INDEX IF NOT EXISTS ix_purchase_order_lines_item_id ON purchase_order_lines (item_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sales_order_lines_item_id ON sales_order_lines (item_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sales_orders_status ON sales_orders (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sample_colors_sample_request_id ON sample_colors (sample_request_id)")

    op.alter_column('sample_requests', 'updated_at',
                    existing_type=postgresql.TIMESTAMP(),
                    nullable=False,
                    existing_server_default=sa.text('now()'))
    op.execute("DROP INDEX IF EXISTS idx_sample_requests_base_id")
    op.execute("DROP INDEX IF EXISTS idx_sample_requests_customer_id")
    op.execute("DROP INDEX IF EXISTS idx_sample_requests_so_id")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sample_requests_customer_id ON sample_requests (customer_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sample_requests_status ON sample_requests (status)")

    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_balances_batch_key ON stock_balances (batch_key)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_ledger_batch_id ON stock_ledger (batch_id)")

    op.alter_column('work_orders', 'qty',
                    existing_type=sa.NUMERIC(precision=14, scale=4),
                    type_=sa.Float(),
                    existing_nullable=True)


def downgrade() -> None:
    op.alter_column('work_orders', 'qty',
                    existing_type=sa.Float(),
                    type_=sa.NUMERIC(precision=14, scale=4),
                    existing_nullable=True)
    op.execute("DROP INDEX IF EXISTS ix_stock_ledger_batch_id")
    op.execute("DROP INDEX IF EXISTS ix_stock_balances_batch_key")
    op.execute("DROP INDEX IF EXISTS ix_sample_requests_status")
    op.execute("DROP INDEX IF EXISTS ix_sample_requests_customer_id")
    op.alter_column('sample_requests', 'updated_at',
                    existing_type=postgresql.TIMESTAMP(),
                    nullable=True,
                    existing_server_default=sa.text('now()'))
    op.execute("DROP INDEX IF EXISTS ix_sample_colors_sample_request_id")
    op.execute("DROP INDEX IF EXISTS ix_sales_orders_status")
    op.execute("DROP INDEX IF EXISTS ix_sales_order_lines_item_id")
    op.execute("DROP INDEX IF EXISTS ix_purchase_order_lines_item_id")
    op.execute("ALTER TABLE mo_completions DROP CONSTRAINT IF EXISTS fk_mo_completions_work_center_id_work_centers")
    op.execute("ALTER TABLE mo_completions DROP CONSTRAINT IF EXISTS fk_mo_completions_work_order_id_work_orders")
    op.execute("DROP INDEX IF EXISTS ix_mo_completions_work_order_id")
    op.execute("ALTER TABLE mo_completions DROP COLUMN IF EXISTS work_center_id")
    op.execute("ALTER TABLE mo_completions DROP COLUMN IF EXISTS work_order_id")
    op.execute("DROP TABLE IF EXISTS mo_planned_components")
    op.execute("DROP TABLE IF EXISTS mo_completion_items")
    op.execute("DROP TABLE IF EXISTS setting_runs")
    op.execute("DROP TABLE IF EXISTS dyeing_run_chemicals")
    op.execute("DROP TABLE IF EXISTS dyeing_runs")
    op.execute("DROP TABLE IF EXISTS dye_recipe_lines")
    op.execute("DROP TABLE IF EXISTS dye_recipes")
    op.execute("ALTER TABLE work_centers DROP COLUMN IF EXISTS center_type")
    op.execute("ALTER TABLE sample_requests DROP COLUMN IF EXISTS variant_type")
    op.execute("ALTER TABLE attributes DROP COLUMN IF EXISTS system_role")
