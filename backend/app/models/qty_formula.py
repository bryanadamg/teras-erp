import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class QtyFormulaRule(Base):
    """One row of the plant-wide production-quantity formula.

    The Production Run modal's "Apply" button turns the sizes a sales order
    asked for into the sizes to actually make (historically: S=0, M=(S+M)/2,
    L=(S+M)/2+L, everything else as ordered, all scaled by the tolerance %).
    That rule was hardcoded in ProductionRunModal.tsx; these rows are the
    configurable version of it, and the seeded defaults reproduce it exactly.

    `size_name` is the standard Size name this row computes ("S", "M", …), or
    `"*"` for the fallback used by every size with no row of its own — and by
    non-sized BOMs, which have one total qty and no size rows. Names rather
    than a `sizes` FK because the expressions reference sizes by name too, so
    a formula stays readable (and survives a size row being re-seeded).

    The expression is evaluated by `services/qty_formula_service.py` on save
    (validation) and by `components/shared/qtyFormula.ts` at Apply time. The
    tolerance % is NOT part of the expression: the result is multiplied by
    (1 + tol/100) and rounded up afterwards, so one formula serves every
    tolerance the planner types.
    """

    __tablename__ = "qty_formula_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    size_name: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
