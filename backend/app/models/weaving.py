import uuid
from datetime import datetime, date
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, ForeignKey, Numeric, Integer, DateTime, Date, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.routing import WorkCenter
    from app.models.manufacturing import ManufacturingOrder


class WeavingRun(Base):
    """A tracked production run of one MO on one machine (work center).

    Performance monitoring: faithful to the client's loom-efficiency formula.
    target_100_per_day_kg = (24*60) * rate_per_line_g_min * lines / 1000
    efficiency = actual_kg / (target_100_per_day_kg * elapsed_working_days)
    """
    __tablename__ = "weaving_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_center_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_centers.id", ondelete="CASCADE"), index=True
    )
    mo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manufacturing_orders.id", ondelete="CASCADE"), index=True
    )
    lines: Mapped[int] = mapped_column(Integer, default=1)
    rate_per_line_g_min: Mapped[float] = mapped_column(Numeric(10, 3), default=5)
    target_efficiency_pct: Mapped[float] = mapped_column(Numeric(6, 2), default=50)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="RUNNING", index=True)  # RUNNING / STOPPED / DONE
    actual_qty_override: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    work_center: Mapped["WorkCenter"] = relationship("WorkCenter", lazy="noload")
    mo: Mapped["ManufacturingOrder"] = relationship("ManufacturingOrder", lazy="noload")


class WorkCenterHoliday(Base):
    """A non-working calendar day for a specific machine (work center).

    Combined with WorkCenter.working_weekdays to count elapsed working days
    and project completion dates per the machine's production calendar.
    """
    __tablename__ = "work_center_holidays"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_center_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_centers.id", ondelete="CASCADE"), index=True
    )
    holiday_date: Mapped[date] = mapped_column(Date)
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
