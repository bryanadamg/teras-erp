"""add_dyeing_setting

Revision ID: 5fd67d0d5a49
Revises: a3f9c2b1e8d4
Create Date: 2026-05-13 13:42:08.925245

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '5fd67d0d5a49'
down_revision: Union[str, None] = 'a3f9c2b1e8d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add center_type to work_centers
    op.add_column('work_centers', sa.Column('center_type', sa.String(length=16), nullable=False, server_default='GENERAL'))

    # Dye recipe library
    op.create_table(
        'dye_recipes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(32), nullable=False, unique=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('color_standard', sa.String(64), nullable=True),
        sa.Column('substrate_type', sa.String(64), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_dye_recipes_code', 'dye_recipes', ['code'], unique=True)

    op.create_table(
        'dye_recipe_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('recipe_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dye_recipes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('items.id'), nullable=False),
        sa.Column('qty_per_100kg', sa.Numeric(14, 4), nullable=False),
        sa.Column('uom_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('uoms.id'), nullable=True),
        sa.Column('chemical_type', sa.String(16), nullable=False, server_default='OTHER'),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
    )
    op.create_index('ix_dye_recipe_lines_recipe_id', 'dye_recipe_lines', ['recipe_id'])
    op.create_index('ix_dye_recipe_lines_item_id', 'dye_recipe_lines', ['item_id'])

    # Dyeing runs (sub-records per WO)
    op.create_table(
        'dyeing_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('work_order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('work_orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('run_number', sa.Integer, nullable=False, server_default='1'),
        sa.Column('recipe_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dye_recipes.id', ondelete='SET NULL'), nullable=True),
        sa.Column('substrate_qty', sa.Numeric(14, 4), nullable=False),
        sa.Column('input_batch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('batches.id'), nullable=True),
        sa.Column('output_batch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('batches.id'), nullable=True),
        sa.Column('machine_name', sa.String(128), nullable=True),
        sa.Column('liquor_ratio', sa.Numeric(6, 2), nullable=True),
        sa.Column('temperature_c', sa.Numeric(6, 2), nullable=True),
        sa.Column('duration_min', sa.Integer, nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='PENDING'),
        sa.Column('shade_result', sa.String(16), nullable=True),
        sa.Column('shade_notes', sa.Text, nullable=True),
        sa.Column('operator_name', sa.String(128), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_dyeing_runs_work_order_id', 'dyeing_runs', ['work_order_id'])

    op.create_table(
        'dyeing_run_chemicals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('run_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dyeing_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('items.id'), nullable=False),
        sa.Column('planned_qty', sa.Numeric(14, 4), nullable=False),
        sa.Column('actual_qty', sa.Numeric(14, 4), nullable=False),
        sa.Column('uom_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('uoms.id'), nullable=True),
    )
    op.create_index('ix_dyeing_run_chemicals_run_id', 'dyeing_run_chemicals', ['run_id'])
    op.create_index('ix_dyeing_run_chemicals_item_id', 'dyeing_run_chemicals', ['item_id'])

    # Setting runs (sub-records per WO)
    op.create_table(
        'setting_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('work_order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('work_orders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('run_number', sa.Integer, nullable=False, server_default='1'),
        sa.Column('substrate_qty', sa.Numeric(14, 4), nullable=False),
        sa.Column('input_batch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('batches.id'), nullable=True),
        sa.Column('output_batch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('batches.id'), nullable=True),
        sa.Column('machine_name', sa.String(128), nullable=True),
        sa.Column('temperature_c', sa.Numeric(6, 2), nullable=True),
        sa.Column('speed_mpm', sa.Numeric(6, 2), nullable=True),
        sa.Column('width_cm', sa.Numeric(6, 2), nullable=True),
        sa.Column('overfeed_pct', sa.Numeric(6, 2), nullable=True),
        sa.Column('actual_width_cm', sa.Numeric(6, 2), nullable=True),
        sa.Column('actual_gsm', sa.Numeric(8, 4), nullable=True),
        sa.Column('actual_shrinkage_pct', sa.Numeric(6, 2), nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='PENDING'),
        sa.Column('operator_name', sa.String(128), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_setting_runs_work_order_id', 'setting_runs', ['work_order_id'])


def downgrade() -> None:
    op.drop_table('setting_runs')
    op.drop_table('dyeing_run_chemicals')
    op.drop_table('dyeing_runs')
    op.drop_table('dye_recipe_lines')
    op.drop_table('dye_recipes')
    op.drop_column('work_centers', 'center_type')
