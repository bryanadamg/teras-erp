"""add sales_order_lines.bom_id (persist the recipe picked on the SO line)

The SO form has always let the user pick WHICH BOM a line is ordered against —
it drives the size dropdown and the Combo gate — but the pick was client-only:
`SalesOrderLineCreate` had no `bom_id`, so Pydantic dropped it on save. The PR
pre-fill then re-derived the BOM from (item_id, attribute_value_ids) alone.

That derivation is ambiguous whenever one item owns several attribute-less BOMs
— the color-variant shape, where each shade has its own root BOM over its own
greige (403 RED vs 403 NAVY) and the shade itself rides `color_id`, not an
attribute. Both BOMs match `[] == []`, so every line collapsed onto whichever
BOM came first in the array: a 2-shade SO produced two PR entries pointing at
the SAME recipe.

Nothing on the BOM can disambiguate them (BOMs carry no color_id and both are
attribute-less), so the user's pick has to be stored. Nullable: existing rows
stay NULL and keep falling through to the old attribute derivation, which is
correct for every unambiguous case (single-BOM color items, combo items whose
BOM is already pinned by the Combo attribute value).

Revision ID: e9b1d3f5a7c2
Revises: b2d4f6a8c0e1
Create Date: 2026-08-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'e9b1d3f5a7c2'
down_revision: Union[str, None] = 'b2d4f6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sales_order_lines',
        sa.Column('bom_id', UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_sales_order_lines_bom_id',
        'sales_order_lines', 'boms',
        ['bom_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_sales_order_lines_bom_id', 'sales_order_lines', ['bom_id'])


def downgrade() -> None:
    op.drop_index('ix_sales_order_lines_bom_id', table_name='sales_order_lines')
    op.drop_constraint('fk_sales_order_lines_bom_id', 'sales_order_lines', type_='foreignkey')
    op.drop_column('sales_order_lines', 'bom_id')
