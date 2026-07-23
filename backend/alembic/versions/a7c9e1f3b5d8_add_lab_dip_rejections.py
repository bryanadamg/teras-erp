"""add lab_dip_rejections rejection log

Revision ID: a7c9e1f3b5d8
Revises: d7f9b1a3c5e2
Create Date: 2026-07-23

One row per reject of a lab dip item. Count of rows = "rejected Nx" indicator
(survives reopen); each row keeps its own reason/notes for traceability.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a7c9e1f3b5d8"
down_revision = "d7f9b1a3c5e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lab_dip_rejections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lab_dip_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("round_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("rejected_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["lab_dip_item_id"], ["lab_dip_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rejected_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lab_dip_rejections_lab_dip_item_id",
        "lab_dip_rejections",
        ["lab_dip_item_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_lab_dip_rejections_lab_dip_item_id", table_name="lab_dip_rejections")
    op.drop_table("lab_dip_rejections")
