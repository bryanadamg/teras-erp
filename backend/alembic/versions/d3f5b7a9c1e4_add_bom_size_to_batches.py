"""add bom_size to batches

Revision ID: d3f5b7a9c1e4
Revises: c1d3e5f7a9b0
Create Date: 2026-07-20

Stamp a produced lot's size identity onto the output Batch at WO completion.
A sized greige lot (GRG-) woven for size L now records that size: bom_size_id
is the joinable FK; bom_size_snapshot is the immutable {size_name, label, ...}
label so a later BOMSize edit/delete can't corrupt an already-produced lot.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "d3f5b7a9c1e4"
down_revision = "c1d3e5f7a9b0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("batches", sa.Column("bom_size_id", UUID(as_uuid=True), nullable=True))
    op.add_column("batches", sa.Column("bom_size_snapshot", sa.JSON(), nullable=True))
    op.create_foreign_key(
        "fk_batches_bom_size_id", "batches", "bom_sizes",
        ["bom_size_id"], ["id"], ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_batches_bom_size_id", "batches", type_="foreignkey")
    op.drop_column("batches", "bom_size_snapshot")
    op.drop_column("batches", "bom_size_id")
