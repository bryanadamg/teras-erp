"""packaging types master + carton packaging/brutto columns

The packer states which physical box each carton went into (Box S/M/L/XL,
Plastic Bag, Custom). Every standard box has a known empty weight, so brutto is
net + tare; the Custom row has none and is weighed by hand at pack time.

`tare_kg` and `gross_weight_kg` are stored on the carton rather than read
through the FK: editing a box's tare must not rewrite labels and delivery notes
already printed. The FK is SET NULL so archiving a type never deletes cartons.

Revision ID: c8e0a2b4d6f1
Revises: b6d8f0a2c4e9
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c8e0a2b4d6f1'
down_revision = 'b6d8f0a2c4e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'packaging_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(32), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        # Null on the custom row, where the tare is typed per carton instead.
        sa.Column('tare_kg', sa.Numeric(14, 4), nullable=True),
        sa.Column('is_custom', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_packaging_types_code', 'packaging_types', ['code'], unique=True)
    op.create_index('ix_packaging_types_name', 'packaging_types', ['name'])
    op.create_index('ix_packaging_types_active', 'packaging_types', ['active'])

    op.add_column('batches', sa.Column('packaging_type_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('batches', sa.Column('tare_kg', sa.Numeric(14, 4), nullable=True))
    op.add_column('batches', sa.Column('gross_weight_kg', sa.Numeric(14, 4), nullable=True))
    op.create_index('ix_batches_packaging_type_id', 'batches', ['packaging_type_id'])
    op.create_foreign_key(
        'fk_batches_packaging_type_id', 'batches', 'packaging_types',
        ['packaging_type_id'], ['id'], ondelete='SET NULL',
    )
    # Cartons packed before this feature keep all three NULL. They are NOT
    # backfilled with a zero tare: gross == net would read as a measured figure
    # rather than an unknown one, and the label prints a blank G.W. line instead.

    # The seed (Box S/M/L/XL, Plastic Bag, Custom) runs in init_db.py, which is
    # where every other master seed lives — Alembic owns schema only.


def downgrade() -> None:
    op.drop_constraint('fk_batches_packaging_type_id', 'batches', type_='foreignkey')
    op.drop_index('ix_batches_packaging_type_id', table_name='batches')
    op.drop_column('batches', 'gross_weight_kg')
    op.drop_column('batches', 'tare_kg')
    op.drop_column('batches', 'packaging_type_id')
    op.drop_index('ix_packaging_types_active', table_name='packaging_types')
    op.drop_index('ix_packaging_types_name', table_name='packaging_types')
    op.drop_index('ix_packaging_types_code', table_name='packaging_types')
    op.drop_table('packaging_types')
