"""drop the never-populated dyeing_runs columns

Eight columns on `dyeing_runs` restated facts the run already reaches through its
work order, and not one of them was ever filled: 0 of 12 rows on the dev DB carried
a value in any of them (re-verified 2026-09-07, immediately before this migration).

- `customer_name`, `artikel`, `po_number`, `qty_order_kg` — the SO → MO → WO chain
  this run hangs off already answers all four.
- `color_name`, `color_matching_ref` — the MO's colour attributes and the dye
  recipe's own `color_id` are the colour of record; the monitor card already emits
  the MO's variant labels.
- `lot_number` — predates the output `Batch`. The dyed lot is
  `dyeing_runs.output_batch_id` now (one lot per physical dye batch).
- `machine_name` — free text beside `work_order.work_center_id`. The model already
  marked it LEGACY and `dyeing_monitor_service` refuses to aggregate on it, because
  a per-machine number pegged to a typed string is a per-machine number that lies.

`SettingRun.machine_name` is deliberately untouched — different table, and not part
of this change.

Reversible: the downgrade re-adds all eight as nullable, which restores the schema
exactly. It cannot restore data, and there was none.

Revision ID: a7c9e1b3d5f8
Revises: b6d8f0a2c4e7
Create Date: 2026-09-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a7c9e1b3d5f8'
down_revision: Union[str, None] = 'b6d8f0a2c4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# column -> type, for the downgrade
DROPPED = (
    ('machine_name', sa.String(128)),
    ('customer_name', sa.String(128)),
    ('artikel', sa.String(128)),
    ('po_number', sa.String(64)),
    ('qty_order_kg', sa.Numeric(10, 2)),
    ('color_name', sa.String(64)),
    ('color_matching_ref', sa.String(64)),
    ('lot_number', sa.String(64)),
)


def upgrade() -> None:
    for name, _type in DROPPED:
        op.drop_column('dyeing_runs', name)


def downgrade() -> None:
    for name, type_ in DROPPED:
        op.add_column('dyeing_runs', sa.Column(name, type_, nullable=True))
