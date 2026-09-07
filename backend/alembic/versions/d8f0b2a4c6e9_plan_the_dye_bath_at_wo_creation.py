"""plan the dye bath when the work order is cut

Two nullable columns so a dyeing WO's dose sheet exists before the vessel is loaded.

- `dye_recipes.liquor_ratio` — litres of water per kg of substrate the recipe is
  written for (1:10 -> 10). WO creation multiplies it by the load to propose the
  bath, so the planner types a volume only when this batch departs from the recipe.
- `dyeing_runs.planned_volume_air_liters` — the planner's bath. Deliberately NOT
  written into `volume_air_liters`: that column is the water the floor actually
  filled, and `dyeing_run_service.derive_status` reads it as "this vessel is
  running", so a planned figure there would mark every freshly cut dyeing WO
  IN_PROGRESS and light up the vessel monitor.

Nothing is backfilled: an existing run has no plan, which reads correctly — it was
cut before there was one, and its actual bath is unaffected.

Revision ID: d8f0b2a4c6e9
Revises: a7c9e1b3d5f8
Create Date: 2026-09-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd8f0b2a4c6e9'
down_revision: Union[str, None] = 'a7c9e1b3d5f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('dye_recipes', sa.Column('liquor_ratio', sa.Numeric(6, 2), nullable=True))
    op.add_column('dyeing_runs', sa.Column('planned_volume_air_liters', sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('dyeing_runs', 'planned_volume_air_liters')
    op.drop_column('dye_recipes', 'liquor_ratio')
