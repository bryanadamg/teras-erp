"""dyeing enhancements wash baths finishing job fields

Revision ID: 38109e90dea5
Revises: b4c7d2e9f1a3
Create Date: 2026-05-16 12:07:55.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '38109e90dea5'
down_revision: Union[str, None] = 'b4c7d2e9f1a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # dye_recipe_lines: make qty_per_100kg nullable and add qty_per_liter
    op.execute("ALTER TABLE dye_recipe_lines ALTER COLUMN qty_per_100kg DROP NOT NULL")
    op.execute("ALTER TABLE dye_recipe_lines ADD COLUMN IF NOT EXISTS qty_per_liter NUMERIC(14, 6)")

    # dyeing_runs: add new process + job metadata columns
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS volume_air_liters NUMERIC(10, 2)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS machine_speed NUMERIC(6, 2)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS machine_pressure VARCHAR(32)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS color_name VARCHAR(64)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS color_matching_ref VARCHAR(64)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS lot_number VARCHAR(64)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS customer_name VARCHAR(128)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS artikel VARCHAR(128)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS po_number VARCHAR(64)")
    op.execute("ALTER TABLE dyeing_runs ADD COLUMN IF NOT EXISTS qty_order_kg NUMERIC(10, 2)")

    # dye_recipe_wash_baths table
    op.execute("""
        CREATE TABLE IF NOT EXISTS dye_recipe_wash_baths (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recipe_id UUID NOT NULL REFERENCES dye_recipes(id) ON DELETE CASCADE,
            bath_number INTEGER NOT NULL,
            description VARCHAR(256) NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dye_recipe_wash_baths_recipe_id ON dye_recipe_wash_baths (recipe_id)")

    # dye_recipe_finishing table
    op.execute("""
        CREATE TABLE IF NOT EXISTS dye_recipe_finishing (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recipe_id UUID NOT NULL REFERENCES dye_recipes(id) ON DELETE CASCADE,
            description VARCHAR(512) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dye_recipe_finishing_recipe_id ON dye_recipe_finishing (recipe_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dye_recipe_finishing")
    op.execute("DROP TABLE IF EXISTS dye_recipe_wash_baths")

    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS qty_order_kg")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS po_number")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS artikel")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS customer_name")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS lot_number")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS color_matching_ref")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS color_name")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS machine_pressure")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS machine_speed")
    op.execute("ALTER TABLE dyeing_runs DROP COLUMN IF EXISTS volume_air_liters")

    op.execute("ALTER TABLE dye_recipe_lines DROP COLUMN IF EXISTS qty_per_liter")
    op.execute("ALTER TABLE dye_recipe_lines ALTER COLUMN qty_per_100kg SET NOT NULL")
