"""sample color event log + per-variant timestamps

Sample development reporting counts *attempts*: how many times a variant was
processed, rejected and approved inside a date range. The variant row only held
its current status and the request's updated_at is bumped by any edit, so neither
could date an attempt. This adds the event log plus per-variant timestamps and
denormalised tallies, and backfills one synthetic event per existing variant so
historical rows are not blank in the report.

Revision ID: f4a6c8e0b2d5
Revises: d4f6a8c0e2b7
Create Date: 2026-08-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f4a6c8e0b2d5'
down_revision = 'd4f6a8c0e2b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'sample_color_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('sample_color_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('sample_request_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event', sa.String(length=32), nullable=False),
        sa.Column('previous_status', sa.String(length=32), nullable=True),
        sa.Column('round_no', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('reason', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['sample_color_id'], ['sample_colors.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sample_request_id'], ['sample_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sample_color_events_sample_color_id', 'sample_color_events', ['sample_color_id'])
    op.create_index('ix_sample_color_events_sample_request_id', 'sample_color_events', ['sample_request_id'])
    op.create_index('ix_sample_color_events_event', 'sample_color_events', ['event'])
    op.create_index('ix_sample_color_events_created_at', 'sample_color_events', ['created_at'])
    op.create_index('ix_sample_color_events_event_created', 'sample_color_events', ['event', 'created_at'])

    op.add_column('sample_colors', sa.Column('status_updated_at', sa.DateTime(), nullable=True))
    op.add_column('sample_colors', sa.Column('first_process_at', sa.DateTime(), nullable=True))
    op.add_column('sample_colors', sa.Column('last_process_at', sa.DateTime(), nullable=True))
    op.add_column('sample_colors', sa.Column('sent_at', sa.DateTime(), nullable=True))
    op.add_column('sample_colors', sa.Column('approved_at', sa.DateTime(), nullable=True))
    op.add_column('sample_colors', sa.Column('rejected_at', sa.DateTime(), nullable=True))
    op.add_column('sample_colors', sa.Column('process_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('sample_colors', sa.Column('reject_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('sample_colors', sa.Column('approve_count', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('ix_sample_colors_status_updated_at', 'sample_colors', ['status_updated_at'])

    # Backfill: every variant that already left PENDING gets one synthetic event dated
    # from its parent request (updated_at is the best available proxy — the real
    # transition time was never recorded). Counts follow the same one-attempt
    # assumption, so pre-existing rows report as a single attempt rather than zero.
    op.execute("""
        UPDATE sample_colors sc
        SET status_updated_at = COALESCE(sr.updated_at, sr.created_at),
            first_process_at = CASE WHEN sc.status <> 'PENDING' THEN COALESCE(sr.updated_at, sr.created_at) END,
            last_process_at  = CASE WHEN sc.status <> 'PENDING' THEN COALESCE(sr.updated_at, sr.created_at) END,
            sent_at          = CASE WHEN sc.status IN ('SENT', 'APPROVED', 'REJECTED') THEN COALESCE(sr.updated_at, sr.created_at) END,
            approved_at      = CASE WHEN sc.status = 'APPROVED' THEN COALESCE(sr.updated_at, sr.created_at) END,
            rejected_at      = CASE WHEN sc.status = 'REJECTED' THEN COALESCE(sr.updated_at, sr.created_at) END,
            process_count    = CASE WHEN sc.status <> 'PENDING' THEN 1 ELSE 0 END,
            reject_count     = CASE WHEN sc.status = 'REJECTED' THEN 1 ELSE 0 END,
            approve_count    = CASE WHEN sc.status = 'APPROVED' THEN 1 ELSE 0 END
        FROM sample_requests sr
        WHERE sr.id = sc.sample_request_id
    """)
    op.execute("""
        INSERT INTO sample_color_events
            (id, sample_color_id, sample_request_id, event, previous_status, round_no, reason, notes, created_by_id, created_at)
        SELECT gen_random_uuid(), sc.id, sc.sample_request_id, sc.status, NULL, 1,
               sc.rejection_reason, sc.rejection_notes, sr.created_by_id,
               COALESCE(sr.updated_at, sr.created_at)
        FROM sample_colors sc
        JOIN sample_requests sr ON sr.id = sc.sample_request_id
        WHERE sc.status <> 'PENDING'
    """)


def downgrade() -> None:
    op.drop_index('ix_sample_colors_status_updated_at', table_name='sample_colors')
    for col in (
        'approve_count', 'reject_count', 'process_count', 'rejected_at', 'approved_at',
        'sent_at', 'last_process_at', 'first_process_at', 'status_updated_at',
    ):
        op.drop_column('sample_colors', col)
    op.drop_index('ix_sample_color_events_event_created', table_name='sample_color_events')
    op.drop_index('ix_sample_color_events_created_at', table_name='sample_color_events')
    op.drop_index('ix_sample_color_events_event', table_name='sample_color_events')
    op.drop_index('ix_sample_color_events_sample_request_id', table_name='sample_color_events')
    op.drop_index('ix_sample_color_events_sample_color_id', table_name='sample_color_events')
    op.drop_table('sample_color_events')
