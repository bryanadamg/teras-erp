import uuid
from datetime import datetime, timezone, date
from sqlalchemy import String, Float, DateTime, Date, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class KPICache(Base):
    __tablename__ = "kpi_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class KPIHistory(Base):
    """One value per KPI per day — the time series behind dashboard trend charts."""
    __tablename__ = "kpi_history"
    __table_args__ = (UniqueConstraint("key", "snapshot_date", name="uq_kpi_history_key_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(64), index=True)
    value: Mapped[float] = mapped_column(Float)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
