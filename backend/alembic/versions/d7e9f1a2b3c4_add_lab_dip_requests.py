"""add lab_dip_requests and lab_dip_lines

Revision ID: d7e9f1a2b3c4
Revises: c5d8e1f2a3b4
Create Date: 2026-06-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd7e9f1a2b3c4'
down_revision = 'c5d8e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'lab_dip_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('base_item_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('approved_recipe_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('request_date', sa.Date(), nullable=False),
        sa.Column('season', sa.String(length=255), nullable=True),
        sa.Column('customer_article_code', sa.String(length=255), nullable=True),
        sa.Column('internal_article_code', sa.String(length=255), nullable=True),
        sa.Column('substrate', sa.String(length=255), nullable=True),
        sa.Column('color_standard', sa.String(length=255), nullable=True),
        sa.Column('request_type', sa.String(length=16), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('estimated_completion_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['partners.id'], name='fk_lab_dip_requests_customer_id_partners'),
        sa.ForeignKeyConstraint(['base_item_id'], ['items.id'], name='fk_lab_dip_requests_base_item_id_items'),
        sa.ForeignKeyConstraint(['approved_recipe_id'], ['dye_recipes.id'], name='fk_lab_dip_requests_approved_recipe_id_dye_recipes', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_lab_dip_requests'),
    )
    op.create_index('ix_lab_dip_requests_code', 'lab_dip_requests', ['code'], unique=True)
    op.create_index('ix_lab_dip_requests_customer_id', 'lab_dip_requests', ['customer_id'])
    op.create_index('ix_lab_dip_requests_base_item_id', 'lab_dip_requests', ['base_item_id'])
    op.create_index('ix_lab_dip_requests_approved_recipe_id', 'lab_dip_requests', ['approved_recipe_id'])
    op.create_index('ix_lab_dip_requests_status', 'lab_dip_requests', ['status'])

    op.create_table(
        'lab_dip_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lab_dip_request_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('color_name', sa.String(length=255), nullable=False),
        sa.Column('submission_round', sa.Integer(), nullable=False),
        sa.Column('recipe_ref', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('remarks', sa.String(length=512), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['lab_dip_request_id'], ['lab_dip_requests.id'], name='fk_lab_dip_lines_lab_dip_request_id_lab_dip_requests', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_lab_dip_lines'),
    )
    op.create_index('ix_lab_dip_lines_lab_dip_request_id', 'lab_dip_lines', ['lab_dip_request_id'])


def downgrade() -> None:
    op.drop_index('ix_lab_dip_lines_lab_dip_request_id', table_name='lab_dip_lines')
    op.drop_table('lab_dip_lines')
    op.drop_index('ix_lab_dip_requests_status', table_name='lab_dip_requests')
    op.drop_index('ix_lab_dip_requests_approved_recipe_id', table_name='lab_dip_requests')
    op.drop_index('ix_lab_dip_requests_base_item_id', table_name='lab_dip_requests')
    op.drop_index('ix_lab_dip_requests_customer_id', table_name='lab_dip_requests')
    op.drop_index('ix_lab_dip_requests_code', table_name='lab_dip_requests')
    op.drop_table('lab_dip_requests')
