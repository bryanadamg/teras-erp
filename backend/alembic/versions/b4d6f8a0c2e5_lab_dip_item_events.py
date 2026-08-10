"""lab dip variant event log

The Lab Dip Report counts *attempts* (dipped / rejected / approved) inside a date
range, the same question the Sample Development Report answers. The lab dip item row
only held its current status, and `lab_dip_rejections` only covers rejections, so
neither could date a dip or an approval. This adds the event log and backfills:
real rejection timestamps from lab_dip_rejections, plus one synthetic IN_PROGRESS
(and APPROVED / legacy REJECTED) event per existing variant so historical rows are
not blank in the report.

Revision ID: b4d6f8a0c2e5
Revises: e8b0d2f4a6c1
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b4d6f8a0c2e5'
down_revision = 'e8b0d2f4a6c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'lab_dip_item_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lab_dip_item_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lab_dip_request_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event', sa.String(length=32), nullable=False),
        sa.Column('previous_status', sa.String(length=32), nullable=True),
        sa.Column('round_no', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('reason', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['lab_dip_item_id'], ['lab_dip_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['lab_dip_request_id'], ['lab_dip_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lab_dip_item_events_lab_dip_item_id', 'lab_dip_item_events', ['lab_dip_item_id'])
    op.create_index('ix_lab_dip_item_events_lab_dip_request_id', 'lab_dip_item_events', ['lab_dip_request_id'])
    op.create_index('ix_lab_dip_item_events_event', 'lab_dip_item_events', ['event'])
    op.create_index('ix_lab_dip_item_events_created_at', 'lab_dip_item_events', ['created_at'])
    op.create_index('ix_lab_dip_item_events_event_created', 'lab_dip_item_events', ['event', 'created_at'])

    # 1) Every variant that left PENDING was dipped at least once. The real transition
    #    time was never recorded, so date it from the parent request (same one-attempt
    #    assumption the sample backfill made).
    op.execute("""
        INSERT INTO lab_dip_item_events
            (id, lab_dip_item_id, lab_dip_request_id, event, previous_status, round_no, reason, notes, created_by_id, created_at)
        SELECT gen_random_uuid(), li.id, li.lab_dip_request_id, 'IN_PROGRESS', NULL, 1,
               NULL, NULL, NULL, COALESCE(lr.updated_at, lr.created_at)
        FROM lab_dip_items li
        JOIN lab_dip_requests lr ON lr.id = li.lab_dip_request_id
        WHERE li.status <> 'PENDING'
    """)

    # 2) Rejections have real timestamps and real round numbers — carry them across
    #    verbatim rather than synthesising.
    op.execute("""
        INSERT INTO lab_dip_item_events
            (id, lab_dip_item_id, lab_dip_request_id, event, previous_status, round_no, reason, notes, created_by_id, created_at)
        SELECT gen_random_uuid(), lj.lab_dip_item_id, li.lab_dip_request_id, 'REJECTED', 'IN_PROGRESS',
               lj.round_no, lj.reason, lj.notes, lj.rejected_by, lj.rejected_at
        FROM lab_dip_rejections lj
        JOIN lab_dip_items li ON li.id = lj.lab_dip_item_id
    """)

    # 3) Variants rejected before the rejection log existed have no row above.
    op.execute("""
        INSERT INTO lab_dip_item_events
            (id, lab_dip_item_id, lab_dip_request_id, event, previous_status, round_no, reason, notes, created_by_id, created_at)
        SELECT gen_random_uuid(), li.id, li.lab_dip_request_id, 'REJECTED', 'IN_PROGRESS', 1,
               li.rejection_reason, li.rejection_notes, NULL, COALESCE(lr.updated_at, lr.created_at)
        FROM lab_dip_items li
        JOIN lab_dip_requests lr ON lr.id = li.lab_dip_request_id
        WHERE li.status = 'REJECTED'
          AND NOT EXISTS (SELECT 1 FROM lab_dip_rejections lj WHERE lj.lab_dip_item_id = li.id)
    """)

    # 4) Approvals.
    op.execute("""
        INSERT INTO lab_dip_item_events
            (id, lab_dip_item_id, lab_dip_request_id, event, previous_status, round_no, reason, notes, created_by_id, created_at)
        SELECT gen_random_uuid(), li.id, li.lab_dip_request_id, 'APPROVED', 'IN_PROGRESS', 1,
               NULL, NULL, NULL, COALESCE(lr.updated_at, lr.created_at)
        FROM lab_dip_items li
        JOIN lab_dip_requests lr ON lr.id = li.lab_dip_request_id
        WHERE li.status = 'APPROVED'
    """)


def downgrade() -> None:
    op.drop_index('ix_lab_dip_item_events_event_created', table_name='lab_dip_item_events')
    op.drop_index('ix_lab_dip_item_events_created_at', table_name='lab_dip_item_events')
    op.drop_index('ix_lab_dip_item_events_event', table_name='lab_dip_item_events')
    op.drop_index('ix_lab_dip_item_events_lab_dip_request_id', table_name='lab_dip_item_events')
    op.drop_index('ix_lab_dip_item_events_lab_dip_item_id', table_name='lab_dip_item_events')
    op.drop_table('lab_dip_item_events')
