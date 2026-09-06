"""dyeing monitor: machine yards-per-rev + per-run rpm/lines/target

The dyeing monitor measures a vessel the way the loom monitor measures a loom, but
the rate chain is different and the two must never be merged:

    yd/min = rpm * yards_per_rev * lines

`yards_per_rev` is how far the rope advances on one revolution of the reel — fixed
machine geometry, so it sits on the work center beside `beam_slots`. `rpm` and
`lines` vary per batch (a different cloth, a different rope count), so they sit on
the run, exactly as `WeavingRun.lines` sits on the run rather than on the loom.

Nullable rather than defaulted: a machine with no `yards_per_rev` measured yet, or
a run with no rpm entered, has no honest efficiency to report. The monitor shows a
dash there. A default would invent a denominator and read as a real number.

`lines` and `target_efficiency_pct` DO default, matching `weaving_runs` — one line
and a 50% target are the sane starting points, and both are visible on the card.

Revision ID: e7b9d1f3a5c2
Revises: c1e3a5b7d9f2
"""
from alembic import op
import sqlalchemy as sa

revision = "e7b9d1f3a5c2"
down_revision = "c1e3a5b7d9f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("work_centers", sa.Column("yards_per_rev", sa.Numeric(10, 4), nullable=True))
    op.add_column("dyeing_runs", sa.Column("rpm", sa.Numeric(10, 3), nullable=True))
    op.add_column("dyeing_runs", sa.Column("lines", sa.Integer(), nullable=False, server_default="1"))
    op.add_column(
        "dyeing_runs",
        sa.Column("target_efficiency_pct", sa.Numeric(6, 2), nullable=False, server_default="50"),
    )


def downgrade() -> None:
    op.drop_column("dyeing_runs", "target_efficiency_pct")
    op.drop_column("dyeing_runs", "lines")
    op.drop_column("dyeing_runs", "rpm")
    op.drop_column("work_centers", "yards_per_rev")
