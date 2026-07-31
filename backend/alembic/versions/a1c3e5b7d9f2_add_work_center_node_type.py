"""add work_centers.node_type (3-level tree: TYPE -> GROUP -> MACHINE)

Work centers were a 2-level tree by convention only: a root row per center type
(parent_id IS NULL) with the physical machines hanging off it. The client needs a
middle GROUP tier so the weaving monitor can batch-set a production calendar on a
whole group of looms instead of one machine at a time.

Depth cannot be inferred from parent_id once a third level exists — a GROUP and a
MACHINE both have a non-null parent — so this adds an explicit discriminator,
mirroring `locations.location_type`.

Data safety: no referencing row changes. work_orders / bom_operations / boms /
weaving_runs / beam_mounts / work_center_holidays / mo_completions all point at a
MACHINE row by id, and inserting a group later only rewrites that machine's
parent_id. Backfill keeps every existing tree valid as-is (roots become TYPE,
everything else MACHINE); the GROUP tier is opt-in per machine.

Revision ID: a1c3e5b7d9f2
Revises: d5f7a9c1e3b6
Create Date: 2026-07-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c3e5b7d9f2'
down_revision: Union[str, None] = 'd5f7a9c1e3b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'work_centers',
        sa.Column('node_type', sa.String(16), nullable=False, server_default='MACHINE'),
    )
    # Existing shape: parent-less rows are the per-center-type roots, the rest are
    # the real machines. No row moves — only its label is written.
    op.execute("UPDATE work_centers SET node_type = 'TYPE' WHERE parent_id IS NULL")
    op.create_index('ix_work_centers_node_type', 'work_centers', ['node_type'])


def downgrade() -> None:
    # A GROUP row would be indistinguishable from a machine without the column, so
    # flatten groups away first: re-point their children at the group's own parent
    # (the TYPE root), restoring the original 2-level shape, then drop the groups.
    op.execute("""
        UPDATE work_centers c
           SET parent_id = g.parent_id
          FROM work_centers g
         WHERE c.parent_id = g.id
           AND g.node_type = 'GROUP'
    """)
    op.execute("DELETE FROM work_centers WHERE node_type = 'GROUP'")
    op.drop_index('ix_work_centers_node_type', table_name='work_centers')
    op.drop_column('work_centers', 'node_type')
