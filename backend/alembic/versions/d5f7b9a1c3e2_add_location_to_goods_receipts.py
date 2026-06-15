"""add receiving warehouse (location_id) to goods_receipts

The receiving warehouse can now be chosen per goods receipt instead of being fixed
to the PO's target location. Column is nullable: existing receipts predate the
feature and keep NULL; new receipts always store the resolved location.

Revision ID: d5f7b9a1c3e2
Revises: c2e4a6b8d0f2
Create Date: 2026-06-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd5f7b9a1c3e2'
down_revision: Union[str, None] = 'c2e4a6b8d0f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "goods_receipts",
        sa.Column("location_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_goods_receipts_location_id_locations",
        "goods_receipts",
        "locations",
        ["location_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_goods_receipts_location_id_locations", "goods_receipts", type_="foreignkey")
    op.drop_column("goods_receipts", "location_id")
