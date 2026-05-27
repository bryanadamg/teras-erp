import uuid
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Text, Numeric, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.location import Location

class WorkCenter(Base):
    __tablename__ = "work_centers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cost_per_hour: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    center_type: Mapped[str] = mapped_column(String(16), default="GENERAL")
    input_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    output_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)

    input_location: Mapped[Optional["Location"]] = relationship("Location", foreign_keys=[input_location_id], lazy="joined")
    output_location: Mapped[Optional["Location"]] = relationship("Location", foreign_keys=[output_location_id], lazy="joined")

class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
