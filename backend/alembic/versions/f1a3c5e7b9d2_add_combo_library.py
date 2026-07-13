"""add combo library

Revision ID: f1a3c5e7b9d2
Revises: e235f74a2780
Create Date: 2026-07-13

Combo master library — dedicated searchable home for yarn-dyed/woven-pattern variant
values (hundreds/thousands), replacing the inline `Combo` attribute value list.
Backfill of existing `Combo` AttributeValues into this table runs idempotently in
init_db.backfill_combo_library() on startup.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "f1a3c5e7b9d2"
down_revision = "e235f74a2780"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "combos",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column(
            "attribute_value_id", UUID(as_uuid=True),
            sa.ForeignKey("attribute_values.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_combos_code", "combos", ["code"], unique=True)
    op.create_index("ix_combos_name", "combos", ["name"])
    op.create_index("ix_combos_status", "combos", ["status"])
    op.create_index("ix_combos_attribute_value_id", "combos", ["attribute_value_id"])


def downgrade() -> None:
    op.drop_index("ix_combos_attribute_value_id", table_name="combos")
    op.drop_index("ix_combos_status", table_name="combos")
    op.drop_index("ix_combos_name", table_name="combos")
    op.drop_index("ix_combos_code", table_name="combos")
    op.drop_table("combos")
