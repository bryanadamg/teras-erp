"""replace location category with self-referential parent hierarchy

Revision ID: a2b3c4d5e6f8
Revises: d8a1b3c5e7f9
Create Date: 2026-06-23 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a2b3c4d5e6f8'
down_revision: Union[str, None] = 'd8a1b3c5e7f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the label-style category feature.
    op.execute("ALTER TABLE locations DROP CONSTRAINT IF EXISTS fk_locations_category_id_location_categories")
    op.execute("DROP INDEX IF EXISTS ix_locations_category_id")
    op.execute("ALTER TABLE locations DROP COLUMN IF EXISTS category_id")
    op.execute("DROP INDEX IF EXISTS ix_location_categories_name")
    op.execute("DROP TABLE IF EXISTS location_categories")

    # Add self-referential parent hierarchy (warehouse -> spot).
    op.execute("ALTER TABLE locations ADD COLUMN IF NOT EXISTS parent_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_locations_parent_id ON locations (parent_id)")
    op.execute("ALTER TABLE locations DROP CONSTRAINT IF EXISTS fk_locations_parent_id_locations")
    op.execute(
        """
        ALTER TABLE locations
        ADD CONSTRAINT fk_locations_parent_id_locations
        FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE RESTRICT
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE locations DROP CONSTRAINT IF EXISTS fk_locations_parent_id_locations")
    op.execute("DROP INDEX IF EXISTS ix_locations_parent_id")
    op.execute("ALTER TABLE locations DROP COLUMN IF EXISTS parent_id")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS location_categories (
            id UUID PRIMARY KEY,
            name VARCHAR(128) NOT NULL
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_location_categories_name ON location_categories (name)")
    op.execute("ALTER TABLE locations ADD COLUMN IF NOT EXISTS category_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_locations_category_id ON locations (category_id)")
    op.execute(
        """
        ALTER TABLE locations
        ADD CONSTRAINT fk_locations_category_id_location_categories
        FOREIGN KEY (category_id) REFERENCES location_categories(id) ON DELETE SET NULL
        """
    )
