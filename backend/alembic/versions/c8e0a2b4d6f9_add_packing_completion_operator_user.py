"""peg every pack event to the user account that logged it

`packing_completions.operator` is a free-text box the packer types into, so
summing output per packer over it splits one person across `Budi` / `budi` /
`Budi S`. Operators now get their own ERP accounts, which makes the authenticated
user the truthful identity — `operator_user_id` records it on every log and the
per-operator output report groups on that column.

The text field stays as the display snapshot (and the only identity legacy rows
have), exactly as `work_center_name` snapshots ride alongside `work_center_id`.
Backfilled by matching the typed text against `users.username` and `full_name`,
case-insensitively; rows that match nothing keep a null id and report under their
typed name.

Revision ID: c8e0a2b4d6f9
Revises: a3c7e9b1d5f4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c8e0a2b4d6f9'
down_revision: Union[str, None] = 'a3c7e9b1d5f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'packing_completions',
        sa.Column('operator_user_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        'ix_packing_completions_operator_user_id', 'packing_completions', ['operator_user_id']
    )
    op.create_foreign_key(
        'fk_packing_completions_operator_user_id', 'packing_completions', 'users',
        ['operator_user_id'], ['id'], ondelete='SET NULL',
    )
    # Username first: `add_packing_completion` already defaults the text to
    # `current_user.username`, so most existing rows match exactly there.
    op.execute("""
        UPDATE packing_completions pc
           SET operator_user_id = u.id
          FROM users u
         WHERE pc.operator_user_id IS NULL
           AND pc.operator IS NOT NULL
           AND lower(btrim(pc.operator)) = lower(u.username)
    """)
    # Then the display name, for logs where a supervisor typed who was packing.
    # Ambiguous names are left null rather than credited to an arbitrary account.
    op.execute("""
        UPDATE packing_completions pc
           SET operator_user_id = u.id
          FROM users u
         WHERE pc.operator_user_id IS NULL
           AND pc.operator IS NOT NULL
           AND lower(btrim(pc.operator)) = lower(u.full_name)
           AND (SELECT count(*) FROM users u2
                 WHERE lower(u2.full_name) = lower(btrim(pc.operator))) = 1
    """)


def downgrade() -> None:
    op.drop_constraint('fk_packing_completions_operator_user_id', 'packing_completions', type_='foreignkey')
    op.drop_index('ix_packing_completions_operator_user_id', table_name='packing_completions')
    op.drop_column('packing_completions', 'operator_user_id')
