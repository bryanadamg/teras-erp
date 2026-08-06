"""QC reject routing: defect-store locations + packing-side reject

Rejected output used to stay wherever it was booked, flagged but sitting on the
good-stock shelf. The floor asked for a defect store per material type (greige
reject -> "Gd Greige BS", beam reject -> "Gd WiP Beam Reject", and packing rejects
of their own), so the reject bin is now *routed* rather than typed in:

  work_centers.reject_location_id   (inherited down TYPE -> GROUP -> MACHINE)
    -> items.default_reject_location_id
       -> nothing configured: the pre-existing behaviour (stock stays / write-off)

`mo_completions.reject_location_id` records where each reject actually went, so
the per-WO reject report can show it. Packing gets the same reject columns as a WO
completion, because cartons are QC-rejected too and a PackingCompletion has no
work center to peg to.

No data migration: every column is nullable (or defaulted) and existing rejects
keep reading exactly as they did — reject_location_id null means "predates
routing".

Revision ID: d3f5a7c9e1b4
Revises: 2afd23590ae8
"""
import sqlalchemy as sa
from alembic import op

revision = 'd3f5a7c9e1b4'
down_revision = '2afd23590ae8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Defect-store routing ------------------------------------------------
    op.add_column('work_centers', sa.Column('reject_location_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_work_centers_reject_location_id', 'work_centers', 'locations',
        ['reject_location_id'], ['id'],
    )
    op.add_column('items', sa.Column('default_reject_location_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_items_default_reject_location_id', 'items', 'locations',
        ['default_reject_location_id'], ['id'], ondelete='SET NULL',
    )

    # --- Where a WO-completion reject was quarantined ------------------------
    op.add_column('mo_completions', sa.Column('reject_location_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_mo_completions_reject_location_id', 'mo_completions', 'locations',
        ['reject_location_id'], ['id'], ondelete='SET NULL',
    )

    # --- Packing-side QC reject ---------------------------------------------
    op.add_column('packing_completions', sa.Column('rejected', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('packing_completions', sa.Column('qty_rejected', sa.Numeric(14, 4), nullable=False, server_default='0'))
    op.add_column('packing_completions', sa.Column('package_count_rejected', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('packing_completions', sa.Column('reject_reason', sa.String(length=512), nullable=True))
    op.add_column('packing_completions', sa.Column('rejected_at', sa.DateTime(), nullable=True))
    op.add_column('packing_completions', sa.Column('rejected_by', sa.String(length=128), nullable=True))
    op.add_column('packing_completions', sa.Column('reject_location_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_packing_completions_reject_location_id', 'packing_completions', 'locations',
        ['reject_location_id'], ['id'], ondelete='SET NULL',
    )
    # The reject report filters on "logs that scrapped something"; without this the
    # scan is a full table read of every pack event ever logged.
    op.create_index(
        'ix_packing_completions_rejected_qty', 'packing_completions', ['qty_rejected'],
        postgresql_where=sa.text('qty_rejected > 0'),
    )
    # Same shape on the manufacturing side — the per-WO/per-machine reject detail
    # query hits only rejected logs.
    op.create_index(
        'ix_mo_completions_rejected_qty', 'mo_completions', ['qty_rejected'],
        postgresql_where=sa.text('qty_rejected > 0'),
    )


def downgrade() -> None:
    op.drop_index('ix_mo_completions_rejected_qty', table_name='mo_completions')
    op.drop_index('ix_packing_completions_rejected_qty', table_name='packing_completions')
    op.drop_constraint('fk_packing_completions_reject_location_id', 'packing_completions', type_='foreignkey')
    for col in (
        'reject_location_id', 'rejected_by', 'rejected_at', 'reject_reason',
        'package_count_rejected', 'qty_rejected', 'rejected',
    ):
        op.drop_column('packing_completions', col)

    op.drop_constraint('fk_mo_completions_reject_location_id', 'mo_completions', type_='foreignkey')
    op.drop_column('mo_completions', 'reject_location_id')

    op.drop_constraint('fk_items_default_reject_location_id', 'items', type_='foreignkey')
    op.drop_column('items', 'default_reject_location_id')

    op.drop_constraint('fk_work_centers_reject_location_id', 'work_centers', type_='foreignkey')
    op.drop_column('work_centers', 'reject_location_id')
