"""add color library master table

Introduces the `colors` master table (industry-standard shade reference:
Pantone + Colour Index + spectro note) and adds nullable `color_id` FKs to
dye_recipes, lab_dip_requests and lab_dip_lines.

Option A: `colors.attribute_value_id` mirrors each color to a `Colors` system
AttributeValue (1:1), so variant BOM and DYEING recipe matching keep working on
AttributeValue while every value gains a rich master record. All new columns are
nullable -> no data backfill required; existing free-text color fields untouched.

Revision ID: c6e8a0b2d4f6
Revises: a3c5e7b9d1f2
Create Date: 2026-06-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'c6e8a0b2d4f6'
down_revision: Union[str, None] = 'a3c5e7b9d1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'colors',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(64), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('pantone_ref', sa.String(64), nullable=True),
        sa.Column('colour_index', sa.String(128), nullable=True),
        sa.Column('hex', sa.String(9), nullable=True),
        sa.Column('substrate', sa.String(128), nullable=True),
        sa.Column('customer_id', UUID(as_uuid=True), nullable=True),
        sa.Column('customer_color_code', sa.String(128), nullable=True),
        sa.Column('spectro_notes', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='active'),
        sa.Column('attribute_value_id', UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_colors'),
        sa.ForeignKeyConstraint(['customer_id'], ['partners.id'], name='fk_colors_customer_id_partners'),
        sa.ForeignKeyConstraint(['attribute_value_id'], ['attribute_values.id'], name='fk_colors_attribute_value_id_attribute_values', ondelete='SET NULL'),
    )
    op.create_index('ix_colors_code', 'colors', ['code'], unique=True)
    op.create_index('ix_colors_name', 'colors', ['name'])
    op.create_index('ix_colors_pantone_ref', 'colors', ['pantone_ref'])
    op.create_index('ix_colors_status', 'colors', ['status'])
    op.create_index('ix_colors_customer_id', 'colors', ['customer_id'])
    op.create_index('ix_colors_attribute_value_id', 'colors', ['attribute_value_id'])

    for table in ('dye_recipes', 'lab_dip_requests', 'lab_dip_lines'):
        op.add_column(table, sa.Column('color_id', UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f'fk_{table}_color_id_colors', table, 'colors',
            ['color_id'], ['id'], ondelete='SET NULL',
        )
        op.create_index(f'ix_{table}_color_id', table, ['color_id'])


def downgrade() -> None:
    for table in ('lab_dip_lines', 'lab_dip_requests', 'dye_recipes'):
        op.drop_index(f'ix_{table}_color_id', table_name=table)
        op.drop_constraint(f'fk_{table}_color_id_colors', table, type_='foreignkey')
        op.drop_column(table, 'color_id')

    for ix in ('ix_colors_attribute_value_id', 'ix_colors_customer_id', 'ix_colors_status',
               'ix_colors_pantone_ref', 'ix_colors_name', 'ix_colors_code'):
        op.drop_index(ix, table_name='colors')
    op.drop_table('colors')
