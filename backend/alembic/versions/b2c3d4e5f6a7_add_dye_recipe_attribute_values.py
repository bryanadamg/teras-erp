"""add dye_recipe_attribute_values junction table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS dye_recipe_attribute_values (
            dye_recipe_id UUID NOT NULL REFERENCES dye_recipes(id) ON DELETE CASCADE,
            attribute_value_id UUID NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
            PRIMARY KEY (dye_recipe_id, attribute_value_id)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dye_recipe_attribute_values")
